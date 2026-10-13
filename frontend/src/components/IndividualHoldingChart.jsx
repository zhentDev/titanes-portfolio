import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorType, LineStyle, createChart } from "lightweight-charts";
import { fetchHoldingChart } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { getChartColors } from "../utils/chartTheme";

export default function IndividualHoldingChart({
  holdings = [],
  closedHoldings = [],
  rebalances = [],
  investment = 2000,
  numSlots = 15,
  customStrategies = [],
  activeStrategyId = "historical",
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const valSeriesRef = useRef(null);
  const baseSeriesRef = useRef(null);

  // Group options by Active and Closed
  const availableOptions = useMemo(() => {
    const list = [];
    // Active holdings
    (holdings || []).forEach((h) => {
      list.push({
        ticker: h.ticker,
        name: h.name || h.ticker,
        status: "ACTIVE",
        shares: h.shares,
        startPrice: h.start_price,
        entryDate: h.entry_date || "2026-08-03",
        exitDate: null,
        costBasis: (h.shares || 0) * (h.start_price || 0) || (investment / (numSlots || 15)),
        currentPrice: h.current_price,
        currentValue: h.current_value,
        returnPct: h.return_pct,
        returnUsd: h.return_usd,
      });
    });

    // Closed holdings
    (closedHoldings || []).forEach((c) => {
      list.push({
        ticker: c.ticker,
        name: c.name || c.ticker,
        status: "CLOSED",
        shares: c.shares,
        startPrice: c.entry_price,
        entryDate: c.entry_date,
        exitDate: c.exit_date,
        costBasis: c.cost_basis || (c.shares * c.entry_price),
        currentPrice: c.exit_price,
        currentValue: c.exit_value,
        returnPct: c.realized_return_pct,
        returnUsd: c.realized_pnl,
      });
    });

    return list;
  }, [holdings, closedHoldings, investment, numSlots]);

  // Selected item state
  const [selectedKey, setSelectedKey] = useState(() => {
    return availableOptions[0] ? `${availableOptions[0].ticker}_${availableOptions[0].status}` : "";
  });

  // Keep selection valid if options change
  useEffect(() => {
    if (!selectedKey && availableOptions.length > 0) {
      setSelectedKey(`${availableOptions[0].ticker}_${availableOptions[0].status}`);
    }
  }, [availableOptions, selectedKey]);

  const selectedItem = useMemo(() => {
    return availableOptions.find((opt) => `${opt.ticker}_${opt.status}` === selectedKey) || availableOptions[0] || null;
  }, [availableOptions, selectedKey]);

  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);

  // Fetch hourly data whenever selectedItem changes
  useEffect(() => {
    if (!selectedItem) return;
    let isCancelled = false;
    setLoading(true);

    fetchHoldingChart({
      ticker: selectedItem.ticker,
      startDate: selectedItem.entryDate,
      exitDate: selectedItem.exitDate,
      shares: selectedItem.shares,
      costBasis: selectedItem.costBasis,
      entryPrice: selectedItem.startPrice,
    })
      .then((res) => {
        if (!isCancelled && res) {
          setChartData(res);
        }
      })
      .catch((err) => {
        console.error("Error fetching holding hourly chart:", err);
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedItem]);

  // Initialize and update Lightweight Charts
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing chart if present
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: chartColors.textColor,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartColors.gridColor },
        horzLines: { color: chartColors.gridColor },
      },
      crosshair: {
        vertLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
        horzLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        textColor: chartColors.rightScaleText,
        autoScale: true,
      },
      localization: {
        locale: "es-CO",
        priceFormatter: (price) => "$" + Number(price).toFixed(2),
        timeFormatter: (time) => {
          if (typeof time === "number") {
            const d = new Date(time * 1000);
            return d.toLocaleDateString("es-CO", {
              timeZone: "America/Bogota",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
          }
          return String(time);
        },
      },
      width: containerRef.current.clientWidth,
      height: 380,
    });

    chartRef.current = chart;

    // 1. Base reference line (Inversión base inicial de esta única acción)
    const baseSeries = chart.addLineSeries({
      color: chartColors.base || "#94a3b8",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "",
    });
    baseSeriesRef.current = baseSeries;

    // 2. Valuation curve of the stock position (shares * price)
    const isGain = (chartData?.return_usd ?? 0) >= 0;
    const curveColor = isGain ? "#10b981" : "#ef4444";

    const valSeries = chart.addAreaSeries({
      topColor: isGain ? "rgba(16, 185, 129, 0.28)" : "rgba(239, 68, 68, 0.28)",
      bottomColor: isGain ? "rgba(16, 185, 129, 0.00)" : "rgba(239, 68, 68, 0.00)",
      lineColor: curveColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "",
    });
    valSeriesRef.current = valSeries;

    // Crosshair listener for hover details
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverPoint(null);
        return;
      }
      const val = param.seriesData.get(valSeries)?.value;
      const base = param.seriesData.get(baseSeries)?.value;
      if (val != null) {
        const costBasis = base != null && base > 0 ? base : (chartData?.cost_basis || 1);
        const retUsd = val - costBasis;
        const retPct = costBasis > 0 ? (retUsd / costBasis) * 100 : 0;
        setHoverPoint({
          time: param.time,
          value: val,
          base: costBasis,
          returnUsd: retUsd,
          returnPct: retPct,
        });
      } else {
        setHoverPoint(null);
      }
    });

    // Populate data
    if (chartData && Array.isArray(chartData.series) && chartData.series.length > 0) {
      const valPoints = chartData.series
        .map((pt) => ({ time: pt.time, value: pt.value }))
        .sort((a, b) => a.time - b.time)
        .filter((v, idx, arr) => idx === 0 || v.time !== arr[idx - 1].time);

      const costBasis = chartData.cost_basis || selectedItem?.costBasis || 100;
      const basePoints = valPoints.map((pt) => ({ time: pt.time, value: costBasis }));

      baseSeries.setData(basePoints);
      valSeries.setData(valPoints);
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, chartColors, selectedItem]);

  const displayVal = hoverPoint ? hoverPoint.value : (chartData?.current_value ?? selectedItem?.currentValue ?? 0);
  const displayBase = hoverPoint ? hoverPoint.base : (chartData?.cost_basis ?? selectedItem?.costBasis ?? 0);
  const displayRetUsd = hoverPoint ? hoverPoint.returnUsd : (chartData?.return_usd ?? selectedItem?.returnUsd ?? 0);
  const displayRetPct = hoverPoint ? hoverPoint.returnPct : (chartData?.return_pct ?? selectedItem?.returnPct ?? 0);

  return (
    <div style={{ width: "100%" }}>
      {/* ── Sub-header: Selector de Acción Individual y Métricas Clave ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 14px",
          marginBottom: "14px",
          background: isLight ? "rgba(241, 245, 249, 0.85)" : "rgba(0, 0, 0, 0.25)",
          borderRadius: 8,
          border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
        }}
      >
        {/* Dropdown Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            📈 Acción a inspeccionar:
          </span>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              background: isLight ? "#ffffff" : "#1e293b",
              color: isLight ? "#0f172a" : "#f1f5f9",
              border: `1px solid ${isLight ? "#cbd5e1" : "#334155"}`,
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <optgroup label="🟢 Acciones Activas (En Cartera)">
              {availableOptions
                .filter((o) => o.status === "ACTIVE")
                .map((o) => (
                  <option key={`${o.ticker}_${o.status}`} value={`${o.ticker}_${o.status}`}>
                    {o.ticker} — {o.name} ({o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%)
                  </option>
                ))}
            </optgroup>
            {availableOptions.some((o) => o.status === "CLOSED") && (
              <optgroup label="🔴 Acciones Vendidas / Posiciones Cerradas">
                {availableOptions
                  .filter((o) => o.status === "CLOSED")
                  .map((o) => (
                    <option key={`${o.ticker}_${o.status}`} value={`${o.ticker}_${o.status}`}>
                      {o.ticker} (CERRADA {o.exitDate}) — {o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%
                    </option>
                  ))}
              </optgroup>
            )}
          </select>

          {selectedItem?.status === "CLOSED" ? (
            <span
              style={{
                fontSize: "0.68rem",
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(239, 68, 68, 0.15)",
                color: isLight ? "#dc2626" : "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontWeight: 700,
              }}
            >
              🔒 Posición Cerrada ({selectedItem.entryDate} ➔ {selectedItem.exitDate})
            </span>
          ) : (
            <span
              style={{
                fontSize: "0.68rem",
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(16, 185, 129, 0.15)",
                color: isLight ? "#059669" : "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontWeight: 700,
              }}
            >
              🟢 Activa en Cartera (Desde {selectedItem?.entryDate || "Inicio"})
            </span>
          )}
        </div>

        {/* Resumen Métricas de la Acción */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              Inversión Base
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              ${Number(displayBase).toFixed(2)}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              {selectedItem?.status === "CLOSED" ? "Valor de Salida" : "Valor Actual (Hora a Hora)"}
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: displayRetUsd >= 0 ? (isLight ? "#059669" : "#34d399") : (isLight ? "#dc2626" : "#f87171") }}>
              ${Number(displayVal).toFixed(2)}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              Rendimiento Puro
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: displayRetUsd >= 0 ? (isLight ? "#16a34a" : "#22c55e") : (isLight ? "#dc2626" : "#ef4444") }}>
              {displayRetUsd >= 0 ? "+" : ""}${Number(displayRetUsd).toFixed(2)} ({displayRetPct >= 0 ? "+" : ""}{Number(displayRetPct).toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── Chart Container con Canvas Lightweight Charts ── */}
      <div style={{ position: "relative", width: "100%", height: 380 }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isLight ? "rgba(255, 255, 255, 0.7)" : "rgba(10, 15, 30, 0.7)",
              zIndex: 10,
              borderRadius: 8,
              backdropFilter: "blur(2px)",
            }}
          >
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>⏳</div>
              Cargando historial hora a hora de <strong>{selectedItem?.ticker}</strong>...
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Floating Top-Left Series Indicators Box (Matching Titanes NavChart style) */}
        <div
          className="chart-floating-legend"
          style={{
            position: "absolute",
            top: 10,
            left: 14,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(15, 23, 42, 0.82)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)"}`,
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: isLight
              ? "0 4px 12px rgba(0, 0, 0, 0.06)"
              : "0 4px 12px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
            zIndex: 10,
            maxWidth: 220,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 700 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: (chartData?.return_usd ?? 0) >= 0 ? "#10b981" : "#ef4444",
                flexShrink: 0,
              }}
            />
            <span style={{ color: isLight ? "#0f172a" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedItem?.ticker} Valor
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
            <span
              style={{
                width: 10,
                height: 2,
                background: chartColors.base || "#94a3b8",
                flexShrink: 0,
                borderRadius: 1,
              }}
            />
            <span style={{ color: isLight ? "#475569" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Inversión Base
            </span>
          </div>
        </div>
      </div>

      {/* ── Info footer de la acción ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 10,
          paddingTop: 8,
          borderTop: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`,
          fontSize: "0.72rem",
          color: "var(--text-muted)",
        }}
      >
        <span>
          📊 Velas y cotizaciones de 1 hora (1h) desde apertura hasta cierre de mercado de EE.UU.
        </span>
        <span>
          Acciones poseídas: <strong style={{ color: "var(--text-primary)" }}>{selectedItem?.shares ? Number(selectedItem.shares).toFixed(4) : "1.0000"}</strong>
          {selectedItem?.startPrice ? ` | Precio Compra: $${Number(selectedItem.startPrice).toFixed(2)}` : ""}
        </span>
      </div>
    </div>
  );
}
