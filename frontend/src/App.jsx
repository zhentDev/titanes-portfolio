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
      setError(e.message);
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
              const activeInvested = investment - (summary.cash_reserved || 0);
              const activeReturnPct = activeInvested > 0 ? (summary.total_return / activeInvested) * 100 : 0;
              return (
              <div className="summary-strip fade-up">
                <SummaryItem
                  label="Capital Activo (Real)"
                  value={`$${activeInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  large mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Rendimiento (Real)"
                  value={
                    <span className={`badge ${isGain ? 'gain' : 'loss'}`} style={{ fontSize: '1rem', padding: '4px 10px' }}>
                      {isGain ? '▲' : '▼'} {Math.abs(activeReturnPct).toFixed(2)}%
                    </span>
                  }
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Ganancia Neta"
                  value={
                    <span className={isGain ? 'gain' : 'loss'} style={{ fontWeight: 'bold' }}>
                      {isGain ? '▲' : '▼'} ${Math.abs(summary.total_return).toFixed(2)}
                    </span>
                  }
                  mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Base Portafolio"
                  value={`$${summary.start_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  muted mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Cash reservado"
                  value={`$${(summary.cash_reserved ?? 0).toFixed(2)}`}
                  muted mono
                />
                <div className="summary-divider" />
                <SummaryItem
                  label="Posiciones"
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
                <div className="chart-error" style={{ textAlign: 'left', padding: '20px 40px', lineHeight: '1.6' }}>
                  <div style={{ fontSize: '1.2rem', marginBottom: 12, fontWeight: 'bold' }}>⚠️ {error}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <strong>Soluciones comunes:</strong>
                    <ul style={{ marginTop: 8, paddingLeft: 24, listStyleType: 'disc' }}>
                      <li>Asegúrate de haber ejecutado <code>start_titanes.bat</code> para encender el backend.</li>
                      <li>Revisa que el programa <strong>DBeaver</strong> no esté abierto bloqueando la base de datos DuckDB. Si lo está, dale clic derecho a la conexión y selecciona "Desconectar".</li>
                      <li>Verifica si el puerto 8000 ya está siendo usado por otro programa (o si hay dos consolas abiertas intentando correr el backend al mismo tiempo).</li>
                    </ul>
                  </div>
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
