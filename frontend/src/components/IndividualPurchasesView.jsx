import { useState, useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import { usePortfolioStore } from '../store/portfolioStore';
import { searchTicker, searchTickersMultiple, fetchLiveQuotes, fetchHistoricalPrice, fetchIndicesHistory } from '../api/client';
import toast from 'react-hot-toast';
import { toastConfirm, toastPrompt } from '../utils/toastAlerts';
import { analyzeInvestmentPlan } from '../utils/investmentPlanAnalyzer';
import PlanConfigModal from './PlanConfigModal';

export default function IndividualPurchasesView({ portfolioId = 'hist_default' }) {
  const {
    individualPurchases,
    addPurchase,
    removePurchase,
    updatePurchase,
    updateMultiplePurchases,
    purchasePortfolios,
    deletePurchasePortfolio,
    isBatchUpdating,
    batchProgress,
    runBatchRecalculate,
    setAbortBatch,
    togglePortfolioPlan
  } = usePortfolioStore();

  // Editing state
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editInvested, setEditInvested] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editTicker, setEditTicker] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);

  const portfolio = purchasePortfolios?.find(p => p.id === portfolioId) || { name: 'Histórico' };
  
  // Smart Analysis
  const autoPlanAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;
    return analyzeInvestmentPlan(individualPurchases.filter(p => p.portfolioId === portfolioId));
  }, [portfolio.isPlan, individualPurchases, portfolioId]);

  const planAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;
    
    // Si hay configuración manual, úsala. Si no, usa la autodetectada.
    if (portfolio.planConfig) {
      let nextDateStr = null;
      if (autoPlanAnalysis?.nextDate) {
        nextDateStr = autoPlanAnalysis.nextDate;
      } else {
        // Fallback para próxima fecha si no hay nada de data: usar fecha actual + frecuencia
        const d = new Date();
        d.setDate(d.getDate() + (portfolio.planConfig.frequencyDays || 15));
        nextDateStr = d.toISOString().split('T')[0];
      }
      
      return {
        ...portfolio.planConfig,
        nextDate: nextDateStr,
        isManual: true
      };
    }
    
    if (autoPlanAnalysis && autoPlanAnalysis.frequencyDays) {
      return { ...autoPlanAnalysis, isManual: false };
    }
    
    return null;
  }, [portfolio.isPlan, portfolio.planConfig, autoPlanAnalysis]);

  const currentPurchases = useMemo(() => {
    return individualPurchases.filter(p => p.portfolioId === portfolioId);
  }, [individualPurchases, portfolioId]);


  // Form State
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [investedAmount, setInvestedAmount] = useState(500);
  const [price, setPrice] = useState(100);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [searchResults, setSearchResults] = useState([]);

  // Visibility state
  const [visibleSeries, setVisibleSeries] = useState({
    valor: true,
    sp500: true,
    nasdaq: true,
    invested: true
  });
  const toggleSeries = (key) => setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));

  // Live quotes state for existing purchases
  const [liveQuotes, setLiveQuotes] = useState({});
  const [indicesHistory, setIndicesHistory] = useState({});

  const earliestDate = useMemo(() => {
    if (currentPurchases.length === 0) return null;
    const sorted = [...currentPurchases].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted[0].date;
  }, [currentPurchases]);

  useEffect(() => {
    if (earliestDate) {
      fetchIndicesHistory(earliestDate).then(setIndicesHistory).catch(console.error);
    }
  }, [earliestDate]);

  // Chart References
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRefs = useRef({ invested: null, value: null, sp500: null, nasdaq: null });

  useEffect(() => {
    if (seriesRefs.current.invested) seriesRefs.current.invested.applyOptions({ visible: visibleSeries.invested });
    if (seriesRefs.current.value) seriesRefs.current.value.applyOptions({ visible: visibleSeries.valor });
    if (seriesRefs.current.sp500) seriesRefs.current.sp500.applyOptions({ visible: visibleSeries.sp500 });
    if (seriesRefs.current.nasdaq) seriesRefs.current.nasdaq.applyOptions({ visible: visibleSeries.nasdaq });
  }, [visibleSeries]);
  
  const handleTimeRange = (range) => {
    if (!chartInstanceRef.current) return;
    const timeScale = chartInstanceRef.current.timeScale();
    if (range === 'ALL') {
      timeScale.fitContent();
      return;
    }
    
    const toDate = new Date();
    const fromDate = new Date();
    
    if (range === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
    else if (range === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
    else if (range === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
    else if (range === 'YTD') {
      fromDate.setMonth(0);
      fromDate.setDate(1);
    }
    else if (range === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
    else if (range === '5Y') fromDate.setFullYear(fromDate.getFullYear() - 5);
    
    timeScale.setVisibleRange({
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0]
    });
  };
  
  const [isFetchingHistorical, setIsFetchingHistorical] = useState(false);

  // Auto-fetch historical price when creating a lot
  useEffect(() => {
    if (selectedMeta?.ticker && date) {
      setIsFetchingHistorical(true);
      fetchHistoricalPrice(selectedMeta.ticker, date)
        .then(res => {
          if (res && res.price) {
            setPrice(res.price);
          }
        })
        .finally(() => setIsFetchingHistorical(false));
    }
  }, [selectedMeta?.ticker, date]);

  // Auto-fetch historical price when editing a lot date
  useEffect(() => {
    if (editingPurchase?.ticker && editDate && editDate !== editingPurchase.date) {
      setIsFetchingHistorical(true);
      fetchHistoricalPrice(editingPurchase.ticker, editDate)
        .then(res => {
          if (res && res.price) {
            setEditPrice(res.price);
          }
        })
        .finally(() => setIsFetchingHistorical(false));
    }
  }, [editingPurchase?.ticker, editDate]);

  // Unique tickers from purchases to fetch live quotes
  const uniqueTickers = useMemo(() => {
    return [...new Set(currentPurchases.map(p => p.ticker))];
  }, [currentPurchases]);

  useEffect(() => {
    if (uniqueTickers.length === 0) return;

    const fetchQuotes = () => {
      fetchLiveQuotes(uniqueTickers)
        .then(res => {
          if (Array.isArray(res)) {
            const map = {};
            res.forEach(q => {
              map[q.ticker] = q;
            });
            setLiveQuotes(map);
          }
        })
        .catch(console.error);
    };

    fetchQuotes();
    const intervalId = setInterval(fetchQuotes, 60000); // Fetch every 60 seconds

    return () => clearInterval(intervalId);
  }, [uniqueTickers.join(',')]);

  const handleSearchTicker = async (e) => {
    e?.preventDefault();
    if (!ticker.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSelectedMeta(null);
    setSearchResults([]);
    try {
      const res = await searchTickersMultiple(ticker.trim());
      if (res.results && res.results.length > 0) {
        setSearchResults(res.results);
      } else {
        setSearchError(`"${ticker.toUpperCase()}" no encontrado.`);
      }
    } catch (err) {
      setSearchError('Error de red al buscar.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddPurchase = () => {
    if (!selectedMeta) {
      toast.error("Busca y verifica un ticker primero.");
      return;
    }
    if (Number(investedAmount) <= 0 || Number(price) <= 0) {
      toast.error("El monto invertido (Valor de apertura) y el precio deben ser mayores a cero.");
      return;
    }

    const inv = Number(investedAmount);
    const prc = Number(price);
    const calculatedShares = inv / prc;

    const newPurchase = {
      id: Date.now().toString(),
      ticker: selectedMeta.ticker,
      name: selectedMeta.name,
      date,
      investedAmount: inv,
      shares: calculatedShares,
      purchasePrice: prc,
      portfolioId,
    };

    addPurchase(newPurchase);

    setInvestedAmount(500);
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleSaveEditedPurchase = () => {
    if (!editingPurchase) return;
    const inv = Number(editInvested);
    const prc = Number(editPrice);

    if (inv <= 0 || prc <= 0) {
      toast.error("El monto invertido y el precio deben ser mayores a cero.");
      return;
    }

    const updated = {
      ...editingPurchase,
      ticker: editTicker.trim().toUpperCase(),
      date: editDate,
      investedAmount: inv,
      purchasePrice: prc,
      shares: inv / prc,
      manualCurrentPrice: Number(editingPurchase.manualCurrentPrice) || undefined, // will be updated below if we add it
    };

    updatePurchase(updated);
    setEditingPurchase(null);
    setEditInvested(0);
    setEditPrice(0);
    setEditDate('');
    setEditTicker('');
  };

  const handleSaveManualPrice = (p, manualPrice) => {
    updatePurchase({ ...p, manualCurrentPrice: Number(manualPrice) > 0 ? Number(manualPrice) : undefined });
  };

  // Calculations for ETF/ETC and Stock lots
  const lotDataList = useMemo(() => {
    return currentPurchases.map(p => {
      const invested = p.investedAmount ?? (p.shares * p.purchasePrice);
      const liveQuote = liveQuotes[p.ticker];
      const currentPrice = p.manualCurrentPrice || liveQuote?.price || p.purchasePrice;
      
      // Calculate current value based on return ratio (ideal for ETFs/ETCs)
      const ratio = p.purchasePrice > 0 ? (currentPrice / p.purchasePrice) : 1;
      const currentValue = invested * ratio;
      const profit = currentValue - invested;
      const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

      return {
        ...p,
        name: liveQuote?.name || p.name,
        invested,
        currentPrice,
        currentValue,
        profit,
        profitPct,
        isPositive: profit >= 0,
        hasLiveQuote: liveQuote?.price != null,
      };
    });
  }, [currentPurchases, liveQuotes]);

  const summary = useMemo(() => {
    let totalInvested = 0;
    let totalCurrentValue = 0;

    lotDataList.forEach(lot => {
      totalInvested += lot.invested;
      totalCurrentValue += lot.currentValue;
    });

    const netReturn = totalCurrentValue - totalInvested;
    const netReturnPct = totalInvested > 0 ? (netReturn / totalInvested) * 100 : 0;

    return { totalInvested, totalCurrentValue, netReturn, netReturnPct };
  }, [lotDataList]);

  // Group lots by ticker
  const groupedLots = useMemo(() => {
    const groups = {};
    lotDataList.forEach(p => {
      if (!groups[p.ticker]) {
        groups[p.ticker] = {
          ticker: p.ticker,
          name: p.name,
          lots: [],
          totalInvested: 0,
          totalCurrentValue: 0,
          totalShares: 0
        };
      }
      groups[p.ticker].lots.push(p);
      groups[p.ticker].totalInvested += p.invested;
      groups[p.ticker].totalCurrentValue += p.currentValue;
      groups[p.ticker].totalShares += p.shares;
    });

    Object.values(groups).forEach(g => {
      g.profit = g.totalCurrentValue - g.totalInvested;
      g.profitPct = g.totalInvested > 0 ? (g.profit / g.totalInvested) * 100 : 0;
      g.isPositive = g.profit >= 0;
      g.currentPrice = g.lots[0].currentPrice;
      g.avgOpenPrice = g.totalShares > 0 ? g.totalInvested / g.totalShares : 0;
      g.lots.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return Object.values(groups).sort((a, b) => b.totalInvested - a.totalInvested);
  }, [lotDataList]);

  const [expandedTickers, setExpandedTickers] = useState({});
  const toggleExpand = (ticker) => setExpandedTickers(prev => ({ ...prev, [ticker]: !prev[ticker] }));

  const handleEditParentTicker = async (group, e) => {
    e.stopPropagation();
    const newTicker = await toastPrompt(`Cambiar Ticker Padre: ${group.ticker}\n\nEscribe el nuevo Ticker. Esto modificará los ${group.lots.length} lotes automáticamente:`, group.ticker);
    if (!newTicker || newTicker.trim().toUpperCase() === group.ticker) return;

    const tickerUpper = newTicker.trim().toUpperCase();
    const isConfirmed = await toastConfirm(`¿Estás súper seguro de cambiar el ticker de TODOS los ${group.lots.length} lote(s) a "${tickerUpper}"?`);
    if (!isConfirmed) return;

    const updates = group.lots.map((p) => ({
      ...p,
      ticker: tickerUpper
    }));
    updateMultiplePurchases(updates);
    toast.success(`Se actualizaron ${group.lots.length} lotes al nuevo ticker ${tickerUpper}.`);
  };

  const handleStopBatch = () => {
    setAbortBatch();
  };

  const handleBatchRecalculate = async () => {
    if (!currentPurchases.length) return;
    const isConfirmed = await toastConfirm('Esto actualizará el Precio de Apertura de TODOS los lotes consultando el precio histórico real de Yahoo Finance.\n\n¿Deseas continuar?');
    if (!isConfirmed) return;

    runBatchRecalculate(currentPurchases);
  };

  // Historical Chart Rendering
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    if (currentPurchases.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#94a3b8',
        autoScale: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { price: true, time: true } },
    });

    chartInstanceRef.current = chart;

    seriesRefs.current.invested = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      visible: visibleSeries.invested,
    });

    seriesRefs.current.value = chart.addAreaSeries({
      lineColor: '#00e5ff',
      topColor: 'rgba(0, 229, 255, 0.25)',
      bottomColor: 'rgba(0, 229, 255, 0.0)',
      lineWidth: 2,
      visible: visibleSeries.valor,
    });

    seriesRefs.current.sp500 = chart.addLineSeries({
      color: '#ec4899', // pink
      lineWidth: 2,
      visible: visibleSeries.sp500,
    });

    seriesRefs.current.nasdaq = chart.addLineSeries({
      color: '#8b5cf6', // purple
      lineWidth: 2,
      visible: visibleSeries.nasdaq,
    });

    const getClosestIndexPrice = (dateStr, indexName) => {
      let d = new Date(dateStr);
      for (let i = 0; i < 10; i++) {
        const str = d.toISOString().split('T')[0];
        if (indicesHistory[str] && indicesHistory[str][indexName]) {
          return indicesHistory[str][indexName];
        }
        d.setDate(d.getDate() - 1);
      }
      return null;
    };

    const sortedPurchases = [...lotDataList].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTime = new Date(todayStr).getTime();
    
    // Generate timeline dates: purchase dates + today + 1st of every month in between
    const datesSet = new Set([...sortedPurchases.map(p => p.date), todayStr]);
    if (sortedPurchases.length > 0) {
      let currentDate = new Date(sortedPurchases[0].date);
      const endDate = new Date(todayStr);
      currentDate.setDate(1);
      while (currentDate <= endDate) {
        datesSet.add(currentDate.toISOString().split('T')[0]);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }
    
    const uniqueDates = Array.from(datesSet).sort();

    const investedData = [];
    const valueData = [];
    const sp500Data = [];
    const nasdaqData = [];

    uniqueDates.forEach(dateStr => {
      const dateTime = new Date(dateStr).getTime();
      let totalInvested = 0;
      let totalValue = 0;
      let totalSp500 = 0;
      let totalNasdaq = 0;

      const currentSp500 = getClosestIndexPrice(dateStr, 'SP500');
      const currentNasdaq = getClosestIndexPrice(dateStr, 'NASDAQ');

      sortedPurchases.forEach(lot => {
        const lotStartTime = new Date(lot.date).getTime();
        
        if (lotStartTime <= dateTime) {
          totalInvested += lot.invested;
          
          if (currentSp500) {
            const lotStartSp500 = getClosestIndexPrice(lot.date, 'SP500');
            if (lotStartSp500) totalSp500 += lot.invested * (currentSp500 / lotStartSp500);
            else totalSp500 += lot.invested;
          } else {
            totalSp500 += lot.invested;
          }

          if (currentNasdaq) {
            const lotStartNasdaq = getClosestIndexPrice(lot.date, 'NASDAQ');
            if (lotStartNasdaq) totalNasdaq += lot.invested * (currentNasdaq / lotStartNasdaq);
            else totalNasdaq += lot.invested;
          } else {
            totalNasdaq += lot.invested;
          }
          
          if (dateStr === todayStr) {
            totalValue += lot.currentValue;
          } else if (dateStr === lot.date) {
            totalValue += lot.invested; // At purchase time, value is exactly what was invested
          } else {
            // Linearly interpolate value for realistic historical growth curve
            if (todayTime > lotStartTime) {
              const progress = (dateTime - lotStartTime) / (todayTime - lotStartTime);
              const interpolatedValue = lot.invested + (lot.currentValue - lot.invested) * progress;
              totalValue += interpolatedValue;
            } else {
              totalValue += lot.currentValue;
            }
          }
        }
      });

      investedData.push({ time: dateStr, value: Number(totalInvested.toFixed(2)) });
      valueData.push({ time: dateStr, value: Number(totalValue.toFixed(2)) });
      sp500Data.push({ time: dateStr, value: Number(totalSp500.toFixed(2)) });
      nasdaqData.push({ time: dateStr, value: Number(totalNasdaq.toFixed(2)) });
    });

    seriesRefs.current.invested.setData(investedData);
    seriesRefs.current.value.setData(valueData);
    seriesRefs.current.sp500.setData(sp500Data);
    seriesRefs.current.nasdaq.setData(nasdaqData);

    chart.timeScale().fitContent();

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [lotDataList, indicesHistory]);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60, padding: 20 }}>
      {/* HEADER & SUMMARY */}
      <div className="card fade-up" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span>🛒</span> {portfolio.name}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
              Registra y trackea compras reales de ETFs, ETCs o Acciones con sus valores de apertura exactos.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: portfolio.isPlan ? '#00e5ff' : 'var(--text-secondary)' }}>
                <input 
                  type="checkbox" 
                  checked={!!portfolio.isPlan} 
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    togglePortfolioPlan(portfolioId, isChecked, portfolio.planConfig);
                    if (isChecked && (!autoPlanAnalysis || !autoPlanAnalysis.frequencyDays) && !portfolio.planConfig) {
                      setShowPlanModal(true);
                    }
                  }}
                  style={{ accentColor: '#00e5ff', width: 16, height: 16 }}
                />
                🤖 Convertir en Plan de Inversión Frecuente
              </label>
            </div>
          </div>
          
          {portfolioId !== 'hist_default' && (
            <button
              onClick={async () => {
                const isConfirmed = await toastConfirm(`¿Estás seguro de eliminar el portafolio "${portfolio.name}" y todas sus compras?`);
                if (isConfirmed) {
                  deletePurchasePortfolio(portfolioId);
                }
              }}
              className="btn btn-sm"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              🗑️ Eliminar Portafolio
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Capital Total Invertido</div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>
              ${summary.totalInvested.toFixed(2)}
            </div>
          </div>
          <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valor Actual</div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#00e5ff' }}>
              ${summary.totalCurrentValue.toFixed(2)}
            </div>
          </div>
          <div style={{ padding: 16, background: summary.netReturn >= 0 ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius)', border: `1px solid ${summary.netReturn >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
            <div style={{ fontSize: '0.75rem', color: summary.netReturn >= 0 ? '#4ade80' : '#f87171' }}>Beneficio Neto Total</div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: summary.netReturn >= 0 ? '#4ade80' : '#f87171' }}>
              {summary.netReturn >= 0 ? '+' : ''}${summary.netReturn.toFixed(2)}
              <span style={{ fontSize: '0.8rem', marginLeft: 8 }}>({summary.netReturnPct >= 0 ? '+' : ''}{summary.netReturnPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* SMART ANALYSIS CARD */}
      {portfolio.isPlan && (
        <div className="card fade-up" style={{ padding: '20px', marginBottom: '24px', background: 'rgba(0, 229, 255, 0.03)', border: '1px solid rgba(0, 229, 255, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 700, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🤖</span> Análisis Inteligente del Plan {planAnalysis?.isManual && <span style={{ fontSize: '0.7rem', background: '#00e5ff20', padding: '2px 6px', borderRadius: 10 }}>(Manual)</span>}
            </h3>
            <button onClick={() => setShowPlanModal(true)} className="btn btn-sm" style={{ background: 'transparent', border: '1px solid rgba(0, 229, 255, 0.3)', color: '#00e5ff' }}>
              ⚙️ Configurar
            </button>
          </div>
          
          {planAnalysis ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Frecuencia Detectada</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }}>
                    {planAnalysis.frequencyDays ? `Cada ${planAnalysis.frequencyDays} días` : '---'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inversión Promedio</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }}>
                    ${planAnalysis.avgAmount?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Próxima Inversión Esperada</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: planAnalysis.nextDate ? '#4ade80' : 'var(--text-muted)' }}>
                    {planAnalysis.nextDate ? planAnalysis.nextDate : '---'}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Distribución Objetivo Detectada (Promedio):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {planAnalysis.distribution && Object.entries(planAnalysis.distribution).map(([ticker, pct]) => (
                    <div key={ticker} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>{ticker}</span>
                      <span style={{ color: '#00e5ff' }}>{pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              No hay suficientes datos para detectar un patrón automáticamente.<br/>
              <button onClick={() => setShowPlanModal(true)} className="btn btn-sm btn-primary" style={{ marginTop: 12 }}>Configurar Manualmente</button>
            </div>
          )}
        </div>
      )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Frecuencia Detectada</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }}>
                {planAnalysis.frequencyDays ? `Cada ${planAnalysis.frequencyDays} días` : 'No hay suficientes datos'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inversión Promedio</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }}>
                ${planAnalysis.avgAmount.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Próxima Inversión Esperada</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: planAnalysis.nextDate ? '#4ade80' : 'var(--text-muted)' }}>
                {planAnalysis.nextDate ? planAnalysis.nextDate : '---'}
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Distribución Objetivo Detectada (Promedio):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {Object.entries(planAnalysis.distribution).map(([ticker, pct]) => (
                <div key={ticker} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>{ticker}</span>
                  <span style={{ color: '#00e5ff' }}>{pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GRAPH CONTAINER */}
      <div className="card fade-up" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📈</span>
            <span>Evolución del Portafolio Histórico</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem' }}>
              <button onClick={() => toggleSeries('valor')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#00e5ff', opacity: visibleSeries.valor ? 1 : 0.4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#00e5ff' }} /> Valor
              </button>
              <button onClick={() => toggleSeries('sp500')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#ec4899', opacity: visibleSeries.sp500 ? 1 : 0.4 }}>
                <span style={{ width: 10, height: 2, background: '#ec4899' }} /> S&P 500
              </button>
              <button onClick={() => toggleSeries('nasdaq')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#8b5cf6', opacity: visibleSeries.nasdaq ? 1 : 0.4 }}>
                <span style={{ width: 10, height: 2, background: '#8b5cf6' }} /> NASDAQ
              </button>
              <button onClick={() => toggleSeries('invested')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b', opacity: visibleSeries.invested ? 1 : 0.4 }}>
                <span style={{ width: 10, height: 2, background: '#f59e0b' }} /> Invertido
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 6 }}>
              {['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'].map(range => (
                <button
                  key={range}
                  onClick={() => handleTimeRange(range)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-secondary)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>

        {currentPurchases.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Registra tu primera compra para ver la gráfica de evolución temporal.
          </div>
        ) : (
          <div ref={chartContainerRef} style={{ width: '100%', height: 500 }} />
        )}
      </div>

      {/* EDIT PURCHASE MODAL */}
      {editingPurchase && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '24px', width: '340px', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: '16px', fontWeight: 700, color: '#f1f5f9' }}>✏️ Editar Compra</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ticker</label>
              <input
                type="text"
                value={editTicker}
                onChange={e => setEditTicker(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Valor de Apertura (Inversión USD)</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={editInvested}
                onChange={e => setEditInvested(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff' }}
              />
            </div>
            <div className="form-control">
                <label className="label"><span className="label-text">Fecha de Compra</span></label>
                <input
                  type="date"
                  className="input input-bordered"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Precio de Apertura {isFetchingHistorical && <span style={{color: '#f59e0b', fontSize: '0.7rem'}}>Buscando...</span>}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input input-bordered"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEditingPurchase(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEditedPurchase}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* FORM & PURCHASES LIST */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24, alignItems: 'start' }}>
        
        {/* ADD PURCHASE FORM */}
        <div className="card fade-up" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>➕</span>
            <span>Registrar Compra (ETF/ETC/Acción)</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>1. Buscar Ticker / ETF</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ticker (ej. SMH, QQQ, TSLA)"
                  value={ticker}
                  onChange={(e) => {
                    setTicker(e.target.value.toUpperCase());
                    setSelectedMeta(null);
                    setSearchResults([]);
                    setSearchError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchTicker()}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }}
                />
                <button type="button" className="btn btn-ghost" onClick={handleSearchTicker} disabled={isSearching || !ticker}>
                  {isSearching ? '⏳' : 'Buscar'}
                </button>
              </div>
              {searchError && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4 }}>{searchError}</div>}
              
              {searchResults.length > 0 && !selectedMeta && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '300px', overflowY: 'auto' }}>
                  {searchResults.map((r, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setTicker(r.ticker);
                        setSelectedMeta(r);
                        setPrice(r.price > 0 ? r.price : 100);
                        setSearchResults([]);
                      }}
                      style={{ cursor: 'pointer', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '4px', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 800, color: '#00e5ff', fontSize: '1.05rem' }}>{r.ticker}</div>
                        {r.price > 0 && <div style={{ fontWeight: 700 }}>${r.price}</div>}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 500 }}>{r.name}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 4 }}>
                        {r.exchange && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>🏛️ {r.exchange}</span>}
                        {r.quoteType && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>📊 {r.quoteType}</span>}
                        {r.currency && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>💵 {r.currency}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedMeta && (
                <div style={{ marginTop: 12, padding: '16px', background: 'rgba(0, 229, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.2rem', color: '#00e5ff', fontWeight: 800 }}>{selectedMeta.ticker}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#fff', marginTop: '2px' }}>{selectedMeta.name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>${selectedMeta.price}</div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 4 }}>
                    {selectedMeta.exchange && <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>🏛️ {selectedMeta.exchange}</span>}
                    {selectedMeta.quoteType && <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>📊 {selectedMeta.quoteType}</span>}
                    {selectedMeta.currency && <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>💵 {selectedMeta.currency}</span>}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>3. Valor de Apertura (Monto Invertido en USD)</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={investedAmount}
                onChange={(e) => setInvestedAmount(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#fff', fontSize: '0.8rem' }}
              />
            </div>
            
            <div className="form-control">
                <label className="label"><span className="label-text">Volumen / Acciones</span></label>
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius)', fontSize: '1.1rem', fontWeight: 600 }}>
                  {price > 0 ? (investedAmount / price).toFixed(4) : 0} uds
                </div>
              </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-control">
                <label className="label"><span className="label-text">Fecha de Compra</span></label>
                <input
                  type="date"
                  className="input input-bordered"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Precio de Apertura {isFetchingHistorical && <span style={{color: '#f59e0b', fontSize: '0.7rem'}}>Buscando...</span>}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input input-bordered"
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                />
                <label className="label"><span className="label-text-alt text-muted">Auto-completado por fecha</span></label>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 8, padding: '12px', fontWeight: 700, fontSize: '0.85rem' }}
              disabled={!selectedMeta}
              onClick={handleAddPurchase}
            >
              Registrar Compra
            </button>
          </div>
        </div>

        {/* PURCHASES LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Tus Lotes Agrupados</h3>
            {lotDataList.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  style={{ background: isBatchUpdating ? 'var(--bg-surface)' : 'rgba(0, 229, 255, 0.1)', color: '#00e5ff', border: '1px solid rgba(0, 229, 255, 0.2)' }}
                  onClick={handleBatchRecalculate}
                  disabled={isBatchUpdating}
                >
                  {isBatchUpdating ? `⏳ Recalculando... ${batchProgress.current}/${batchProgress.total}` : '🔄 Auto-Calcular Todo'}
                </button>
                {isBatchUpdating && (
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                    onClick={handleStopBatch}
                  >
                    🛑 Detener
                  </button>
                )}
              </div>
            )}
          </div>

          {groupedLots.length === 0 ? (
            <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Aún no has registrado ninguna compra en este portafolio.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 650, overflowY: 'auto' }}>
              {groupedLots.map((group) => {
                const isExpanded = expandedTickers[group.ticker];
                return (
                  <div key={group.ticker} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* TICKER SUMMARY CARD */}
                    <div
                      className="card"
                      style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 'var(--radius)',
                        borderLeft: `4px solid ${group.isPositive ? '#22c55e' : '#ef4444'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onClick={() => toggleExpand(group.ticker)}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <strong style={{ fontSize: '1.1rem', color: '#f1f5f9' }}>{group.ticker}</strong>
                          <button
                            onClick={(e) => handleEditParentTicker(group, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              fontSize: '0.9rem'
                            }}
                            title="Editar Ticker a todos los lotes"
                            onMouseEnter={(e) => e.currentTarget.style.color = '#00e5ff'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            ✏️
                          </button>
                          <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                            {group.lots.length} Lote{group.lots.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {(() => {
                          const lq = liveQuotes[group.ticker];
                          return (
                            <>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lq?.name || group.name}</div>
                              {lq && (lq.exchange || lq.quoteType || lq.currency) && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 6 }}>
                                  {lq.exchange && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>🏛️ {lq.exchange}</span>}
                                  {lq.quoteType && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>📊 {lq.quoteType}</span>}
                                  {lq.currency && <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500 }}>💵 {lq.currency}</span>}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div style={{ textAlign: 'right', flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 24, marginRight: 16 }}>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Total Invertido</div>
                          <div className="mono" style={{ fontWeight: 700 }}>${group.totalInvested.toFixed(2)}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Volumen: {group.totalShares.toFixed(4)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Valor Mercado</div>
                          <div className="mono" style={{ fontWeight: 700, color: '#00e5ff' }}>${group.totalCurrentValue.toFixed(2)}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Apertura Prom: ${group.avgOpenPrice.toFixed(2)}</div>
                        </div>
                        <div style={{ minWidth: 100 }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Beneficio Neto</div>
                          <div style={{ color: group.isPositive ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: '0.9rem' }}>
                            {group.isPositive ? '+' : ''}${group.profit.toFixed(2)}
                            <div style={{ fontSize: '0.7rem' }}>({group.isPositive ? '+' : ''}{group.profitPct.toFixed(2)}%)</div>
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
                        {isExpanded ? '🔽' : '▶️'}
                      </div>
                    </div>

                    {/* EXPANDED INDIVIDUAL LOTS */}
                    {isExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 24 }}>
                        {group.lots.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              padding: '12px 16px',
                              background: 'rgba(0,0,0,0.2)',
                              borderRadius: 'var(--radius)',
                              borderLeft: `2px solid ${p.isPositive ? '#22c55e' : '#ef4444'}`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, color: '#e2e8f0' }}>
                                  {p.date}
                                </span>
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem' }}>
                                <div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Invertido</div>
                                  <div className="mono" style={{ fontWeight: 700 }}>${p.invested.toFixed(2)}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Apertura: ${p.purchasePrice.toFixed(2)}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Vol: {p.shares.toFixed(4)}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Valor Mercado</div>
                                  <div className="mono" style={{ fontWeight: 700, color: '#00e5ff' }}>${p.currentValue.toFixed(2)}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    Actual: ${p.currentPrice.toFixed(2)}
                                    {p.manualCurrentPrice && <span style={{ color: '#f59e0b', marginLeft: 4 }}>(Manual)</span>}
                                    {!p.hasLiveQuote && !p.manualCurrentPrice && <span style={{ color: '#ef4444', marginLeft: 4 }}>(Sin conexión)</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ marginTop: 4, color: p.isPositive ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: '0.8rem' }}>
                                Beneficio: {p.isPositive ? '+' : ''}${p.profit.toFixed(2)} ({p.isPositive ? '+' : ''}{p.profitPct.toFixed(2)}%)
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => {
                                  setEditingPurchase(p);
                                  setEditTicker(p.ticker);
                                  setEditInvested(p.investedAmount || p.invested);
                                  setEditPrice(p.purchasePrice);
                                  setEditDate(p.date);
                                }}
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={async () => {
                                  const newPrice = await toastPrompt(`Precio actual de mercado para ${p.ticker} (ej. XTB):`, p.currentPrice);
                                  if (newPrice !== null && !isNaN(Number(newPrice))) {
                                    handleSaveManualPrice(p, newPrice);
                                  }
                                }}
                                title="Corregir precio actual si Yahoo Finance no coincide con XTB"
                              >
                                ⚙️
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => removePurchase(p.id)}
                                title="Eliminar lote"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <PlanConfigModal 
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        initialConfig={portfolio.planConfig || autoPlanAnalysis}
        onSave={(newConfig) => {
          togglePortfolioPlan(portfolioId, true, newConfig);
          setShowPlanModal(false);
        }}
      />
    </div>
  );
}
