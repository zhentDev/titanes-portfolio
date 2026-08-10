import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import DynamicStrategyView from './components/DynamicStrategyView';
import CreateStrategyModal from './components/CreateStrategyModal';
import IndividualPurchasesView from './components/IndividualPurchasesView';
import InflationExplorerModal from './components/InflationExplorerModal';
import FixedIncomeHub from './components/FixedIncome/FixedIncomeHub';
import { exportPortfolioCSV } from './utils/exportReport';
import { usePortfolioStore } from './store/portfolioStore';
import { fetchNAV, fetchFxHistory, fetchColInflationHistory } from './api/client';
import toast, { Toaster } from 'react-hot-toast';
import { toastPrompt } from './utils/toastAlerts';
import './App.css';

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];

export default function App() {
  const { 
    tickers, 
    investment, 
    period, 
    numSlots, 
    mode, 
    setPeriod, 
    setMode, 
    customStrategies, 
    addCustomStrategy, 
    deleteCustomStrategy, 
    purchasePortfolios,
    addPurchasePortfolio,
    mainPortfolioSettings,
    setMainPortfolioSettings,
    initFetchPurchases 
  } = usePortfolioStore();
  const [baseNavData, setBaseNavData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTickers, setSelectedTickers] = useState(null); // null = all active tickers included
  const [unit, setUnit] = useState('pct'); // 'pct' | 'usd'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMainSettingsModal, setShowMainSettingsModal] = useState(false);
  const [showMainInflationExplorer, setShowMainInflationExplorer] = useState(false);
  const [mainYieldViewMode, setMainYieldViewMode] = useState('USD');
  const [mainFxData, setMainFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingMainFx, setIsFetchingMainFx] = useState(false);
  const [mainColInflationData, setMainColInflationData] = useState({ history: {}, latest: {}, monthly_rates: [] });
  const [isFetchingMainInflation, setIsFetchingMainInflation] = useState(false);

  // Navigation Dropdown States & Outside Click Handlers
  const [stratOpen, setStratOpen] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const stratDropdownRef = useRef(null);
  const purchasesDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (stratDropdownRef.current && !stratDropdownRef.current.contains(e.target)) {
        setStratOpen(false);
      }
      if (purchasesDropdownRef.current && !purchasesDropdownRef.current.contains(e.target)) {
        setPurchasesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isStrategyMode = mode === 'historical' || mode === 'live' || (customStrategies || []).some((s) => s.id === mode);
  const isPurchaseMode = (purchasePortfolios || []).some((p) => p.id === mode);

  const currentStrategyLabel = useMemo(() => {
    if (mode === 'historical') return '🏆 Titanes Tech';
    if (mode === 'live') return '⚡ Live Tracker';
    const match = (customStrategies || []).find((s) => s.id === mode);
    return match ? `${match.country || '🌎'} ${match.name}` : 'Seleccionar...';
  }, [mode, customStrategies]);

  const currentPurchaseLabel = useMemo(() => {
    const match = (purchasePortfolios || []).find((p) => p.id === mode);
    return match ? match.name : (purchasePortfolios?.[0]?.name || 'Seleccionar...');
  }, [mode, purchasePortfolios]);

  const mainSettings = mainPortfolioSettings || {
    assetCurrency: 'USD',
    localCurrency: 'COP',
    inflationRate: 0,
    useAutoColInflation: false,
  };

  useEffect(() => {
    if (mainSettings.assetCurrency && mainSettings.localCurrency && mainSettings.assetCurrency !== mainSettings.localCurrency) {
      setIsFetchingMainFx(true);
      fetchFxHistory(mainSettings.assetCurrency, mainSettings.localCurrency)
        .then(res => setMainFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingMainFx(false));
    } else {
      setMainFxData({ current: 1.0, history: {} });
      if (mainYieldViewMode === 'FX') setMainYieldViewMode('USD');
    }
  }, [mainSettings.assetCurrency, mainSettings.localCurrency]);

  useEffect(() => {
    setIsFetchingMainInflation(true);
    fetchColInflationHistory()
      .then(res => setMainColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingMainInflation(false));
  }, []);

  const toggleUnit = () => setUnit((u) => (u === 'pct' ? 'usd' : 'pct'));

  // Only trigger network/DuckDB load on period, investment or rebalance refresh
  useEffect(() => {
    initFetchPurchases();
  }, [initFetchPurchases]);

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

    const allHoldings = baseNavData.holdings || [];
    const currentSelected = selectedTickers ?? allHoldings.map((h) => h.ticker);
    const updatedHoldings = allHoldings.map((h) => ({
      ...h,
      selected: currentSelected.includes(h.ticker),
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

    const sp500Pct = baseNavData.summary?.sp500_return_pct || 0;
    const nasdaqPct = baseNavData.summary?.nasdaq_return_pct || 0;
    const sp500ReturnUsd = (sp500Pct / 100) * activeInvested;
    const nasdaqReturnUsd = (nasdaqPct / 100) * activeInvested;

    return {
      ...baseNavData,
      nav: scaledNav,
      sp500: scaledSP500,
      nasdaq: scaledNasdaq,
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
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            color: '#fff',
            border: '1px solid var(--border)'
          }
        }} 
      />
      {/* ── Header ──────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">Titanes<span>Tech</span></span>
          </div>
          <div className="header-subtitle">Custom ETF & ProPicks AI Terminal</div>
        </div>

        <nav className="header-nav-menu">
          {/* 1. Estrategias & Portafolios Dropdown */}
          <div className="nav-dropdown" ref={stratDropdownRef}>
            <button 
              type="button"
              className={`nav-dropdown-btn ${isStrategyMode ? 'active' : ''}`}
              onClick={() => {
                setStratOpen(prev => !prev);
                setPurchasesOpen(false);
              }}
            >
              <span className="btn-label">📊 Estrategias</span>
              <span className="active-badge">{currentStrategyLabel}</span>
              <span className="chevron">{stratOpen ? '▲' : '▼'}</span>
            </button>

            {stratOpen && (
              <div className="nav-dropdown-menu fade-up">
                <div className="dropdown-header">Estrategias & Portafolios</div>
                
                <button 
                  type="button"
                  className={`dropdown-item ${mode === 'historical' ? 'selected' : ''}`}
                  onClick={() => { setMode('historical'); setStratOpen(false); }}
                >
                  <span className="item-icon">🏆</span>
                  <span className="item-title">Titanes Tech</span>
                  <span className="system-badge core">CORE</span>
                </button>

                <button 
                  type="button"
                  className={`dropdown-item ${mode === 'live' ? 'selected' : ''}`}
                  onClick={() => { setMode('live'); setStratOpen(false); }}
                >
                  <span className="item-icon">⚡</span>
                  <span className="item-title">Live Tracker</span>
                  <span className="system-badge pro">LIVE</span>
                </button>

                {(customStrategies || []).map((strat) => (
                  <button 
                    type="button"
                    key={strat.id}
                    className={`dropdown-item ${mode === strat.id ? 'selected' : ''}`}
                    onClick={() => { setMode(strat.id); setStratOpen(false); }}
                  >
                    <span className="item-icon">{strat.country || '🌎'}</span>
                    <span className="item-title">{strat.name}</span>
                    {strat.isSystem ? (
                      <span className="system-badge pro">PRO</span>
                    ) : (
                      <span className="system-badge custom">{strat.numSlots} slots</span>
                    )}
                  </button>
                ))}

                <div className="dropdown-divider" />
                <button 
                  type="button"
                  className="dropdown-action-btn cyan"
                  onClick={() => { setIsModalOpen(true); setStratOpen(false); }}
                >
                  <span>+ Nueva Estrategia</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Compras Individuales Dropdown */}
          <div className="nav-dropdown" ref={purchasesDropdownRef}>
            <button 
              type="button"
              className={`nav-dropdown-btn ${isPurchaseMode ? 'active' : ''}`}
              onClick={() => {
                setPurchasesOpen(prev => !prev);
                setStratOpen(false);
              }}
            >
              <span className="btn-label">🛒 Compras</span>
              <span className="active-badge warning">{currentPurchaseLabel}</span>
              <span className="chevron">{purchasesOpen ? '▲' : '▼'}</span>
            </button>

            {purchasesOpen && (
              <div className="nav-dropdown-menu fade-up">
                <div className="dropdown-header">Históricos de Compras</div>

                {(purchasePortfolios || []).map((port) => (
                  <button 
                    type="button"
                    key={port.id}
                    className={`dropdown-item ${mode === port.id ? 'selected' : ''}`}
                    onClick={() => { setMode(port.id); setPurchasesOpen(false); }}
                  >
                    <span className="item-icon">🛒</span>
                    <span className="item-title">{port.name}</span>
                  </button>
                ))}

                <div className="dropdown-divider" />
                <button 
                  type="button"
                  className="dropdown-action-btn orange"
                  onClick={async () => {
                    setPurchasesOpen(false);
                    const name = await toastPrompt("Nombre del nuevo Histórico de Compras:");
                    if (name) addPurchasePortfolio(name);
                  }}
                >
                  <span>+ Nuevo Histórico</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Renta Fija & Ahorros */}
          <button
            type="button"
            className={`nav-pill-btn emerald ${mode === 'fixed_income' ? 'active' : ''}`}
            onClick={() => {
              setMode('fixed_income');
              setStratOpen(false);
              setPurchasesOpen(false);
            }}
          >
            <span>🏦 Renta Fija & Ahorros</span>
          </button>

          {/* 5. Exportar CSV */}
          {navData && (
            <button
              type="button"
              className="nav-action-btn"
              onClick={() => exportPortfolioCSV(navData, investment)}
              title="Descargar informe completo del portafolio en formato CSV"
            >
              <span>📥</span>
              <span>Exportar CSV</span>
            </button>
          )}
        </nav>
      </header>

      {/* ── Modal Creador de Nueva Estrategia ─────────────── */}
      <CreateStrategyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={(stratData) => {
          addCustomStrategy(stratData);
        }}
      />

      {/* ── Main layout ─────────────────────────────────── */}
      <main className="app-main">

        {mode === 'fixed_income' ? (
          <FixedIncomeHub />
        ) : (purchasePortfolios || []).some(p => p.id === mode) ? (
          <IndividualPurchasesView portfolioId={mode} />
        ) : mode === 'live' ? (
          <LiveMode key={refreshKey} navData={navData} investment={investment} />
        ) : customStrategies?.some((s) => s.id === mode) ? (
          <DynamicStrategyView
            key={mode}
            strategy={customStrategies.find((s) => s.id === mode)}
            onDelete={deleteCustomStrategy}
            onBack={() => setMode('historical')}
          />
        ) : (
          <>
            {/* ── Yield View Controls for Main Portfolio (Nominal / Divisa / Real) ── */}
            <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 4, border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => setMainYieldViewMode('USD')}
                  style={{ padding: '6px 16px', borderRadius: 16, border: 'none', background: mainYieldViewMode === 'USD' ? 'rgba(255,255,255,0.1)' : 'transparent', color: mainYieldViewMode === 'USD' ? '#fff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: mainYieldViewMode === 'USD' ? 700 : 400, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Nominal ({mainSettings.assetCurrency || 'USD'})
                </button>
                <button
                  onClick={() => {
                    if (mainSettings.localCurrency && mainSettings.localCurrency !== (mainSettings.assetCurrency || 'USD')) {
                      setMainYieldViewMode('FX');
                    } else if (mainSettings.localCurrency) {
                      setMainYieldViewMode('FX');
                    } else {
                      toast('Configura tu Divisa Local en ⚙️ primero.', { icon: 'ℹ️' });
                    }
                  }}
                  style={{ padding: '6px 16px', borderRadius: 16, border: 'none', background: mainYieldViewMode === 'FX' ? 'rgba(0, 229, 255, 0.15)' : 'transparent', color: mainYieldViewMode === 'FX' ? '#00e5ff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: mainYieldViewMode === 'FX' ? 700 : 400, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Divisa ({mainSettings.localCurrency || 'COP'}) {isFetchingMainFx && mainYieldViewMode === 'FX' && '⏳'}
                </button>
                <button
                  onClick={() => {
                    if (mainSettings.useAutoColInflation || (mainSettings.inflationRate > 0)) {
                      setMainYieldViewMode('REAL');
                    } else {
                      toast('Configura la Inflación en ⚙️ primero.', { icon: 'ℹ️' });
                    }
                  }}
                  style={{ padding: '6px 16px', borderRadius: 16, border: 'none', background: mainYieldViewMode === 'REAL' ? 'rgba(245, 158, 11, 0.15)' : 'transparent', color: mainYieldViewMode === 'REAL' ? '#f59e0b' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: mainYieldViewMode === 'REAL' ? 700 : 400, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Poder Adquisitivo Real {isFetchingMainInflation && mainYieldViewMode === 'REAL' && '⏳'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setShowMainInflationExplorer(true)}
                  style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#fbbf24', padding: '6px 14px', borderRadius: '14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  🔍 Ver Historial IPC ({mainColInflationData.latest?.yoy ? `${mainColInflationData.latest.yoy}%` : 'Colombia'})
                </button>

                <button
                  onClick={() => setShowMainSettingsModal(true)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  ⚙️ Configurar Divisa/Inflación
                </button>
              </div>
            </div>

            {/* ── Summary strip with % and $ Unit Toggle ─── */}
            {summary && !loading && (() => {
              let fxMultiplier = 1.0;
              if (mainYieldViewMode !== 'USD') {
                fxMultiplier = mainFxData.current || 1.0;
              }

              // Calculate inflation factor for the selected period
              let periodInflationFactor = 1.0;
              const yoyRate = mainSettings.useAutoColInflation 
                ? (mainColInflationData.latest?.yoy || 5.16) 
                : (mainSettings.inflationRate || 0);

              if (yoyRate > 0) {
                const years = period === '1W' ? 1/52 : period === '1M' ? 1/12 : period === '3M' ? 3/12 : period === '6M' ? 6/12 : period === '1Y' ? 1 : period === '3Y' ? 3 : period === '5Y' ? 5 : 5;
                periodInflationFactor = Math.pow(1 + yoyRate / 100, years);
              }

              const inflationFactor = mainYieldViewMode === 'REAL' ? periodInflationFactor : 1.0;

              const rawActiveInvested = summary.active_invested || (investment - (summary.cash_reserved || 0));
              const activeInvested = rawActiveInvested * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0);
              
              const rawActiveStockVal = summary.active_stock_value || (rawActiveInvested + (summary.active_return ?? 0));
              const currentStockValueAdjusted = (rawActiveStockVal * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0)) / inflationFactor;
              
              const activeReturnUsd = currentStockValueAdjusted - activeInvested;
              const activeReturnPct = activeInvested > 0 ? (activeReturnUsd / activeInvested) * 100 : 0;
              const isActGain = (unit === 'pct' ? activeReturnPct : activeReturnUsd) >= 0;

              const alphaSPPct = summary.alpha_sp500 ?? 0;
              const alphaSPUsd = (summary.alpha_sp500_usd ?? (activeReturnUsd - (summary.sp500_return || 0))) * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0);

              const alphaNDPct = summary.alpha_nasdaq ?? 0;
              const alphaNDUsd = (summary.alpha_nasdaq_usd ?? (activeReturnUsd - (summary.nasdaq_return || 0))) * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0);

              const maxDDPct = summary.max_drawdown_pct ?? 0;
              const maxDDUsd = (summary.max_drawdown_usd ?? 0) * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0);

              const currSymbol = mainYieldViewMode === 'USD' ? (mainSettings.assetCurrency || 'USD') : (mainSettings.localCurrency || 'COP');

              return (
                <>
                  <div className="summary-strip fade-up" style={{ position: 'relative' }}>
                  <SummaryItem
                    label={`Capital Activo (${summary.num_holdings} Acciones - ${currSymbol})`}
                    value={`$${activeInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    large mono
                  />
                  <div className="summary-divider" />
                  <SummaryItem
                    label={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span>Rendimiento {mainYieldViewMode === 'REAL' ? 'Real (Ajustado)' : 'Titanes'}</span>
                      </div>
                    }
                    value={
                      <span
                        className={`badge ${isActGain ? 'gain' : 'loss'}`}
                        style={{ fontSize: '0.95rem', padding: '4px 10px', cursor: 'pointer', color: mainYieldViewMode === 'REAL' ? '#f59e0b' : undefined }}
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
                    value={`$${((summary.cash_reserved ?? 0) * (mainYieldViewMode !== 'USD' ? fxMultiplier : 1.0)).toFixed(2)}`}
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

                {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
                <div className="fade-up" style={{ marginTop: 12, marginBottom: 16, padding: '14px 20px', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>📊 Comparativa de Rendimiento Multinivel (Nominal ➔ Divisa ➔ Real)</span>
                    <span style={{ fontSize: '0.74rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 6 }}>
                      {mainSettings.useAutoColInflation ? 'IPC Automático (FRED/DANE)' : `Inflación Manual ${mainSettings.inflationRate || 0}%/año`}
                    </span>
                  </div>
                  {(() => {
                    const nomInvested = rawActiveInvested;
                    const nomReturnUsd = summary.active_return ?? ((summary.active_stock_value || nomInvested) - nomInvested);
                    const nomReturnPct = summary.active_return_pct ?? 0;

                    const fxMult = mainFxData.current || 1.0;
                    const fxInvested = nomInvested * fxMult;
                    const fxStockVal = (rawActiveStockVal) * fxMult;
                    const fxReturnNet = fxStockVal - fxInvested;
                    const fxReturnPct = fxInvested > 0 ? (fxReturnNet / fxInvested) * 100 : 0;

                    const realStockVal = fxStockVal / periodInflationFactor;
                    const realReturnNet = realStockVal - fxInvested;
                    const realReturnPct = fxInvested > 0 ? (realReturnNet / fxInvested) * 100 : 0;

                    const inflationLossAmount = fxStockVal - realStockVal;
                    const inflationLossPct = fxInvested > 0 ? (inflationLossAmount / fxInvested) * 100 : 0;

                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                          {/* Level 1: Nominal */}
                          <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>1. Nominal ({mainSettings.assetCurrency || 'USD'})</div>
                            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: nomReturnUsd >= 0 ? '#4ade80' : '#f87171', marginTop: 4 }}>
                              {nomReturnUsd >= 0 ? '+' : ''}${nomReturnUsd.toFixed(2)} ({nomReturnPct >= 0 ? '+' : ''}{nomReturnPct.toFixed(2)}%)
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Crecimiento puro del ETF en dólares
                            </div>
                          </div>

                          {/* Level 2: FX Adjusted */}
                          <div style={{ padding: 10, background: 'rgba(0, 229, 255, 0.03)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.15)' }}>
                            <div style={{ fontSize: '0.72rem', color: '#00e5ff', textTransform: 'uppercase' }}>2. Al Cambio Divisa ({mainSettings.localCurrency || 'COP'})</div>
                            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: fxReturnNet >= 0 ? '#4ade80' : '#f87171', marginTop: 4 }}>
                              {fxReturnNet >= 0 ? '+' : ''}${fxReturnNet.toFixed(2)} ({fxReturnPct >= 0 ? '+' : ''}{fxReturnPct.toFixed(2)}%)
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Tipo de cambio: ${fxMult.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          {/* Level 3: Real Purchasing Power */}
                          <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.03)', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                            <div style={{ fontSize: '0.72rem', color: '#f59e0b', textTransform: 'uppercase' }}>3. Poder Adquisitivo Real</div>
                            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: realReturnNet >= 0 ? '#f59e0b' : '#f87171', marginTop: 4 }}>
                              {realReturnNet >= 0 ? '+' : ''}${realReturnNet.toFixed(2)} ({realReturnPct >= 0 ? '+' : ''}{realReturnPct.toFixed(2)}%)
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Factor Inflación: -{((periodInflationFactor - 1) * 100).toFixed(2)}% ({period})
                            </div>
                          </div>
                        </div>

                        {/* Explicit Deduction Equation Bar */}
                        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245, 158, 11, 0.06)', borderRadius: 8, border: '1px dashed rgba(245, 158, 11, 0.25)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ color: '#00e5ff', fontWeight: 700 }}>Ganancia Bruta ({mainSettings.localCurrency || 'COP'}):</span>
                            <span className="mono" style={{ color: fxReturnNet >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                              {fxReturnNet >= 0 ? '+' : ''}${fxReturnNet.toFixed(2)}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>➖</span>
                            <span style={{ color: '#f87171', fontWeight: 700 }}>Descuento Inflación (IPC):</span>
                            <span className="mono" style={{ color: '#f87171', fontWeight: 700 }}>
                              -${inflationLossAmount.toFixed(2)} ({inflationLossPct.toFixed(2)}%)
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>🟰</span>
                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>Ganancia Real Neta:</span>
                            <span className="mono" style={{ color: realReturnNet >= 0 ? '#f59e0b' : '#f87171', fontWeight: 800 }}>
                              {realReturnNet >= 0 ? '+' : ''}${realReturnNet.toFixed(2)} ({realReturnPct >= 0 ? '+' : ''}{realReturnPct.toFixed(2)}% Real)
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                </>
              );
            })()}

            {/* ── Main Portfolio Settings Modal ────────────────── */}
            {showMainSettingsModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                <div className="card fade-up" style={{ width: '100%', maxWidth: 450, padding: 24, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ margin: '0 0 20px 0', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>⚙️ Configuración del Portafolio Principal</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Divisa del Activo</label>
                      <select 
                        value={mainSettings.assetCurrency || 'USD'}
                        onChange={(e) => setMainPortfolioSettings({ assetCurrency: e.target.value })}
                        className="input" 
                        style={{ width: '100%' }}
                      >
                        <option value="USD">USD - Dólar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - Libra</option>
                        <option value="COP">COP - Peso Col.</option>
                        <option value="MXN">MXN - Peso Mex.</option>
                        <option value="CLP">CLP - Peso Chi.</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Divisa Local</label>
                      <select 
                        value={mainSettings.localCurrency || 'COP'}
                        onChange={(e) => setMainPortfolioSettings({ localCurrency: e.target.value })}
                        className="input" 
                        style={{ width: '100%' }}
                      >
                        <option value="COP">COP - Peso Col.</option>
                        <option value="MXN">MXN - Peso Mex.</option>
                        <option value="CLP">CLP - Peso Chi.</option>
                        <option value="USD">USD - Dólar</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
                      <input 
                        type="checkbox"
                        checked={mainSettings.useAutoColInflation || false}
                        onChange={(e) => setMainPortfolioSettings({ useAutoColInflation: e.target.checked })}
                      />
                      Usar Inflación Automática (Colombia, mensual)
                    </label>

                    {!mainSettings.useAutoColInflation && (
                      <>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Inflación Anual Manual (%)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          min="0"
                          value={mainSettings.inflationRate || 0}
                          onChange={(e) => setMainPortfolioSettings({ inflationRate: parseFloat(e.target.value) || 0 })}
                          className="input" 
                          style={{ width: '100%' }}
                        />
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowMainSettingsModal(false)} className="btn btn-primary" style={{ minWidth: 100 }}>
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            )}

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

      {/* ── Main Portfolio Inflation Explorer Modal ────── */}
      <InflationExplorerModal
        isOpen={showMainInflationExplorer}
        onClose={() => setShowMainInflationExplorer(false)}
        inflationData={mainColInflationData}
      />

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


