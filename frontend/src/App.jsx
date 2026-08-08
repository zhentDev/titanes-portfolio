import { useState, useEffect, useCallback, useMemo } from 'react';
import NavChart from './components/NavChart';
import LiveMode from './components/LiveMode';
import HoldingsTable from './components/HoldingsTable';
import RebalanceManager from './components/RebalanceManager';
import QuantitativeCard from './components/QuantitativeCard';
import SectorAllocation from './components/SectorAllocation';
import RebalanceTimer from './components/RebalanceTimer';
import MonteCarloCard from './components/MonteCarloCard';
import CorrelationHeatmap from './components/CorrelationHeatmap';
import QuantRadar from './components/QuantRadar';
import MidCapsStrategy from './components/MidCapsStrategy';
import { exportPortfolioCSV } from './utils/exportReport';
import { usePortfolioStore } from './store/portfolioStore';
import { fetchNAV } from './api/client';
import './App.css';

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];

export default function App() {
  const { tickers, investment, period, numSlots, mode, setPeriod, setMode } = usePortfolioStore();
  const [baseNavData, setBaseNavData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTickers, setSelectedTickers] = useState(null); // null = all active tickers included
  const [unit, setUnit] = useState('pct'); // 'pct' | 'usd'

  const toggleUnit = () => setUnit((u) => (u === 'pct' ? 'usd' : 'pct'));

  // Only trigger network/DuckDB load on period, investment or rebalance refresh
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    fetchNAV({ tickers, period, investment, numSlots })
      .then((data) => {
        if (!isCancelled) {
          setBaseNavData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [tickers, period, investment, numSlots, refreshKey]);

  // Client-side instant recalculation: 0ms latency, no spinner, no page reload, pure butter-smooth animation!
  const navData = useMemo(() => {
    if (!baseNavData) return null;
    if (!selectedTickers) return baseNavData;

    const allHoldings = baseNavData.holdings || [];
    const updatedHoldings = allHoldings.map((h) => ({
      ...h,
      selected: selectedTickers.includes(h.ticker),
    }));

    const activeList = updatedHoldings.filter((h) => h.selected && h.shares > 0);
    const slotValue = investment / numSlots;
    const activeInvested = activeList.length * slotValue;
    const currentStockValue = activeList.reduce((sum, h) => sum + (h.shares * h.current_price), 0);
    const activeReturn = currentStockValue - activeInvested;
    const activeReturnPct = activeInvested > 0 ? (activeReturn / activeInvested) * 100 : 0;

    // Rescale all benchmarks to start from activeInvested so that the Y-axis scale is 100% harmonized
    const baseFirstVal = baseNavData.nav?.[0]?.value || investment;
    const baseSP0 = baseNavData.sp500?.[0]?.value || baseFirstVal;
    const baseND0 = baseNavData.nasdaq?.[0]?.value || baseFirstVal;
    const baseMM0 = baseNavData.mm20?.[0]?.value || baseFirstVal;

    // Rescaled Portfolio NAV using exact individual ticker price action
    const tickerSeriesMap = baseNavData.ticker_series || {};
    const datePoints = baseNavData.nav || [];
    
    const scaledNav = datePoints.map((pt, idx) => {
      let totalStockVal = 0;
      for (const h of activeList) {
        const seriesForT = tickerSeriesMap[h.ticker];
        const factor = seriesForT?.[idx]?.factor ?? (1 + (h.return_pct || 0) / 100);
        totalStockVal += slotValue * factor;
      }
      return {
        ...pt,
        value: Number(totalStockVal.toFixed(4)),
      };
    });

    // Rescaled S&P 500
    const scaledSP500 = (baseNavData.sp500 || []).map((pt) => {
      const pctGrowth = baseSP0 > 0 ? pt.value / baseSP0 : 1;
      return {
        ...pt,
        value: Number((activeInvested * pctGrowth).toFixed(4)),
      };
    });

    // Rescaled NASDAQ
    const scaledNasdaq = (baseNavData.nasdaq || []).map((pt) => {
      const pctGrowth = baseND0 > 0 ? pt.value / baseND0 : 1;
      return {
        ...pt,
        value: Number((activeInvested * pctGrowth).toFixed(4)),
      };
    });

    // Rescaled MM20
    const scaledMM20 = (baseNavData.mm20 || []).map((pt) => {
      const pctGrowth = baseMM0 > 0 ? pt.value / baseMM0 : 1;
      return {
        ...pt,
        value: Number((activeInvested * pctGrowth).toFixed(4)),
      };
    });

    const sp500Pct = baseNavData.summary?.sp500_return_pct || 0;
    const nasdaqPct = baseNavData.summary?.nasdaq_return_pct || 0;
    const sp500ReturnUsd = (sp500Pct / 100) * activeInvested;
    const nasdaqReturnUsd = (nasdaqPct / 100) * activeInvested;

    return {
      ...baseNavData,
      nav: scaledNav,
      sp500: scaledSP500,
      nasdaq: scaledNasdaq,
      mm20: scaledMM20,
      holdings: updatedHoldings,
      summary: {
        ...baseNavData.summary,
        active_invested: activeInvested,
        active_stock_value: currentStockValue,
        active_return: activeReturn,
        active_return_pct: activeReturnPct,
        sp500_return: sp500ReturnUsd,
        sp500_return_pct: sp500Pct,
        nasdaq_return: nasdaqReturnUsd,
        nasdaq_return_pct: nasdaqPct,
        alpha_sp500: Number((activeReturnPct - sp500Pct).toFixed(2)),
        alpha_sp500_usd: Number((activeReturn - sp500ReturnUsd).toFixed(2)),
        alpha_nasdaq: Number((activeReturnPct - nasdaqPct).toFixed(2)),
        alpha_nasdaq_usd: Number((activeReturn - nasdaqReturnUsd).toFixed(2)),
        num_holdings: activeList.length,
        cash_reserved: investment - activeInvested,
      },
    };
  }, [baseNavData, selectedTickers, investment, numSlots]);

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
          <div className="header-subtitle">Custom ETF & ProPicks AI Terminal</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
              🏆 Titanes Tech
            </button>
            <button
              className={mode === 'midcaps' ? 'active' : ''}
              onClick={() => setMode('midcaps')}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🇺🇸 Mid-caps MM20</span>
              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>
                PRO
              </span>
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
        ) : mode === 'midcaps' ? (
          <MidCapsStrategy onBack={() => setMode('historical')} />
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

            {/* ── Period selector ──────────────────────────── */}
            <div className="period-selector fade-up">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  className={`period-btn ${p === period ? 'active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* ── Main Chart Card ─────────────────────────────── */}
            <div className="card chart-card fade-up">
              {loading && !navData ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 360, gap: 14, color: 'var(--text-muted)' }}>
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
                  holdings={holdings}
                  onToggleTicker={toggleTicker}
                  selectAll={selectAll}
                  selectGainers={selectGainers}
                  selectLosers={selectLosers}
                  invertSelection={invertSelection}
                  isSimulating={isSimulating}
                />
              )}
            </div>

            {/* ── Quantitative Intelligence & Allocation Grid ── */}
            {summary && !loading && (
              <>
                {/* Row 1: Institutional Quant Suite, 360 Radar & Sector Allocation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  <QuantitativeCard summary={summary} />
                  <QuantRadar radar={navData?.radar} />
                  <SectorAllocation
                    holdings={navData?.holdings}
                    investment={investment}
                    numSlots={numSlots}
                  />
                </div>

                {/* Row 2: Monte Carlo Simulation & Correlation Heatmap & Rebalance Timer */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  <MonteCarloCard
                    monteCarlo={navData?.monte_carlo}
                    activeInvested={summary.active_invested}
                  />
                  <CorrelationHeatmap correlations={navData?.correlations} />
                  <RebalanceTimer
                    rebalances={navData?.rebalances}
                    holdings={navData?.holdings}
                  />
                </div>
              </>
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


