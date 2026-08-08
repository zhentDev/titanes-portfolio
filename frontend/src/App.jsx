import { useState, useEffect, useCallback } from 'react';
import NavChart from './components/NavChart';
import LiveMode from './components/LiveMode';
import HoldingsTable from './components/HoldingsTable';
import RebalanceManager from './components/RebalanceManager';
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

  const loadNAV = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNAV({ tickers, period, investment, numSlots });
      setNavData(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [tickers, period, investment, numSlots, refreshKey]);

  useEffect(() => {
    loadNAV();
  }, [loadNAV]);

  const summary = navData?.summary;
  const isGain = (summary?.total_return_pct ?? 0) >= 0;

  return (
    <div className="app-wrapper">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">Titanes<span>Tech</span></span>
          </div>
          <div className="header-subtitle">Custom ETF Portfolio Tracker</div>
        </div>

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
      </header>

      {/* ── Main layout ─────────────────────────────────── */}
      <main className="app-main">

        {mode === 'live' ? (
          <LiveMode key={refreshKey} navData={navData} investment={investment} />
        ) : (
          <>
            {/* ── Summary strip ─────────────────────────── */}
            {summary && !loading && (() => {
              const activeInvested = summary.active_invested || (investment - (summary.cash_reserved || 0));
              const activeReturnPct = summary.active_return_pct ?? 0;
              const isActGain = activeReturnPct >= 0;
              const alphaSP = summary.alpha_sp500 ?? 0;
              const alphaND = summary.alpha_nasdaq ?? 0;

              return (
              <div className="summary-strip fade-up">
                <SummaryItem
                  label="Capital Activo (5 Acciones)"
                  value={`$${activeInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  large mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Rendimiento Titanes"
                  value={
                    <span className={`badge ${isActGain ? 'gain' : 'loss'}`} style={{ fontSize: '0.95rem', padding: '4px 10px' }}>
                      {isActGain ? '▲' : '▼'} {Math.abs(activeReturnPct).toFixed(2)}%
                    </span>
                  }
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Alfa vs S&P 500 (α)"
                  value={
                    <span className={`badge ${alphaSP >= 0 ? 'gain' : 'loss'}`} style={{ fontSize: '0.95rem', padding: '4px 10px' }}>
                      {alphaSP >= 0 ? '+' : ''}{alphaSP.toFixed(2)}%
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Alfa vs NASDAQ (α)"
                  value={
                    <span className={`badge ${alphaND >= 0 ? 'gain' : 'loss'}`} style={{ fontSize: '0.95rem', padding: '4px 10px' }}>
                      {alphaND >= 0 ? '+' : ''}{alphaND.toFixed(2)}%
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Max Drawdown"
                  value={
                    <span style={{ color: summary.max_drawdown_pct < -5 ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>
                      {summary.max_drawdown_pct ? `${summary.max_drawdown_pct.toFixed(2)}%` : '0.00%'}
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
                <SummaryItem
                  label="Slots Ocupados"
                  value={`${summary.num_holdings}/${summary.num_slots}`}
                  muted
                />
              </div>
              );
            })()}

            {/* ── Chart card ────────────────────────────── */}
            <div className="card fade-up" style={{ animationDelay: '50ms' }}>
              <div className="chart-header">
                <h2>Valor del Portafolio</h2>
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
                  <span>Descargando datos de Yahoo Finance…</span>
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

            {/* ── Bottom grid ───────────────────────────── */}
            <div className="bottom-grid">
              {/* Holdings table */}
              <div className="card fade-up" style={{ animationDelay: '100ms' }}>
                {navData?.holdings?.length > 0 && !loading ? (
                  <HoldingsTable
                    holdings={navData.holdings}
                    investment={investment}
                    numSlots={numSlots}
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
