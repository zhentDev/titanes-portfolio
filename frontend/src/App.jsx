import { useState, useEffect, useCallback } from 'react';
import NavChart from './components/NavChart';
import LiveMode from './components/LiveMode';
import HoldingsTable from './components/HoldingsTable';
import RebalanceManager from './components/RebalanceManager';
import QuantitativeCard from './components/QuantitativeCard';
import SectorAllocation from './components/SectorAllocation';
import RebalanceTimer from './components/RebalanceTimer';
import { exportPortfolioCSV } from './utils/exportReport';
import { usePortfolioStore } from './store/portfolioStore';
import { fetchNAV } from './api/client';
import './App.css';

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];

export default function App() {
  const { tickers, investment, period, numSlots, mode, setPeriod, setMode } = usePortfolioStore();
  const [navData, setNavData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTickers, setSelectedTickers] = useState(null); // null = all active tickers included
  const [unit, setUnit] = useState('pct'); // 'pct' | 'usd'

  const toggleUnit = () => setUnit((u) => (u === 'pct' ? 'usd' : 'pct'));

  const loadNAV = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNAV({ tickers, period, investment, numSlots, selectedTickers });
      setNavData(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [tickers, period, investment, numSlots, refreshKey, selectedTickers]);

  useEffect(() => {
    loadNAV();
  }, [loadNAV]);

  const summary = navData?.summary;
  const holdings = navData?.holdings || [];
  const activeHoldings = holdings.filter((h) => h.selected !== false);
  const allTickers = holdings.map((h) => h.ticker);

  // Toggle single ticker
  const toggleTicker = (ticker) => {
    const current = selectedTickers ?? allTickers;
    let next;
    if (current.includes(ticker)) {
      if (current.length <= 1) return; // keep at least 1
      next = current.filter((t) => t !== ticker);
    } else {
      next = [...current, ticker];
    }
    setSelectedTickers(next.length === allTickers.length ? null : next);
  };

  // Quick filter presets
  const selectAll = () => setSelectedTickers(null);
  const selectGainers = () => {
    const gainers = holdings.filter((h) => (h.return_pct ?? 0) >= 0).map((h) => h.ticker);
    if (gainers.length > 0) setSelectedTickers(gainers);
  };
  const selectLosers = () => {
    const losers = holdings.filter((h) => (h.return_pct ?? 0) < 0).map((h) => h.ticker);
    if (losers.length > 0) setSelectedTickers(losers);
  };
  const invertSelection = () => {
    const current = selectedTickers ?? allTickers;
    const inverted = allTickers.filter((t) => !current.includes(t));
    if (inverted.length > 0) setSelectedTickers(inverted);
  };

  const isSimulating = selectedTickers !== null && selectedTickers.length < allTickers.length;

  return (
    <div className="app-wrapper">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">Titanes<span>Tech</span></span>
          </div>
          <div className="header-subtitle">Custom ETF & ProPicks AI Tracker</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {navData && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => exportPortfolioCSV(navData, investment)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', padding: '6px 12px' }}
              title="Descargar informe completo del portafolio en formato CSV"
            >
              <span>📥</span>
              <span>Exportar Reporte CSV</span>
            </button>
          )}

          <div className="mode-toggle">
            <button
              className={mode === 'historical' ? 'active' : ''}
              onClick={() => setMode('historical')}
            >
              📈 Histórico
            </button>
            <button
              className={mode === 'live' ? 'active' : ''}
              onClick={() => setMode('live')}
            >
              ⚡ Live
            </button>
          </div>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────── */}
      <main className="app-main">

        {mode === 'live' ? (
          <LiveMode key={refreshKey} navData={navData} investment={investment} />
        ) : (
          <>
            {/* ── Summary strip with % and $ Unit Toggle ─── */}
            {summary && !loading && (() => {
              const activeInvested = summary.active_invested || (investment - (summary.cash_reserved || 0));
              const activeReturnPct = summary.active_return_pct ?? 0;
              const activeReturnUsd = summary.active_return ?? ((summary.active_stock_value || activeInvested) - activeInvested);
              const isActGain = (unit === 'pct' ? activeReturnPct : activeReturnUsd) >= 0;

              const alphaSPPct = summary.alpha_sp500 ?? 0;
              const alphaSPUsd = summary.alpha_sp500_usd ?? (activeReturnUsd - (summary.sp500_return || 0));

              const alphaNDPct = summary.alpha_nasdaq ?? 0;
              const alphaNDUsd = summary.alpha_nasdaq_usd ?? (activeReturnUsd - (summary.nasdaq_return || 0));

              const maxDDPct = summary.max_drawdown_pct ?? 0;
              const maxDDUsd = summary.max_drawdown_usd ?? 0;

              return (
              <div className="summary-strip fade-up" style={{ position: 'relative' }}>
                <SummaryItem
                  label={`Capital Activo (${summary.num_holdings} Acciones)`}
                  value={`$${activeInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  large mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span>Rendimiento Titanes</span>
                    </div>
                  }
                  value={
                    <span
                      className={`badge ${isActGain ? 'gain' : 'loss'}`}
                      style={{ fontSize: '0.95rem', padding: '4px 10px', cursor: 'pointer' }}
                      onClick={toggleUnit}
                      title="Haz clic para alternar entre % y $"
                    >
                      {isActGain ? '▲' : '▼'} {unit === 'pct' ? `${Math.abs(activeReturnPct).toFixed(2)}%` : `$${Math.abs(activeReturnUsd).toFixed(2)}`}
                    </span>
                  }
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Alfa vs S&P 500 (α)"
                  value={
                    <span
                      className={`badge ${alphaSPPct >= 0 ? 'gain' : 'loss'}`}
                      style={{ fontSize: '0.95rem', padding: '4px 10px', cursor: 'pointer' }}
                      onClick={toggleUnit}
                      title="Haz clic para alternar entre % y $"
                    >
                      {alphaSPPct >= 0 ? '+' : ''}{unit === 'pct' ? `${alphaSPPct.toFixed(2)}%` : `$${alphaSPUsd.toFixed(2)}`}
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Alfa vs NASDAQ (α)"
                  value={
                    <span
                      className={`badge ${alphaNDPct >= 0 ? 'gain' : 'loss'}`}
                      style={{ fontSize: '0.95rem', padding: '4px 10px', cursor: 'pointer' }}
                      onClick={toggleUnit}
                      title="Haz clic para alternar entre % y $"
                    >
                      {alphaNDPct >= 0 ? '+' : ''}{unit === 'pct' ? `${alphaNDPct.toFixed(2)}%` : `$${alphaNDUsd.toFixed(2)}`}
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Max Drawdown"
                  value={
                    <span
                      style={{ color: maxDDPct < -5 ? '#ef4444' : '#94a3b8', fontWeight: 600, cursor: 'pointer' }}
                      onClick={toggleUnit}
                      title="Haz clic para alternar entre % y $"
                    >
                      {unit === 'pct' ? `${maxDDPct.toFixed(2)}%` : `-$${Math.abs(maxDDUsd).toFixed(2)}`}
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Cash Reservado (Q)"
                  value={`$${(summary.cash_reserved ?? 0).toFixed(2)}`}
                  muted mono
                />
                <div className="summary-divider" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Unidad
                  </span>
                  <div className="unit-toggle" onClick={toggleUnit} title="Alternar métricas entre Porcentaje (%) y Dólares ($)">
                    <button className={`unit-btn ${unit === 'pct' ? 'active' : ''}`}>%</button>
                    <button className={`unit-btn ${unit === 'usd' ? 'active' : ''}`}>$</button>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* ── Interactive Simulation Bar (What-If Ticker Toggling) ── */}
            {allTickers.length > 0 && (
              <div className="simulation-bar fade-up">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isSimulating ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    🎯 Simulación What-If:
                  </span>
                  {isSimulating && (
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(0,229,255,0.1)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {activeHoldings.length} de {allTickers.length} acciones activas
                    </span>
                  )}
                </div>

                <div className="sim-btn-group">
                  <button className="btn-chip" onClick={selectAll} title="Incluir todas las posiciones">
                    ⚡ Todos
                  </button>
                  <button className="btn-chip" onClick={selectGainers} title="Simular solo con las acciones en ganancia">
                    🚀 Ganadoras
                  </button>
                  <button className="btn-chip" onClick={selectLosers} title="Simular solo con las acciones en pérdida">
                    🛑 Perdedoras
                  </button>
                  <button className="btn-chip" onClick={invertSelection} title="Invertir selección actual">
                    🔄 Invertir
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
                  {holdings.map((h) => {
                    const isSelected = h.selected !== false;
                    const isGain = (h.return_pct ?? 0) >= 0;
                    return (
                      <button
                        key={h.ticker}
                        className={`ticker-chip ${isSelected ? 'active' : 'inactive'}`}
                        onClick={() => toggleTicker(h.ticker)}
                        title={`Clic para ${isSelected ? 'excluir' : 'incluir'} ${h.name || h.ticker} de la simulación`}
                      >
                        <span>{isSelected ? '✓' : '＋'}</span>
                        <span>{h.ticker}</span>
                        {h.return_pct !== undefined && (
                          <span style={{ fontSize: '0.65rem', opacity: 0.9, color: isGain ? 'var(--gain)' : 'var(--loss)' }}>
                            {isGain ? '+' : ''}{h.return_pct.toFixed(1)}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Chart card ────────────────────────────── */}
            <div className="card fade-up" style={{ animationDelay: '50ms' }}>
              <div className="chart-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Valor del Portafolio vs Benchmarks</h2>
                  {isSimulating && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginTop: 2, display: 'block' }}>
                      ⚡ Gráfico recalculado dinámicamente para las {activeHoldings.length} acciones seleccionadas
                    </span>
                  )}
                </div>
                <div className="period-selector">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      className={`period-btn ${period === p ? 'active' : ''}`}
                      onClick={() => setPeriod(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="chart-loading">
                  <div className="spinner" />
                  <span>Calculando simulación interactiva…</span>
                </div>
              ) : error ? (
                <div className="chart-error" style={{ textAlign: 'left', padding: '24px 28px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius)' }}>
                  {error.backendError ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ padding: '3px 8px', borderRadius: 4, background: '#ef4444', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                          {error.backendError.error_type || 'Python Error'}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#fca5a5' }}>
                          {error.backendError.file}:{error.backendError.line}
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fee2e2', marginBottom: 12 }}>
                        {error.backendError.message}
                      </div>
                      {error.backendError.code && (
                        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '12px 16px', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', color: '#fecaca', borderLeft: '3px solid #ef4444' }}>
                          <span style={{ color: '#94a3b8', marginRight: 14 }}>Línea {error.backendError.line}</span>
                          <code>{error.backendError.code}</code>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#fca5a5', fontSize: '0.95rem' }}>
                      ⚠️ {error.message || String(error)}
                    </div>
                  )}
                </div>
              ) : (
                <NavChart
                  navData={navData?.nav}
                  sp500Data={navData?.sp500}
                  nasdaqData={navData?.nasdaq}
                  investment={investment}
                />
              )}
            </div>

            {/* ── Quantitative Intelligence & Allocation Grid ── */}
            {summary && !loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <QuantitativeCard summary={summary} />
                <SectorAllocation
                  holdings={navData?.holdings}
                  investment={investment}
                  numSlots={numSlots}
                />
                <RebalanceTimer
                  rebalances={navData?.rebalances}
                  holdings={navData?.holdings}
                />
              </div>
            )}

            {/* ── Bottom grid ───────────────────────────── */}
            <div className="bottom-grid">
              {/* Holdings table */}
              <div className="card fade-up" style={{ animationDelay: '100ms' }}>
                {navData?.holdings?.length > 0 && !loading ? (
                  <HoldingsTable
                    holdings={navData.holdings}
                    investment={investment}
                    numSlots={numSlots}
                    onToggleTicker={toggleTicker}
                    unit={unit}
                    onToggleUnit={toggleUnit}
                  />
                ) : loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div className="spinner" />
                  </div>
                ) : null}
              </div>

              {/* Portfolio manager */}
              <div className="card fade-up" style={{ animationDelay: '150ms' }}>
                <RebalanceManager onRefresh={() => setRefreshKey((k) => k + 1)} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="app-footer">
        Datos vía Yahoo Finance · 15min delay en live · Solo para análisis personal · No es asesoramiento financiero
      </footer>
    </div>
  );
}

function SummaryItem({ label, value, mono, large, muted }) {
  return (
    <div className="summary-item">
      <div className="summary-label">{label}</div>
      <div
        className={`summary-value ${mono ? 'mono' : ''} ${large ? 'large' : ''} ${muted ? 'muted' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}


