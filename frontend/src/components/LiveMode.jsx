import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIntraday, fetchLiveQuotes, fetchNAV } from "../api/client";
import NavChart from "./NavChart";

const POLL_INTERVAL = 60_000;

// Client-side NYSE hours check (no API): Mon–Fri 09:30–16:00 ET.
function nyseIsOpenNow() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins <= 960;
}

export default function LiveMode({ navData: initialNavData, investment = 2000 }) {
  const [navData, setNavData] = useState(initialNavData || null);
  const [quotes, setQuotes] = useState([]);
  const [intradayChart, setIntradayChart] = useState([]);
  const [loading, setLoading] = useState(!initialNavData);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [error, setError] = useState(null);
  const [driftThreshold, setDriftThreshold] = useState(2.0); // Threshold in percent (e.g. ±2%)

  // Ref mirror of marketOpen so the polling interval reads the latest value without stale closures
  const marketOpenRef = useRef(false);
  useEffect(() => {
    marketOpenRef.current = marketOpen;
  }, [marketOpen]);

  // Synchronize internal navData if parent passes new navData
  useEffect(() => {
    if (initialNavData) {
      setNavData(initialNavData);
    }
  }, [initialNavData]);

  const load = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);

      try {
        setError(null);

        // 1. Ensure navData is available
        let currentNav = navData;
        if (!currentNav || !currentNav.holdings || currentNav.holdings.length === 0) {
          try {
            currentNav = await fetchNAV({ period: "1Y", investment, numSlots: 15 });
            setNavData(currentNav);
          } catch (navErr) {
            console.warn("[LIVE MODE] No se pudo cargar NAV inicial:", navErr);
          }
        }

        const activeHoldings = (currentNav?.holdings || []).filter(
          (h) => h.selected !== false && h.shares > 0,
        );
        const activeTickers = activeHoldings.map((h) => h.ticker);

        if (activeTickers.length === 0) {
          setLoading(false);
          setRefreshing(false);
          return;
        }

        // 2. Fetch live quotes for active positions only
        const quotesData = await fetchLiveQuotes(activeTickers);
        if (Array.isArray(quotesData) && quotesData.length > 0) {
          setQuotes(quotesData);
          setMarketOpen(quotesData[0]?.market_open ?? false);
        }
        setLastUpdate(new Date());

        // 3. Intraday chart: Only build if market is actively open and data is consistent
        const isLiveTrading = quotesData?.[0]?.market_open;
        if (isLiveTrading) {
          try {
            const intradayPromises = activeTickers.map((t) => fetchIntraday(t).catch(() => []));
            const intradayResults = await Promise.all(intradayPromises);

            // Only plot if all active tickers returned intraday points
            const allHaveData = intradayResults.every(
              (res) => Array.isArray(res) && res.length > 2,
            );

            if (allHaveData) {
              const allTimes = new Set();
              intradayResults.forEach((series) => {
                series.forEach((p) => {
                  if (p && p.time) allTimes.add(p.time);
                });
              });

              const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
              const chartSeries = [];

              for (const t of sortedTimes) {
                let stockValue = 0;
                let validPoint = true;

                intradayResults.forEach((series, i) => {
                  const ticker = activeTickers[i];
                  const holding = activeHoldings.find((h) => h.ticker === ticker);
                  const numSlots = navData?.summary?.total_slots || 15;
                  const slotValue = investment / numSlots;
                  const shares =
                    holding && holding.start_price > 0
                      ? slotValue / holding.start_price
                      : holding
                        ? holding.shares
                        : 0;

                  const point = series.find((p) => p.time === t);
                  const price = point?.value ?? quotesData?.find((q) => q.ticker === ticker)?.price;

                  if (price && !isNaN(price)) {
                    stockValue += price * shares;
                  } else {
                    validPoint = false;
                  }
                });

                // Strictly active equity only (no uninvested cash added)
                if (validPoint && stockValue > 0) {
                  chartSeries.push({
                    time: t,
                    value: round2(stockValue),
                  });
                }
              }

              if (chartSeries.length > 1) {
                setIntradayChart(chartSeries);
              }
            }
          } catch (intradayErr) {
            console.warn("[LIVE MODE] Velas intradía no disponibles:", intradayErr);
            // keep previous chart to avoid flicker/disappearance
          }
        } else {
          // Market closed: keep the curve always visible as a flat constant (no API needed here).
          const baseline =
            activeHoldings.reduce((sum, h) => {
              const q = quotesData?.find((qq) => qq.ticker === h.ticker);
              const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
              return sum + h.shares * price;
            }, 0) || currentNav?.summary?.active_invested || investment;

          setIntradayChart((prev) => {
            if (prev && prev.length > 0) return prev;
            const now = Math.floor(Date.now() / 1000);
            return [
              { time: now - 60, value: round2(baseline) },
              { time: now, value: round2(baseline) },
            ];
          });
        }
      } catch (e) {
        console.error("[LIVE MODE] Error:", e);
        setError(e.message || "Error cargando cotizaciones en vivo");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navData, investment],
  );

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (marketOpenRef.current) {
        load(false);
      } else if (nyseIsOpenNow()) {
        // Client believes the market should be open: verify with the server (covers holidays)
        load(false);
      } else {
        // Market closed & outside NYSE hours: advance the curve as a flat constant, no API calls
        setIntradayChart((prev) => {
          if (!prev || prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const now = Math.floor(Date.now() / 1000);
          if (now - last.time < 45) return prev;
          return [...prev, { time: now, value: last.value }];
        });
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Derived metrics — ONLY ACTIVE INVESTED CAPITAL (no flat uninvested cash)
  const holdings = navData?.holdings || [];
  const cashReserved = navData?.summary?.cash_reserved ?? 0;
  const activeInvested =
    navData?.summary?.active_invested ??
    (holdings.length > 0 ? (investment * holdings.length) / 15 : investment);

  // Live stock portfolio value (Pure active positions: sum of shares * current price)
  const liveStockValue = holdings.reduce((sum, h) => {
    const q = quotes.find((quote) => quote.ticker === h.ticker);
    const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
    return sum + h.shares * price;
  }, 0);

  const displayStockValue = liveStockValue > 0 ? liveStockValue : activeInvested;
  const totalReturn = displayStockValue - activeInvested;
  const totalReturnPct = activeInvested > 0 ? (totalReturn / activeInvested) * 100 : 0;
  const isGain = totalReturn >= 0;

  // ── DRIFT & REBALANCE CALCULATIONS ──
  const totalLivePortfolioValue = liveStockValue + cashReserved;
  const totalSlots = navData?.summary?.total_slots || 15;
  const targetWeight = 100 / totalSlots; // Target Weight per position (e.g. 6.67%)

  const driftData = holdings.map((h) => {
    const q = quotes.find((quote) => quote.ticker === h.ticker);
    const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
    const currentValue = h.shares * price;
    const currentWeight =
      totalLivePortfolioValue > 0 ? (currentValue / totalLivePortfolioValue) * 100 : 0;
    const drift = currentWeight - targetWeight;
    return {
      ticker: h.ticker,
      name: h.name || h.ticker,
      currentValue,
      currentWeight,
      targetWeight,
      drift,
      absDrift: Math.abs(drift),
    };
  });

  const activeHoldingsWithDrift = driftData.filter((d) => d.currentValue > 0);
  const driftedAssets = activeHoldingsWithDrift.filter((d) => d.absDrift > driftThreshold);
  const sortedDriftData = [...activeHoldingsWithDrift].sort((a, b) => b.absDrift - a.absDrift);

  if (loading && holdings.length === 0) {
    return (
      <div className="card fade-up" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Conectando con Yahoo Finance y cargando posiciones en vivo…
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Live summary header ─────────────────────────── */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "center",
          flexWrap: "wrap",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,212,255,0.03) 100%)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⚡ Capital Activo en Acciones (Live)</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: "2.2rem",
              fontWeight: 800,
              color: "var(--accent-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            ${displayStockValue.toFixed(2)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <span className={`badge ${isGain ? "gain" : "loss"}`} style={{ fontSize: "0.85rem" }}>
              {isGain ? "▲" : "▼"} ${Math.abs(totalReturn).toFixed(2)} (
              {Math.abs(totalReturnPct).toFixed(2)}%)
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              base: ${activeInvested.toFixed(2)} ({holdings.length} posiciones activas de 15)
            </span>
          </div>
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
            <span className={`market-dot ${marketOpen ? "open" : "closed"}`} />
            <span style={{ color: marketOpen ? "var(--gain)" : "#94a3b8", fontWeight: 600 }}>
              {marketOpen ? "NYSE / NASDAQ En Vivo" : "Mercado Cerrado — curva continua (último cierre)"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastUpdate && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                🕒 {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn btn-ghost"
              style={{
                fontSize: "0.75rem",
                padding: "5px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => load(true)}
              disabled={refreshing}
              title="Refrescar cotizaciones ahora"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                }}
              >
                🔄
              </span>
              <span>{refreshing ? "Actualizando…" : "Refrescar"}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "var(--radius)",
            color: "#fca5a5",
            fontSize: "0.85rem",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Drift Alert Banner ─────────────────────────── */}
      {driftedAssets.length > 0 && (
        <div
          className="card fade-up"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            padding: "16px 20px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            borderRadius: "var(--radius)",
          }}
        >
          <div style={{ fontSize: "1.5rem" }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: 0,
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Alerta de Rebalanceo Inteligente (Límite: ±{driftThreshold}%)
            </h4>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Se ha detectado desviación significativa (drift) en {driftedAssets.length} activo(s):{" "}
              {driftedAssets.map((d, idx) => (
                <span
                  key={d.ticker}
                  style={{ color: d.drift > 0 ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}
                >
                  {d.ticker} ({d.drift > 0 ? "+" : ""}
                  {d.drift.toFixed(2)}%){idx < driftedAssets.length - 1 ? ", " : ""}
                </span>
              ))}
              . Se sugiere rebalancear para volver a la equiponderación del{" "}
              {targetWeight.toFixed(2)}%.
            </p>
          </div>
        </div>
      )}

      {/* ── Live Curve (always visible; flat constant when market closed) ── */}
      {intradayChart.length > 1 && (
        <div className="card" style={{ paddingBottom: "20px", overflow: "hidden" }}>
          <h3
            style={{
              marginBottom: 16,
              fontSize: "1rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>
              {marketOpen ? "Gráfica Intradía de Hoy (5m)" : "Curva de Capital (Último Cierre)"}
            </span>
            {!marketOpen && (
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.06)",
                  color: "#94a3b8",
                  fontWeight: 600,
                }}
              >
                Mercado Cerrado — línea constante, sin consultas a la API
              </span>
            )}
          </h3>
          <div style={{ width: "100%", minHeight: "320px", overflow: "hidden" }}>
            <NavChart
              navData={intradayChart}
              investment={activeInvested}
              chartHeight={300}
              isLiveMode={true}
            />
          </div>
        </div>
      )}

      {/* ── Drift Monitor Card ─────────────────────────── */}
      <div className="card fade-up" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📊 Monitor de Desviación (Drift)</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--text-secondary)",
                }}
              >
                Target: {targetWeight.toFixed(2)}%
              </span>
            </h3>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Mide la desviación real del peso de cada activo frente al objetivo equiponderado.
            </span>
          </div>

          {/* Threshold controller */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Tolerancia:</span>
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-surface)",
                padding: 3,
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              {[1.0, 2.0, 3.0, 5.0].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDriftThreshold(t)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: "none",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: driftThreshold === t ? "rgba(0, 229, 255, 0.15)" : "transparent",
                    color: driftThreshold === t ? "var(--accent-primary)" : "var(--text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  ±{t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Left: Drift List */}
          <div style={{ overflowX: "auto", maxHeight: "300px", paddingRight: "4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 4px", color: "var(--text-muted)", fontWeight: 500 }}>
                    Activo
                  </th>
                  <th
                    style={{
                      padding: "8px 4px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Peso Real
                  </th>
                  <th
                    style={{
                      padding: "8px 4px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Desviación (Drift)
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      width: "120px",
                    }}
                  >
                    Visual
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDriftData.map((d) => {
                  const hasCrossed = d.absDrift > driftThreshold;
                  const driftColor = d.drift >= 0 ? "var(--gain)" : "var(--loss)";

                  // divergent bar calc
                  const maxRange = 10; // max scale representation ±10% drift
                  const widthPct = Math.min(50, (d.absDrift / maxRange) * 50);
                  const leftPos = d.drift >= 0 ? 50 : 50 - widthPct;

                  return (
                    <tr
                      key={d.ticker}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.02)",
                        background: hasCrossed ? "rgba(239, 68, 68, 0.02)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>
                        <span style={{ color: hasCrossed ? "#fca5a5" : "var(--text-primary)" }}>
                          {d.ticker}
                        </span>
                        {hasCrossed && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: "0.65rem",
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "var(--loss)",
                            }}
                          >
                            DRIFT!
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          fontFamily: "JetBrains Mono",
                        }}
                      >
                        {d.currentWeight.toFixed(2)}%
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          fontFamily: "JetBrains Mono",
                          color: driftColor,
                          fontWeight: 600,
                        }}
                      >
                        {d.drift >= 0 ? "+" : ""}
                        {d.drift.toFixed(2)}%
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <div
                          style={{
                            position: "relative",
                            height: "6px",
                            width: "100px",
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: "3px",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              bottom: 0,
                              width: "1px",
                              background: "rgba(255,255,255,0.2)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: `${leftPos}%`,
                              width: `${widthPct}%`,
                              height: "100%",
                              background: driftColor,
                              borderRadius: "3px",
                              boxShadow: hasCrossed ? `0 0 4px ${driftColor}` : "none",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Right: Analytical Insight Box */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              padding: "16px",
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h4
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--accent-primary)",
                }}
              >
                💡 Insight del Monitor de Deriva (Drift)
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  lineHeight: "1.4",
                }}
              >
                En una cartera equiponderada (Equal Weight), los activos ganadores crecen
                orgánicamente de tamaño, mientras que los rezagados se encogen.
                <br />
                <br />
                Un **rebalanceo por umbral** (threshold rebalancing) vende automáticamente porciones
                de los activos ganadores (sobre-ponderados) y compra más de los rezagados
                (sub-ponderados), cosechando ganancias de manera inteligente.
              </p>
            </div>

            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
                fontSize: "0.76rem",
                color: "var(--text-secondary)",
              }}
            >
              <strong>Resumen de Estado:</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Desviación Máxima:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: sortedDriftData[0]
                        ? sortedDriftData[0].drift >= 0
                          ? "var(--gain)"
                          : "var(--loss)"
                        : "var(--text-primary)",
                    }}
                  >
                    {sortedDriftData[0]
                      ? `${sortedDriftData[0].ticker} (${sortedDriftData[0].drift >= 0 ? "+" : ""}${sortedDriftData[0].drift.toFixed(2)}%)`
                      : "0.00%"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Activos fuera de límite:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: driftedAssets.length > 0 ? "var(--loss)" : "var(--gain)",
                    }}
                  >
                    {driftedAssets.length} activo(s)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quotes Grid ─────────────────────────────────── */}
      <div>
        <h3 style={{ marginBottom: "14px", fontSize: "1rem", fontWeight: 600 }}>
          Cotizaciones en Vivo de tus Posiciones Activas
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "14px",
          }}
        >
          {holdings.map((h) => {
            const q = quotes.find((quote) => quote.ticker === h.ticker);
            const currentP = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
            const change = q?.change ?? h.current_price - h.start_price;
            const changePct = q?.change_pct ?? h.return_pct ?? 0;
            const isChangeGain = change >= 0;

            const numSlots = navData?.summary?.total_slots || 15;
            const slotValue = investment / numSlots;
            const cardShares = h.start_price > 0 ? slotValue / h.start_price : h.shares;
            const initialInvested = slotValue;
            const currentVal = cardShares * currentP;
            const totalGain = currentVal - initialInvested;
            const totalGainPct = initialInvested > 0 ? (totalGain / initialInvested) * 100 : 0;
            const isTotalGain = totalGain >= 0;

            const periodRaw = navData?.summary?.period || "1Y";
            const periodText =
              periodRaw === "1Y"
                ? "1 Año"
                : periodRaw === "3Y"
                  ? "3 Años"
                  : periodRaw === "5Y"
                    ? "5 Años"
                    : periodRaw;

            return (
              <div
                key={h.ticker}
                className="card"
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  border: isChangeGain
                    ? "1px solid rgba(16,185,129,0.2)"
                    : "1px solid rgba(239,68,68,0.2)",
                  background: "var(--bg-surface)",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "1.05rem",
                          color: "var(--accent-primary)",
                        }}
                      >
                        {h.ticker}
                      </span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(255,255,255,0.06)",
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {h.exchange || "US"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.76rem",
                        color: "var(--text-muted)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "160px",
                      }}
                      title={h.name}
                    >
                      {h.name || h.ticker}
                    </div>
                  </div>

                  <span
                    className={`badge ${isChangeGain ? "gain" : "loss"}`}
                    style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                    title="Variación intradía en vivo de la sesión de hoy"
                  >
                    Hoy: {isChangeGain ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: 2,
                  }}
                >
                  <div>
                    <div
                      className="mono"
                      style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}
                      title="Valor actual en vivo de tu posición total"
                    >
                      ${currentVal ? currentVal.toFixed(2) : "—"}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      {h.shares.toFixed(4)} acc. @ ${currentP.toFixed(2)}
                    </div>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      color: isChangeGain ? "var(--gain)" : "var(--loss)",
                    }}
                    title="Variación en dólares durante la jornada de hoy"
                  >
                    {isChangeGain ? "+" : ""}${change ? change.toFixed(2) : "0.00"} (Hoy)
                  </span>
                </div>

                <div
                  style={{
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: "0.74rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Inversión Inicial Base:</span>
                    <span
                      className="mono"
                      style={{ fontWeight: 600, color: "var(--text-secondary)" }}
                    >
                      ${initialInvested.toFixed(2)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Valor Actual (Live):</span>
                    <span
                      className="mono"
                      style={{ fontWeight: 700, color: "var(--accent-primary)" }}
                    >
                      ${currentVal.toFixed(2)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Acumulado ({periodText}):</span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: isTotalGain ? "var(--gain)" : "var(--loss)",
                      }}
                    >
                      {isTotalGain ? "+" : ""}${totalGain.toFixed(2)} ({isTotalGain ? "+" : ""}
                      {totalGainPct.toFixed(1)}%)
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                      fontSize: "0.7rem",
                    }}
                  >
                    <span>Posición Comprada:</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {h.shares.toFixed(4)} acc. @ ${h.start_price?.toFixed(2) || "—"}/acc
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Unallocated cash placeholder */}
          {cashReserved > 0 && (
            <div
              className="card"
              style={{
                opacity: 0.6,
                border: "1px dashed var(--border)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Q (Cash Plano No Invertido)
              </div>
              <div
                className="mono"
                style={{ fontSize: "1.3rem", color: "var(--text-muted)", fontWeight: 700 }}
              >
                ${cashReserved.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                {15 - holdings.length} slots de liquidez no expuesta al mercado
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
