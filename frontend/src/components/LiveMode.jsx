import { useState, useEffect, useCallback } from 'react';
import { fetchLiveQuotes, fetchIntraday } from '../api/client';
import NavChart from './NavChart';

const POLL_INTERVAL = 60_000;

export default function LiveMode({ navData, investment }) {
  const [quotes, setQuotes] = useState([]);
  const [intradayChart, setIntradayChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!navData || !navData.holdings || navData.holdings.length === 0) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const activeTickers = navData.holdings.map((h) => h.ticker);

      // Fetch live quotes for active tickers
      const quotesData = await fetchLiveQuotes(activeTickers);
      setQuotes(quotesData || []);
      setMarketOpen(quotesData?.[0]?.market_open ?? false);
      setLastUpdate(new Date());

      // Fetch intraday for chart safely
      try {
        const intradayPromises = activeTickers.map((t) => fetchIntraday(t));
        const intradayResults = await Promise.all(intradayPromises);

        const allTimes = new Set();
        intradayResults.forEach((series) => (series || []).forEach((p) => allTimes.add(p.time)));
        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        const lastPrice = {};
        const chartSeries = [];
        const cashReserved = navData.summary?.cash_reserved ?? 0;

        for (const t of sortedTimes) {
          let stockValue = 0;
          intradayResults.forEach((series, i) => {
            const ticker = activeTickers[i];
            const holding = navData.holdings.find((h) => h.ticker === ticker);
            const shares = holding ? holding.shares : 0;

            const point = (series || []).find((p) => p.time === t);
            if (point && !isNaN(point.value)) {
              lastPrice[ticker] = point.value;
            }
            const price = lastPrice[ticker] ?? quotesData?.find((q) => q.ticker === ticker)?.previous_close ?? 0;
            if (!isNaN(price)) {
              stockValue += price * shares;
            }
          });

          if (!isNaN(stockValue) && stockValue > 0) {
            chartSeries.push({
              date: t,
              value: stockValue, // Active equity scale
            });
          }
        }
        setIntradayChart(chartSeries);
      } catch (intradayErr) {
        console.warn('[LIVE MODE] Intradía no disponible (mercado cerrado):', intradayErr);
        setIntradayChart([]);
      }
    } catch (e) {
      setError(e.message || 'Error descargando cotizaciones en vivo');
    } finally {
      setLoading(false);
    }
  }, [navData]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && quotes.length === 0) {
    return (
      <div className="card fade-up" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Conectando con Yahoo Finance en tiempo real…
        </div>
      </div>
    );
  }

  // Calculate live portfolio metrics
  const cashReserved = navData?.summary?.cash_reserved ?? 0;
  const activeInvested = navData?.summary?.active_invested || (investment - cashReserved);

  const liveStockValue = quotes.reduce((sum, q) => {
    const holding = navData?.holdings?.find((h) => h.ticker === q.ticker);
    if (!holding) return sum;
    const currentP = q.price ?? q.previous_close ?? holding.current_price ?? 0;
    return sum + holding.shares * currentP;
  }, 0);

  const totalReturn = liveStockValue > 0 ? liveStockValue - activeInvested : 0;
  const totalReturnPct = activeInvested > 0 ? (totalReturn / activeInvested) * 100 : 0;
  const isGain = totalReturn >= 0;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Live summary header */}
      <div className="card" style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Capital Activo en Acciones (Live)
          </div>
          <div className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ${liveStockValue > 0 ? liveStockValue.toFixed(2) : activeInvested.toFixed(2)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span className={`badge ${isGain ? 'gain' : 'loss'}`} style={{ fontSize: '0.85rem' }}>
              {isGain ? '▲' : '▼'} ${Math.abs(totalReturn).toFixed(2)} ({Math.abs(totalReturnPct).toFixed(2)}%)
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              base: ${activeInvested.toFixed(2)} invertidos en {navData?.holdings?.length || 0} acciones
            </span>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
            <span className={`market-dot ${marketOpen ? 'open' : 'closed'}`} />
            <span style={{ color: marketOpen ? 'var(--gain)' : '#94a3b8', fontWeight: 500 }}>
              {marketOpen ? 'NYSE / NASDAQ Abierto' : 'Mercado Cerrado (Último Cierre)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdate && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Actualizado: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: 4 }}
              onClick={() => { setLoading(true); load(); }}
              title="Refrescar cotizaciones ahora"
            >
              🔄 Refrescar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', color: '#fca5a5', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Intraday Chart (if available) */}
      {intradayChart.length > 0 && (
        <div className="card" style={{ paddingBottom: '30px' }}>
          <h3 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 600 }}>Gráfica Intradía de Hoy (5m)</h3>
          <div style={{ height: '340px' }}>
            <NavChart navData={intradayChart} investment={activeInvested} />
          </div>
        </div>
      )}

      {/* Quotes grid with rich company names and sector badges */}
      <div>
        <h3 style={{ marginBottom: '14px', fontSize: '1rem', fontWeight: 600 }}>
          Cotizaciones en Vivo de tus Posiciones
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {quotes.map((q) => {
            const isChangeGain = (q.change ?? 0) >= 0;
            const holding = navData?.holdings?.find((h) => h.ticker === q.ticker);
            const shares = holding ? holding.shares : 0;
            const currentP = q.price ?? q.previous_close ?? holding?.current_price ?? 0;
            const currentVal = shares * currentP;

            return (
              <div
                key={q.ticker}
                className="card"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  border: isChangeGain ? '1px solid rgba(16,185,129,0.18)' : '1px solid rgba(239,68,68,0.18)',
                  background: 'var(--bg-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent-primary)' }}>
                        {q.ticker}
                      </span>
                      <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                        {holding?.exchange || 'US'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                      {holding?.name || q.ticker}
                    </div>
                  </div>
                  <span className={`badge ${isChangeGain ? 'gain' : 'loss'}`} style={{ fontSize: '0.72rem' }}>
                    {isChangeGain ? '▲' : '▼'} {Math.abs(q.change_pct ?? 0).toFixed(2)}%
                  </span>
                </div>

                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ${currentP ? currentP.toFixed(2) : '—'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: isChangeGain ? 'var(--gain)' : 'var(--loss)' }}>
                    {isChangeGain ? '+' : ''}${q.change?.toFixed(2) ?? '0.00'} hoy
                  </span>
                </div>

                <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>Valor en cartera:</span>
                  <strong className="mono" style={{ color: 'var(--text-primary)' }}>${currentVal.toFixed(2)}</strong>
                </div>
              </div>
            );
          })}

          {/* Cash placeholder card */}
          {cashReserved > 0 && (
            <div className="card" style={{ opacity: 0.5, border: '1px dashed var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                Q (Cash Reservado)
              </div>
              <div className="mono" style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                ${cashReserved.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                Liquidez protegida en flat cash
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

