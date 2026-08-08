import { useState, useEffect, useCallback } from 'react';
import { fetchLiveQuotes, fetchIntraday, fetchNAV } from '../api/client';
import NavChart from './NavChart';

const POLL_INTERVAL = 60_000;

export default function LiveMode({ navData: initialNavData, investment = 2000 }) {
  const [navData, setNavData] = useState(initialNavData || null);
  const [quotes, setQuotes] = useState([]);
  const [intradayChart, setIntradayChart] = useState([]);
  const [loading, setLoading] = useState(!initialNavData);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [error, setError] = useState(null);

  // Synchronize internal navData if parent passes new navData
  useEffect(() => {
    if (initialNavData) {
      setNavData(initialNavData);
    }
  }, [initialNavData]);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      setError(null);

      // 1. If navData is not yet loaded, fetch it
      let currentNav = navData;
      if (!currentNav || !currentNav.holdings || currentNav.holdings.length === 0) {
        try {
          currentNav = await fetchNAV({ period: '1Y', investment, numSlots: 15 });
          setNavData(currentNav);
        } catch (navErr) {
          console.warn('[LIVE MODE] No se pudo cargar NAV inicial:', navErr);
        }
      }

      const activeHoldings = currentNav?.holdings || [];
      const activeTickers = activeHoldings.map((h) => h.ticker);

      if (activeTickers.length === 0) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Fetch live quotes for active positions
      const quotesData = await fetchLiveQuotes(activeTickers);
      if (Array.isArray(quotesData) && quotesData.length > 0) {
        setQuotes(quotesData);
        setMarketOpen(quotesData[0]?.market_open ?? false);
      }
      setLastUpdate(new Date());

      // 3. Attempt Intraday 5m candle aggregation (safe fallback if market is closed)
      try {
        const intradayPromises = activeTickers.map((t) =>
          fetchIntraday(t).catch(() => [])
        );
        const intradayResults = await Promise.all(intradayPromises);

        const allTimes = new Set();
        intradayResults.forEach((series) => {
          if (Array.isArray(series)) {
            series.forEach((p) => {
              if (p && p.time) allTimes.add(p.time);
            });
          }
        });

        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        if (sortedTimes.length > 1) {
          const lastPrice = {};
          const chartSeries = [];

          for (const t of sortedTimes) {
            let stockValue = 0;
            intradayResults.forEach((series, i) => {
              const ticker = activeTickers[i];
              const holding = activeHoldings.find((h) => h.ticker === ticker);
              const shares = holding ? holding.shares : 0;

              const point = (series || []).find((p) => p.time === t);
              if (point && !isNaN(point.value)) {
                lastPrice[ticker] = point.value;
              }
              const price =
                lastPrice[ticker] ??
                quotesData?.find((q) => q.ticker === ticker)?.price ??
                holding?.current_price ??
                0;
              if (!isNaN(price)) {
                stockValue += price * shares;
              }
            });

            if (!isNaN(stockValue) && stockValue > 0) {
              chartSeries.push({
                time: t,
                value: stockValue,
              });
            }
          }
          setIntradayChart(chartSeries);
        }
      } catch (intradayErr) {
        console.warn('[LIVE MODE] Velas intradía no disponibles:', intradayErr);
      }
    } catch (e) {
      console.error('[LIVE MODE] Error:', e);
      setError(e.message || 'Error cargando cotizaciones en vivo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navData, investment]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Derived metrics
  const holdings = navData?.holdings || [];
  const cashReserved = navData?.summary?.cash_reserved ?? 0;
  const activeInvested =
    navData?.summary?.active_invested ??
    (holdings.length > 0 ? (investment * holdings.length) / 15 : investment);

  // Live stock portfolio value
  const liveStockValue = holdings.reduce((sum, h) => {
    const q = quotes.find((quote) => quote.ticker === h.ticker);
    const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
    return sum + h.shares * price;
  }, 0);

  const displayStockValue = liveStockValue > 0 ? liveStockValue : activeInvested;
  const totalReturn = displayStockValue - activeInvested;
  const totalReturnPct = activeInvested > 0 ? (totalReturn / activeInvested) * 100 : 0;
  const isGain = totalReturn >= 0;

  if (loading && holdings.length === 0) {
    return (
      <div className="card fade-up" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Conectando con Yahoo Finance y cargando posiciones en vivo…
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Live summary header ─────────────────────────── */}
      <div
        className="card"
        style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,212,255,0.03) 100%)',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚡ Capital Activo en Acciones (Live)</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              color: 'var(--accent-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            ${displayStockValue.toFixed(2)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span className={`badge ${isGain ? 'gain' : 'loss'}`} style={{ fontSize: '0.85rem' }}>
              {isGain ? '▲' : '▼'} ${Math.abs(totalReturn).toFixed(2)} ({Math.abs(totalReturnPct).toFixed(2)}%)
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              base: ${activeInvested.toFixed(2)} ({holdings.length} posiciones abiertas)
            </span>
          </div>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <span className={`market-dot ${marketOpen ? 'open' : 'closed'}`} />
            <span style={{ color: marketOpen ? 'var(--gain)' : '#94a3b8', fontWeight: 600 }}>
              {marketOpen ? 'NYSE / NASDAQ En Vivo' : 'Mercado Cerrado (Último Cierre)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdate && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                🕒 {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn btn-ghost"
              style={{
                fontSize: '0.75rem',
                padding: '5px 10px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={() => load(true)}
              disabled={refreshing}
              title="Refrescar cotizaciones ahora"
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
                🔄
              </span>
              <span>{refreshing ? 'Actualizando…' : 'Refrescar'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius)',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Intraday Chart (if 5m candles exist) ────────── */}
      {intradayChart.length > 1 && (
        <div className="card" style={{ paddingBottom: '30px' }}>
          <h3 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 600 }}>
            Gráfica Intradía de Hoy (5m)
          </h3>
          <div style={{ height: '340px' }}>
            <NavChart navData={intradayChart} investment={activeInvested} />
          </div>
        </div>
      )}

      {/* ── Quotes Grid ─────────────────────────────────── */}
      <div>
        <h3 style={{ marginBottom: '14px', fontSize: '1rem', fontWeight: 600 }}>
          Cotizaciones en Vivo de tus Posiciones Activas
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '14px',
          }}
        >
          {holdings.map((h) => {
            const q = quotes.find((quote) => quote.ticker === h.ticker);
            const currentP = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
            const change = q?.change ?? (h.current_price - h.start_price);
            const changePct = q?.change_pct ?? h.return_pct ?? 0;
            const isChangeGain = change >= 0;
            const currentVal = h.shares * currentP;

            return (
              <div
                key={h.ticker}
                className="card"
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  border: isChangeGain
                    ? '1px solid rgba(16,185,129,0.2)'
                    : '1px solid rgba(239,68,68,0.2)',
                  background: 'var(--bg-surface)',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-primary)' }}>
                        {h.ticker}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.06)',
                          color: '#94a3b8',
                          fontWeight: 600,
                        }}
                      >
                        {h.exchange || 'US'}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--text-muted)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '160px',
                      }}
                      title={h.name}
                    >
                      {h.name || h.ticker}
                    </div>
                  </div>

                  <span
                    className={`badge ${isChangeGain ? 'gain' : 'loss'}`}
                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  >
                    {isChangeGain ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                  <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ${currentP ? currentP.toFixed(2) : '—'}
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: isChangeGain ? 'var(--gain)' : 'var(--loss)',
                    }}
                  >
                    {isChangeGain ? '+' : ''}${change ? change.toFixed(2) : '0.00'}
                  </span>
                </div>

                <div
                  style={{
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    Posición: <strong style={{ color: 'var(--text-secondary)' }}>{h.shares.toFixed(4)} acc.</strong>
                  </span>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    ${currentVal.toFixed(2)}
                  </span>
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
                border: '1px dashed var(--border)',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Q (Cash Reservado)
              </div>
              <div className="mono" style={{ fontSize: '1.3rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                ${cashReserved.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {15 - holdings.length} slots de liquidez protegida
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
