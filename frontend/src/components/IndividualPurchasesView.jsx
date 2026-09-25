import { ColorType, LineStyle, createChart } from "lightweight-charts";
import { useTheme } from "../context/ThemeContext";
import { getChartColors, applyChartTheme } from "../utils/chartTheme";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchColInflationHistory,
  fetchFxHistory,
  fetchHistoricalPrice,
  fetchIndicesHistory,
  fetchLiveQuotes,
  searchTicker,
  searchTickersMultiple,
} from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { analyzeInvestmentPlan } from "../utils/investmentPlanAnalyzer";
import { toastConfirm, toastPrompt } from "../utils/toastAlerts";
import { getBrokerEquivalenceInfo, getMarketOpenTime, MARKET_REGIONS, translateBrokerTicker } from "../utils/marketHours";
import { MarketScheduleBadge } from "./Common";
import AffiliateBanner from "./Common/AffiliateBanner";
import ChangeTickerModal from "./ChangeTickerModal";
import InflationExplorerModal from "./InflationExplorerModal";
import PlanConfigModal from "./PlanConfigModal";
import PlanExecutionModal from "./PlanExecutionModal";
import XtbImportModal from "./XtbImportModal";

export default function IndividualPurchasesView({ portfolioId = "hist_default", onSelectPortfolio }) {
  const {
    individualPurchases,
    purchaseSales,
    addPurchase,
    removePurchase,
    updatePurchase,
    updateMultiplePurchases,
    addPurchaseSale,
    removePurchaseSale,
    purchasePortfolios,
    addPurchasePortfolio,
    deletePurchasePortfolio,
    batchUpdateStatus,
    runBatchRecalculate,
    setAbortBatch,
    togglePortfolioPlan,
    updatePortfolioSettings,
  } = usePortfolioStore();

  const { theme } = useTheme();
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const status = batchUpdateStatus?.[portfolioId] || {};
  const isBatchUpdating = status.isUpdating || false;
  const batchProgress = status.progress || { current: 0, total: 0 };

  // Editing state
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editInvested, setEditInvested] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editCommissionAmount, setEditCommissionAmount] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [editPurchaseTime, setEditPurchaseTime] = useState("");
  const [editTicker, setEditTicker] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInflationExplorer, setShowInflationExplorer] = useState(false);
  const [showXtbModal, setShowXtbModal] = useState(false);
  const [changingTickerGroup, setChangingTickerGroup] = useState(null);

  // Selling state
  const [sellingLot, setSellingLot] = useState(null);
  const [saleMode, setSaleMode] = useState("shares"); // 'shares' | 'usd'
  const [saleShares, setSaleShares] = useState(0);
  const [saleAmountUSD, setSaleAmountUSD] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [saleCommission, setSaleCommission] = useState(0);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saleTime, setSaleTime] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  const portfolio = purchasePortfolios?.find((p) => p.id === portfolioId) || {
    name: "Histórico",
    assetCurrency: "USD",
    localCurrency: "USD",
    inflationRate: 0,
    useAutoColInflation: false,
  };

  // Yield View Mode: 'USD' | 'FX' | 'REAL'
  const [yieldViewMode, setYieldViewMode] = useState("USD");
  const [fxData, setFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingFx, setIsFetchingFx] = useState(false);
  const [colInflationData, setColInflationData] = useState({ history: {} });
  const [isFetchingInflation, setIsFetchingInflation] = useState(false);
  const [showBreakdownCard, setShowBreakdownCard] = useState(false);

  useEffect(() => {
    if (
      portfolio.assetCurrency &&
      portfolio.localCurrency &&
      portfolio.assetCurrency !== portfolio.localCurrency
    ) {
      setIsFetchingFx(true);
      fetchFxHistory(portfolio.assetCurrency, portfolio.localCurrency)
        .then((res) => setFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingFx(false));
    } else {
      setFxData({ current: 1.0, history: {} });
      if (yieldViewMode === "FX") setYieldViewMode("USD");
    }
  }, [portfolio.assetCurrency, portfolio.localCurrency]);

  useEffect(() => {
    setIsFetchingInflation(true);
    fetchColInflationHistory()
      .then((res) => setColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingInflation(false));
  }, []);

  // Smart Analysis
  const autoPlanAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;
    return analyzeInvestmentPlan(individualPurchases.filter((p) => p.portfolioId === portfolioId));
  }, [portfolio.isPlan, individualPurchases, portfolioId]);

  const planAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;

    // Si hay configuración manual, úsala. Si no, usa la autodetectada.
    if (portfolio.planConfig) {
      let nextDateStr = null;
      const currentPurchases = individualPurchases.filter((p) => p.portfolioId === portfolioId);

      if (currentPurchases.length > 0) {
        // Encontrar la última fecha de compra real
        const latestDateStr = currentPurchases.reduce(
          (latest, p) => (p.date > latest ? p.date : latest),
          currentPurchases[0].date,
        );
        const lastDate = new Date(latestDateStr);
        // Ajustar zona horaria
        lastDate.setMinutes(lastDate.getMinutes() + lastDate.getTimezoneOffset());
        lastDate.setDate(lastDate.getDate() + (portfolio.planConfig.frequencyDays || 15));
        nextDateStr = lastDate.toISOString().split("T")[0];
      } else {
        // Fallback para próxima fecha si no hay nada de data: usar fecha actual + frecuencia
        const d = new Date();
        d.setDate(d.getDate() + (portfolio.planConfig.frequencyDays || 15));
        nextDateStr = d.toISOString().split("T")[0];
      }

      return {
        ...portfolio.planConfig,
        nextDate: nextDateStr,
        isManual: true,
      };
    }

    if (autoPlanAnalysis && autoPlanAnalysis.frequencyDays) {
      return { ...autoPlanAnalysis, isManual: false };
    }

    return null;
  }, [portfolio.isPlan, portfolio.planConfig, autoPlanAnalysis]);

  const currentPurchases = useMemo(() => {
    return individualPurchases.filter((p) => p.portfolioId === portfolioId);
  }, [individualPurchases, portfolioId]);

  const currentSales = useMemo(() => {
    return (purchaseSales || [])
      .filter((s) => (s.portfolioId || s.portfolio_id) === portfolioId)
      .map((s) => ({
        id: s.id,
        lotId: s.lotId || s.lot_id,
        portfolioId: s.portfolioId || s.portfolio_id,
        ticker: s.ticker,
        saleDate: s.saleDate || s.sale_date,
        saleTime: s.saleTime || s.sale_time,
        salePrice: Number(s.salePrice ?? s.sale_price ?? 0),
        shares: Number(s.shares ?? 0),
        saleCommission: Number(s.saleCommission ?? s.sale_commission ?? 0),
        realizedPnl: Number(s.realizedPnl ?? s.realized_pnl ?? 0),
        notes: s.notes,
        purchaseDate: s.purchaseDate || s.purchase_date,
        costBasis: Number(s.costBasis ?? s.cost_basis ?? 0),
        // keep snake_case aliases for any legacy references
        portfolio_id: s.portfolioId || s.portfolio_id,
        sale_date: s.saleDate || s.sale_date,
        sale_time: s.saleTime || s.sale_time,
        sale_price: Number(s.salePrice ?? s.sale_price ?? 0),
        sale_commission: Number(s.saleCommission ?? s.sale_commission ?? 0),
        realized_pnl: Number(s.realizedPnl ?? s.realized_pnl ?? 0),
      }))
      .sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
  }, [purchaseSales, portfolioId]);

  const totalRealizedPnl = useMemo(() => {
    return currentSales.reduce((acc, s) => acc + (s.realizedPnl || 0), 0);
  }, [currentSales]);

  // Auto-asignar hora oficial de apertura de mercado a posiciones abiertas que no cuenten con hora registrada
  const processedNoTimeIdsRef = useRef(new Set());
  useEffect(() => {
    if (!currentPurchases || currentPurchases.length === 0) return;
    const purchasesWithoutTime = currentPurchases.filter(
      (p) =>
        (!p.purchaseTime || typeof p.purchaseTime !== "string" || !p.purchaseTime.trim()) &&
        !processedNoTimeIdsRef.current.has(p.id)
    );
    if (purchasesWithoutTime.length > 0) {
      purchasesWithoutTime.forEach((p) => processedNoTimeIdsRef.current.add(p.id));
      const updates = purchasesWithoutTime.map((p) => ({
        ...p,
        purchaseTime: getMarketOpenTime(p.ticker, p.exchange),
      }));
      updateMultiplePurchases(updates);
    }
  }, [currentPurchases, updateMultiplePurchases]);

  const cashReserve = useMemo(() => {
    if (!planAnalysis || !planAnalysis.avgAmount || !currentPurchases.length) return 0;

    const byDate = {};
    currentPurchases.forEach((p) => {
      if (!p.date) return;
      if (!byDate[p.date]) byDate[p.date] = 0;
      byDate[p.date] += (p.investedAmount ?? p.shares * p.purchasePrice) || 0;
    });

    let reserve = 0;
    Object.values(byDate).forEach((investedOnDate) => {
      // Considerarlo una ejecución del plan si la inversión no es desproporcionadamente grande
      // (asumimos que si invierte más del doble del objetivo, fue una compra manual extraordinaria)
      if (investedOnDate <= planAnalysis.avgAmount * 2) {
        reserve += planAnalysis.avgAmount - investedOnDate;
      }
    });

    return reserve;
  }, [planAnalysis, currentPurchases]);

  // Form State
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purchaseTime, setPurchaseTime] = useState("");
  const [investedAmount, setInvestedAmount] = useState(500);
  const [price, setPrice] = useState(100);
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchRegion, setSearchRegion] = useState("ALL");

  const purchaseTranslationInfo = useMemo(() => {
    return translateBrokerTicker(ticker);
  }, [ticker]);

  // Visibility state
  const [visibleSeries, setVisibleSeries] = useState({
    valor: true,
    sp500: true,
    nasdaq: true,
    invested: true,
  });
  const toggleSeries = (key) => setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));

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
      // Subtract 7 days to ensure we catch the previous valid trading day if earliestDate is a weekend/holiday
      const d = new Date(earliestDate);
      d.setDate(d.getDate() - 7);
      const safeStartDate = d.toISOString().split("T")[0];
      fetchIndicesHistory(safeStartDate).then(setIndicesHistory).catch(console.error);
    }
  }, [earliestDate]);

  // Chart References
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRefs = useRef({ invested: null, value: null, sp500: null, nasdaq: null });

  useEffect(() => {
    if (seriesRefs.current.invested)
      seriesRefs.current.invested.applyOptions({ visible: visibleSeries.invested });
    if (seriesRefs.current.value)
      seriesRefs.current.value.applyOptions({ visible: visibleSeries.valor });
    if (seriesRefs.current.sp500)
      seriesRefs.current.sp500.applyOptions({ visible: visibleSeries.sp500 });
    if (seriesRefs.current.nasdaq)
      seriesRefs.current.nasdaq.applyOptions({ visible: visibleSeries.nasdaq });
  }, [visibleSeries]);

  const handleTimeRange = (range) => {
    if (!chartInstanceRef.current) return;
    const timeScale = chartInstanceRef.current.timeScale();
    if (range === "ALL") {
      timeScale.fitContent();
      return;
    }

    const toDate = new Date();
    const fromDate = new Date();

    if (range === "1M") fromDate.setMonth(fromDate.getMonth() - 1);
    else if (range === "3M") fromDate.setMonth(fromDate.getMonth() - 3);
    else if (range === "6M") fromDate.setMonth(fromDate.getMonth() - 6);
    else if (range === "YTD") {
      fromDate.setMonth(0);
      fromDate.setDate(1);
    } else if (range === "1Y") fromDate.setFullYear(fromDate.getFullYear() - 1);
    else if (range === "5Y") fromDate.setFullYear(fromDate.getFullYear() - 5);

    const fromStr = fromDate.toISOString().split("T")[0];
    const from = earliestDate && fromStr < earliestDate ? earliestDate : fromStr;
    timeScale.setVisibleRange({
      from,
      to: toDate.toISOString().split("T")[0],
    });
  };

  const RANGE_MIN_DAYS = { "1M": 7, "3M": 30, "6M": 90, YTD: 0, "1Y": 180, "5Y": 1095, ALL: 0 };

  const isRangeEnabled = (range) => {
    if (!earliestDate) return true;
    const availableDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(`${earliestDate}T00:00:00Z`).getTime()) / 86400000),
    );
    return (RANGE_MIN_DAYS[range] ?? 0) <= availableDays;
  };

  const [isFetchingHistorical, setIsFetchingHistorical] = useState(false);

  // Auto-fetch historical price when creating a lot (supports date and exact intraday execution time)
  useEffect(() => {
    if (selectedMeta?.ticker && date) {
      setIsFetchingHistorical(true);
      fetchHistoricalPrice(selectedMeta.ticker, date, purchaseTime || null)
        .then((res) => {
          if (res && res.price) {
            setPrice(res.price);
          }
        })
        .finally(() => setIsFetchingHistorical(false));
    }
  }, [selectedMeta?.ticker, date, purchaseTime]);

  // Auto-fetch historical price when editing a lot date or execution time
  useEffect(() => {
    if (editingPurchase?.ticker && editDate) {
      const isDateChanged = editDate !== editingPurchase.date;
      const isTimeChanged = editPurchaseTime !== (editingPurchase.purchaseTime || "");
      if (isDateChanged || isTimeChanged) {
        setIsFetchingHistorical(true);
        fetchHistoricalPrice(editingPurchase.ticker, editDate, editPurchaseTime || null)
          .then((res) => {
            if (res && res.price) {
              setEditPrice(res.price);
            }
          })
          .finally(() => setIsFetchingHistorical(false));
      }
    }
  }, [editingPurchase?.ticker, editDate, editPurchaseTime]);

  // Unique tickers from purchases to fetch live quotes
  const uniqueTickers = useMemo(() => {
    return [...new Set(currentPurchases.map((p) => p.ticker))];
  }, [currentPurchases]);

  useEffect(() => {
    if (uniqueTickers.length === 0) return;

    const fetchQuotes = () => {
      fetchLiveQuotes(uniqueTickers)
        .then((res) => {
          if (Array.isArray(res)) {
            const map = {};
            res.forEach((q) => {
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
  }, [uniqueTickers.join(",")]);

  const handleSearchTicker = async (e) => {
    e?.preventDefault();
    if (!ticker.trim()) return;

    setIsSearching(true);
    setSearchError("");
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
      setSearchError("Error de red al buscar.");
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
    const defaultOpenTime = getMarketOpenTime(selectedMeta.ticker, selectedMeta.exchange);
    const finalPurchaseTime = purchaseTime.trim() || defaultOpenTime;

    const comm = Number(commissionAmount) || 0;

    const newPurchase = {
      id: Date.now().toString(),
      ticker: selectedMeta.ticker,
      name: selectedMeta.name,
      date,
      purchaseTime: finalPurchaseTime,
      investedAmount: inv,
      shares: calculatedShares,
      purchasePrice: prc,
      commissionAmount: comm,
      portfolioId,
    };

    addPurchase(newPurchase);

    setInvestedAmount(500);
    setCommissionAmount(0);
    setDate(new Date().toISOString().split("T")[0]);
    setPurchaseTime("");
  };

  const handleSaveEditedPurchase = () => {
    if (!editingPurchase) return;
    const inv = Number(editInvested);
    const prc = Number(editPrice);
    const comm = Number(editCommissionAmount) || 0;

    if (inv <= 0 || prc <= 0) {
      toast.error("El monto invertido y el precio deben ser mayores a cero.");
      return;
    }

    const defaultOpenTime = getMarketOpenTime(editTicker, editingPurchase.exchange);
    const finalPurchaseTime = editPurchaseTime.trim() || defaultOpenTime;

    const updated = {
      ...editingPurchase,
      ticker: editTicker.trim().toUpperCase(),
      date: editDate,
      purchaseTime: finalPurchaseTime,
      investedAmount: inv,
      purchasePrice: prc,
      commissionAmount: comm,
      shares: inv / prc,
      manualCurrentPrice: Number(editingPurchase.manualCurrentPrice) || undefined,
    };

    updatePurchase(updated);
    setEditingPurchase(null);
    setEditInvested(0);
    setEditPrice(0);
    setEditCommissionAmount(0);
    setEditDate("");
    setEditPurchaseTime("");
    setEditTicker("");
  };

  const handleExecuteSale = async () => {
    if (!sellingLot) return;
    const soldPrice = Number(salePrice);
    const soldComm = Number(saleCommission) || 0;
    const maxShares = Number(sellingLot.shares);

    if (soldPrice <= 0 || isNaN(soldPrice)) {
      toast.error("El precio de venta debe ser mayor a 0.");
      return;
    }

    let soldShares = 0;
    if (saleMode === "usd") {
      const amtUSD = Number(saleAmountUSD);
      if (amtUSD <= 0 || isNaN(amtUSD)) {
        toast.error("El monto en dólares a liquidar debe ser mayor a 0.");
        return;
      }
      soldShares = amtUSD / soldPrice;
    } else {
      soldShares = Number(saleShares);
      if (soldShares <= 0 || isNaN(soldShares)) {
        toast.error("Las unidades a vender deben ser mayores a 0.");
        return;
      }
    }

    // Si supera maxShares por más de un margen de redondeo minúsculo
    if (soldShares > maxShares + 1e-4) {
      toast.error(`No puedes vender más unidades de las disponibles (${maxShares.toFixed(4)} uds).`);
      return;
    }

    // Clamp si está muy cerca del 100%
    if (soldShares > maxShares) {
      soldShares = maxShares;
    }

    // Cost basis calculation (proportional)
    const originalInvested = Number(sellingLot.investedAmount || sellingLot.shares * sellingLot.purchasePrice);
    const costBasisSold = (soldShares / maxShares) * originalInvested;
    const grossRevenue = soldShares * soldPrice;
    const realizedPnl = grossRevenue - costBasisSold - soldComm;

    const saleRecord = {
      id: `sale_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      lot_id: sellingLot.id,
      lotId: sellingLot.id,
      portfolio_id: portfolioId,
      portfolioId: portfolioId,
      ticker: sellingLot.ticker,
      sale_date: saleDate,
      saleDate: saleDate,
      sale_time: saleTime.trim() || getMarketOpenTime(sellingLot.ticker, sellingLot.exchange),
      saleTime: saleTime.trim() || getMarketOpenTime(sellingLot.ticker, sellingLot.exchange),
      sale_price: soldPrice,
      salePrice: soldPrice,
      shares: soldShares,
      sale_commission: soldComm,
      saleCommission: soldComm,
      realized_pnl: realizedPnl,
      realizedPnl: realizedPnl,
      notes: saleNotes.trim() || undefined,
      purchase_date: sellingLot.date,
      purchaseDate: sellingLot.date,
      cost_basis: costBasisSold,
      costBasis: costBasisSold,
    };

    const remainingShares = Math.max(0, maxShares - soldShares);
    let updatedLot = null;

    if (remainingShares < 1e-5) {
      // 100% sold: lot is completely closed
      updatedLot = {
        ...sellingLot,
        shares: 0,
      };
    } else {
      // Partial sale: reduce shares and remaining invested amount proportionally
      const remainingInvested = originalInvested - costBasisSold;
      updatedLot = {
        ...sellingLot,
        shares: remainingShares,
        investedAmount: remainingInvested,
      };
    }

    await addPurchaseSale(saleRecord, updatedLot);
    setSellingLot(null);
    setSaleShares(0);
    setSaleAmountUSD(0);
    setSalePrice(0);
    setSaleCommission(0);
    setSaleNotes("");
  };

  const handleExecutePlan = async (purchases) => {
    const loadingToast = toast.loading("Registrando compras del plan...");
    try {
      for (const p of purchases) {
        const id = `buy_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const openTime = p.purchaseTime || getMarketOpenTime(p.ticker);
        await addPurchase({
          id,
          portfolioId,
          ticker: p.ticker,
          date: p.date,
          purchaseTime: openTime,
          purchasePrice: p.purchasePrice,
          shares: p.shares,
          manualCurrentPrice: 0,
        });
      }
      toast.success("¡Compras registradas exitosamente!", { id: loadingToast, icon: "🚀" });
      setShowExecutionModal(false);
    } catch (e) {
      toast.error("Error al registrar compras del plan", { id: loadingToast });
    }
  };

  const handleImportXtbPurchases = async (trades) => {
    for (const p of trades) {
      await addPurchase(p);
    }
  };

  const handleSaveManualPrice = (p, manualPrice) => {
    updatePurchase({
      ...p,
      manualCurrentPrice: Number(manualPrice) > 0 ? Number(manualPrice) : undefined,
    });
  };

  // Calculations for ETF/ETC and Stock lots
  const lotDataList = useMemo(() => {
    return currentPurchases.map((p) => {
      const invested = (p.shares && p.purchasePrice) ? p.shares * p.purchasePrice : (p.investedAmount ?? 0);
      const commission = Number(p.commissionAmount || 0);
      const liveQuote = liveQuotes[p.ticker];
      const currentPrice = p.manualCurrentPrice || liveQuote?.price || p.purchasePrice;

      // Calculate current value based on return ratio (ideal for ETFs/ETCs)
      const ratio = p.purchasePrice > 0 ? currentPrice / p.purchasePrice : 1;
      const currentValue = invested * ratio;
      // Net profit discounts broker / Plenti commission: profit = currentValue - (invested + commission)
      const totalCostBasis = invested + commission;
      const profit = currentValue - totalCostBasis;
      const profitPct = totalCostBasis > 0 ? (profit / totalCostBasis) * 100 : 0;

      // FX and Real Yield Calculations
      const historicalFx = fxData.history[p.date] || fxData.current || 1.0;
      const currentFx = fxData.current || 1.0;

      const investedFx = invested * historicalFx;
      const commissionFx = commission * historicalFx;
      const totalCostBasisFx = totalCostBasis * historicalFx;
      const currentValueFx = currentValue * currentFx;
      const profitFx = currentValueFx - totalCostBasisFx;
      const profitPctFx = totalCostBasisFx > 0 ? (profitFx / totalCostBasisFx) * 100 : 0;

      // FX-ISOLATED effect: gain/loss purely from currency movement (assumes zero asset change)
      const fxEffect = invested * (currentFx - historicalFx);
      const fxEffectPct = historicalFx > 0 ? ((currentFx - historicalFx) / historicalFx) * 100 : 0;

      // Real Yield (Inflation)
      let inflationFactor = 1.0;
      let inflationRatePct = 0.0;
      if (
        portfolio.useAutoColInflation &&
        colInflationData.history &&
        Object.keys(colInflationData.history).length > 0
      ) {
        // Find CPI for purchase month
        const pDate = new Date(p.date);
        const pYear = pDate.getFullYear();
        const pMonth = String(pDate.getMonth() + 1).padStart(2, "0");
        let cpiPurchase = colInflationData.history[`${pYear}-${pMonth}-01`];

        // Find latest CPI
        const dates = Object.keys(colInflationData.history).sort();
        const cpiCurrent = colInflationData.history[dates[dates.length - 1]];

        if (!cpiPurchase) {
          // fallback to closest available past date
          const pastDates = dates.filter((d) => d <= p.date);
          if (pastDates.length > 0)
            cpiPurchase = colInflationData.history[pastDates[pastDates.length - 1]];
          else cpiPurchase = cpiCurrent; // fallback to current if extremely old
        }

        if (cpiPurchase && cpiCurrent && cpiPurchase > 0) {
          inflationFactor = cpiCurrent / cpiPurchase;
          inflationRatePct = (inflationFactor - 1) * 100;
        }
      } else {
        const yearsElapsed = Math.max(
          0,
          (new Date().getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        );
        const inflationRate = portfolio.inflationRate || 0;
        inflationFactor = Math.pow(1 + inflationRate / 100, yearsElapsed);
        inflationRatePct = (inflationFactor - 1) * 100;
      }

      const currentValueReal = currentValueFx / (inflationFactor > 0 ? inflationFactor : 1.0);
      const inflationLoss = currentValueFx - currentValueReal;
      const profitReal = currentValueReal - totalCostBasisFx;
      const profitPctReal = totalCostBasisFx > 0 ? (profitReal / totalCostBasisFx) * 100 : 0;

      return {
        ...p,
        purchaseTime: p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange),
        name: liveQuote?.name || p.name,
        invested,
        commission,
        commissionFx,
        totalCostBasis,
        totalCostBasisFx,
        currentPrice,
        currentValue,
        profit,
        profitPct,
        investedFx,
        currentValueFx,
        profitFx,
        profitPctFx,
        fxEffect,
        fxEffectPct,
        inflationFactor,
        inflationRatePct,
        inflationLoss,
        currentValueReal,
        profitReal,
        profitPctReal,
        isPositive: profit >= 0,
        hasLiveQuote: liveQuote?.price != null,
      };
    });
  }, [
    currentPurchases,
    liveQuotes,
    fxData,
    portfolio.inflationRate,
    portfolio.useAutoColInflation,
    colInflationData,
  ]);

  const summary = useMemo(() => {
    let totalInvested = 0;
    let totalCommission = 0;
    let totalCommissionFx = 0;
    let totalCurrentValue = 0;
    let totalInvestedFx = 0;
    let totalCurrentValueFx = 0;
    let totalCurrentValueReal = 0;
    let totalFxEffect = 0;

    lotDataList.forEach((lot) => {
      totalInvested += lot.invested;
      totalCommission += (lot.commission || 0);
      totalCommissionFx += (lot.commissionFx || 0);
      totalCurrentValue += lot.currentValue;
      totalInvestedFx += lot.investedFx;
      totalCurrentValueFx += lot.currentValueFx;
      totalCurrentValueReal += lot.currentValueReal;
      totalFxEffect += lot.fxEffect || 0;
    });

    const openCostBasis = totalInvested + totalCommission;
    const openCostBasisFx = totalInvestedFx + totalCommissionFx;
    const openNetReturn = totalCurrentValue - openCostBasis;
    const openNetReturnFx = totalCurrentValueFx - openCostBasisFx;

    // Realized metrics from closed sales
    const currentFx = fxData.current || 1.0;
    let realizedPnlTotal = 0;
    let realizedProceedsTotal = 0;
    let realizedCostBasisTotal = 0;
    let realizedPnlTotalFx = 0;
    let realizedProceedsTotalFx = 0;
    let realizedCostBasisTotalFx = 0;

    currentSales.forEach((s) => {
      const pnl = Number(s.realizedPnl ?? s.realized_pnl ?? 0);
      const cost = Number(s.costBasis ?? s.cost_basis ?? 0);
      const shares = Number(s.shares ?? 0);
      const prc = Number(s.salePrice ?? s.sale_price ?? 0);
      const grossProceeds = (shares > 0 && prc > 0) ? shares * prc : (cost + pnl);

      realizedPnlTotal += pnl;
      realizedCostBasisTotal += cost;
      realizedProceedsTotal += grossProceeds;

      const saleFx = fxData.history?.[s.saleDate || s.sale_date] || currentFx;
      const buyFx = fxData.history?.[s.purchaseDate || s.purchase_date] || saleFx;

      realizedPnlTotalFx += pnl * saleFx;
      realizedCostBasisTotalFx += cost * buyFx;
      realizedProceedsTotalFx += grossProceeds * saleFx;
    });

    // Total Portfolio Metrics (Open positions + Realized sales)
    const netReturn = openNetReturn + realizedPnlTotal;
    const totalCostBasis = openCostBasis + realizedCostBasisTotal;
    const netReturnPct = totalCostBasis > 0 ? (netReturn / totalCostBasis) * 100 : (openCostBasis > 0 ? (netReturn / openCostBasis) * 100 : 0);

    const netReturnFx = openNetReturnFx + realizedPnlTotalFx;
    const totalCostBasisFx = openCostBasisFx + realizedCostBasisTotalFx;
    const netReturnPctFx = totalCostBasisFx > 0 ? (netReturnFx / totalCostBasisFx) * 100 : (openCostBasisFx > 0 ? (netReturnFx / openCostBasisFx) * 100 : 0);

    // FX effect isolated: purely from currency movement
    const totalFxEffectPct = totalCostBasisFx > 0 ? (totalFxEffect / totalCostBasisFx) * 100 : 0;
    // Asset-only gain in COP = total COP gain minus the FX movement contribution
    const assetGainInCop = netReturnFx - totalFxEffect;
    const assetGainInCopPct = totalCostBasisFx > 0 ? (assetGainInCop / totalCostBasisFx) * 100 : 0;

    const totalInflationLoss = totalCurrentValueFx - totalCurrentValueReal;
    const totalInflationLossPct =
      totalCostBasisFx > 0 ? (totalInflationLoss / totalCostBasisFx) * 100 : 0;

    const netReturnReal = (totalCurrentValueReal - openCostBasisFx) + realizedPnlTotalFx;
    const netReturnPctReal = totalCostBasisFx > 0 ? (netReturnReal / totalCostBasisFx) * 100 : 0;

    return {
      totalInvested,
      totalCommission,
      totalCommissionFx,
      totalCostBasis,
      totalCostBasisFx,
      openCostBasis,
      openCostBasisFx,
      totalCurrentValue,
      openNetReturn,
      openNetReturnFx,
      realizedPnlTotal,
      realizedProceedsTotal,
      realizedCostBasisTotal,
      realizedPnlTotalFx,
      realizedProceedsTotalFx,
      realizedCostBasisTotalFx,
      netReturn,
      netReturnPct,
      totalInvestedFx,
      totalCurrentValueFx,
      netReturnFx,
      netReturnPctFx,
      totalFxEffect,
      totalFxEffectPct,
      assetGainInCop,
      assetGainInCopPct,
      totalInflationLoss,
      totalInflationLossPct,
      totalCurrentValueReal,
      netReturnReal,
      netReturnPctReal,
    };
  }, [lotDataList, currentSales, fxData]);

  // Group lots by ticker
  const groupedLots = useMemo(() => {
    const groups = {};
    lotDataList.forEach((p) => {
      if (!groups[p.ticker]) {
        groups[p.ticker] = {
          ticker: p.ticker,
          name: p.name,
          lots: [],
          totalInvested: 0,
          totalCommission: 0,
          totalCommissionFx: 0,
          totalCostBasis: 0,
          totalCostBasisFx: 0,
          totalCurrentValue: 0,
          totalShares: 0,
          totalInvestedFx: 0,
          totalCurrentValueFx: 0,
          totalInflationLoss: 0,
          totalCurrentValueReal: 0,
        };
      }
      groups[p.ticker].lots.push(p);
      groups[p.ticker].totalInvested += p.invested;
      groups[p.ticker].totalCommission += (p.commission || 0);
      groups[p.ticker].totalCommissionFx += (p.commissionFx || 0);
      groups[p.ticker].totalCostBasis += (p.totalCostBasis || p.invested);
      groups[p.ticker].totalCostBasisFx += (p.totalCostBasisFx || p.investedFx);
      groups[p.ticker].totalCurrentValue += p.currentValue;
      groups[p.ticker].totalShares += p.shares;
      groups[p.ticker].totalInvestedFx += p.investedFx;
      groups[p.ticker].totalCurrentValueFx += p.currentValueFx;
      groups[p.ticker].totalInflationLoss += p.inflationLoss;
      groups[p.ticker].totalCurrentValueReal += p.currentValueReal;
    });

    Object.values(groups).forEach((g) => {
      g.profit = g.totalCurrentValue - g.totalCostBasis;
      g.profitPct = g.totalCostBasis > 0 ? (g.profit / g.totalCostBasis) * 100 : 0;
      g.isPositive = g.profit >= 0;

      g.profitFx = g.totalCurrentValueFx - g.totalCostBasisFx;
      g.profitPctFx = g.totalCostBasisFx > 0 ? (g.profitFx / g.totalCostBasisFx) * 100 : 0;

      g.profitReal = g.totalCurrentValueReal - g.totalCostBasisFx;
      g.profitPctReal = g.totalCostBasisFx > 0 ? (g.profitReal / g.totalCostBasisFx) * 100 : 0;

      g.currentPrice = g.lots[0].currentPrice;
      g.avgOpenPrice = g.totalShares > 0 ? g.totalInvested / g.totalShares : 0;
      g.lots.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return Object.values(groups).sort((a, b) => b.totalInvested - a.totalInvested);
  }, [lotDataList]);

  const [expandedTickers, setExpandedTickers] = useState({});
  const toggleExpand = (ticker) =>
    setExpandedTickers((prev) => ({ ...prev, [ticker]: !prev[ticker] }));

  const handleEditParentTicker = (group, e) => {
    if (e) e.stopPropagation();
    setChangingTickerGroup(group);
  };

  const handleConfirmChangeTicker = async (selectedAsset) => {
    if (!changingTickerGroup || !selectedAsset) return;
    const tickerUpper = selectedAsset.ticker.trim().toUpperCase();
    const newName = selectedAsset.name || changingTickerGroup.name;

    const updates = changingTickerGroup.lots.map((p) => ({
      ...p,
      ticker: tickerUpper,
      name: newName,
    }));

    updateMultiplePurchases(updates);
  };

  const handleStopBatch = () => {
    setAbortBatch(portfolioId);
  };

  const handleBatchRecalculate = async () => {
    if (!currentPurchases.length) return;
    const isConfirmed = await toastConfirm(
      "Esto actualizará el Precio de Apertura de TODOS los lotes consultando el precio histórico real de Yahoo Finance.\n\n¿Deseas continuar?",
    );
    if (!isConfirmed) return;

    runBatchRecalculate(portfolioId, currentPurchases);
  };

  // Historical Chart Rendering
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const getResponsiveChartHeight = () => {
      if (typeof window === "undefined") return 460;
      if (window.innerWidth <= 640) return 280;
      if (window.innerWidth <= 1024) return 350;
      return 460;
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getResponsiveChartHeight(),
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
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        textColor: chartColors.textColor,
        autoScale: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { price: true, time: true },
      },
    });

    chartInstanceRef.current = chart;

    seriesRefs.current.invested = chart.addLineSeries({
      color: chartColors.capital,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      visible: visibleSeries.invested,
    });

    seriesRefs.current.value = chart.addAreaSeries({
      lineColor: chartColors.nav,
      topColor: chartColors.navAreaTop,
      bottomColor: chartColors.navAreaBottom,
      lineWidth: 2,
      visible: visibleSeries.valor,
    });

    seriesRefs.current.sp500 = chart.addLineSeries({
      color: chartColors.sp500,
      lineWidth: 2,
      visible: visibleSeries.sp500,
    });

    seriesRefs.current.nasdaq = chart.addLineSeries({
      color: chartColors.nasdaq,
      lineWidth: 2,
      visible: visibleSeries.nasdaq,
    });

    const getClosestIndexPrice = (dateStr, indexName) => {
      const d = new Date(dateStr);
      for (let i = 0; i < 10; i++) {
        const str = d.toISOString().split("T")[0];
        if (indicesHistory[str] && indicesHistory[str][indexName]) {
          return indicesHistory[str][indexName];
        }
        d.setDate(d.getDate() - 1);
      }
      return null;
    };

    const sortedPurchases = [...lotDataList].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Also collect closed / sold positions from currentSales so they have historical presence in the chart
    const closedSalesList = currentSales.map((s) => {
      const pDate = s.purchaseDate || s.saleDate;
      const costBasis = Number(s.costBasis || 0);
      const grossRev = Number(s.shares || 0) * Number(s.salePrice || 0);
      const realizedVal = grossRev > 0 ? grossRev : (costBasis + Number(s.realizedPnl || 0));
      return {
        id: s.id,
        ticker: s.ticker,
        purchaseDate: pDate,
        saleDate: s.saleDate,
        invested: costBasis > 0 ? costBasis : realizedVal,
        exitValue: realizedVal,
        realizedPnl: Number(s.realizedPnl || 0),
      };
    });

    const todayStr = new Date().toISOString().split("T")[0];
    const todayTime = new Date(todayStr).getTime();

    // Generate timeline dates: purchase dates + sale dates + today + 1st of every month in between
    const allKeyDates = [
      ...sortedPurchases.map((p) => p.date),
      ...closedSalesList.map((s) => s.purchaseDate),
      ...closedSalesList.map((s) => s.saleDate),
      todayStr,
    ].filter(Boolean);

    const datesSet = new Set(allKeyDates);
    const earliestDateStr = allKeyDates.length > 0
      ? allKeyDates.slice().sort()[0]
      : todayStr;

    if (earliestDateStr) {
      const currentDate = new Date(earliestDateStr);
      const endDate = new Date(todayStr);
      currentDate.setDate(1);
      while (currentDate <= endDate) {
        datesSet.add(currentDate.toISOString().split("T")[0]);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    const uniqueDates = Array.from(datesSet).sort();

    const investedData = [];
    const valueData = [];
    const sp500Data = [];
    const nasdaqData = [];

    // Only plot S&P/NASDAQ once the index history has actually loaded, so they never show a
    // misleading flat line at the purchase value while fetching (or if the fetch fails).
    const hasIndexData = indicesHistory && Object.keys(indicesHistory).length > 0;

    uniqueDates.forEach((dateStr) => {
      const dateTime = new Date(dateStr).getTime();
      let totalInvested = 0;
      let totalValue = 0;
      let totalSp500 = 0;
      let totalNasdaq = 0;

      const currentSp500 = getClosestIndexPrice(dateStr, "SP500");
      const currentNasdaq = getClosestIndexPrice(dateStr, "NASDAQ");

      // 1. Active lots
      sortedPurchases.forEach((lot) => {
        const lotStartTime = new Date(lot.date).getTime();

        if (lotStartTime <= dateTime) {
          totalInvested += lot.invested;

          if (hasIndexData) {
            if (currentSp500) {
              const lotStartSp500 = getClosestIndexPrice(lot.date, "SP500");
              if (lotStartSp500) totalSp500 += lot.invested * (currentSp500 / lotStartSp500);
              else totalSp500 += lot.invested;
            } else {
              totalSp500 += lot.invested;
            }

            if (currentNasdaq) {
              const lotStartNasdaq = getClosestIndexPrice(lot.date, "NASDAQ");
              if (lotStartNasdaq) totalNasdaq += lot.invested * (currentNasdaq / lotStartNasdaq);
              else totalNasdaq += lot.invested;
            } else {
              totalNasdaq += lot.invested;
            }
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

      // 2. Closed / Sold positions trace during their holding period
      closedSalesList.forEach((closed) => {
        const buyTime = new Date(closed.purchaseDate).getTime();
        const saleTime = new Date(closed.saleDate).getTime();

        if (buyTime <= dateTime && dateTime <= saleTime) {
          // While the lot was held between purchaseDate and saleDate: part of active portfolio exposure
          totalInvested += closed.invested;
          if (dateStr === closed.purchaseDate) {
            totalValue += closed.invested;
          } else if (dateStr === closed.saleDate) {
            totalValue += closed.exitValue;
          } else {
            // Interpolate value between purchase cost and exit value over the holding period
            const holdingDuration = saleTime - buyTime;
            const progress = holdingDuration > 0 ? (dateTime - buyTime) / holdingDuration : 1;
            const interpolatedVal = closed.invested + (closed.exitValue - closed.invested) * Math.min(1, Math.max(0, progress));
            totalValue += interpolatedVal;
          }
        }
      });

      investedData.push({ time: dateStr, value: Number(totalInvested.toFixed(2)) });
      valueData.push({ time: dateStr, value: Number(totalValue.toFixed(2)) });
      if (hasIndexData) {
        sp500Data.push({ time: dateStr, value: Number(totalSp500.toFixed(2)) });
        nasdaqData.push({ time: dateStr, value: Number(totalNasdaq.toFixed(2)) });
      }
    });

    seriesRefs.current.invested.setData(investedData);
    seriesRefs.current.value.setData(valueData);
    seriesRefs.current.sp500.setData(sp500Data);
    seriesRefs.current.nasdaq.setData(nasdaqData);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const w = chartContainerRef.current.clientWidth;
        chartInstanceRef.current.applyOptions({
          width: w,
          height: getResponsiveChartHeight(),
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [lotDataList, currentSales, indicesHistory]);

  useEffect(() => {
    if (chartInstanceRef.current) {
      applyChartTheme(chartInstanceRef.current, theme, {
        nav: seriesRefs.current.value,
        capital: seriesRefs.current.invested,
        sp500: seriesRefs.current.sp500,
        nasdaq: seriesRefs.current.nasdaq,
      });
    }
  }, [theme]);

  const hasIndexData = indicesHistory && Object.keys(indicesHistory).length > 0;

  return (
    <>
      <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 60, padding: 20 }}>
        {/* HEADER & SUMMARY */}
        <div className="card fade-up" style={{ padding: "24px", marginBottom: "24px" }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 800,
                    color: "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: 0,
                  }}
                >
                  <span>🛒</span> {portfolio.name}
                </h2>

                {purchasePortfolios && purchasePortfolios.length > 1 && onSelectPortfolio && (
                  <select
                    value={portfolioId}
                    onChange={(e) => onSelectPortfolio(e.target.value)}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--border-accent)",
                      borderRadius: 8,
                      color: "var(--accent-primary)",
                      padding: "4px 10px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                    title="Cambiar Histórico de Compras"
                  >
                    {purchasePortfolios.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "#111827", color: "#fff" }}>
                        📁 {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 20 }}>
                Registra y trackea compras reales de ETFs, ETCs, Acciones y Criptos / Oro Digital (XAUt, PAXG, BTC) con sus valores de
                apertura exactos y descuento de comisiones.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: portfolio.isPlan ? "#00e5ff" : "var(--text-secondary)",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.03)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!portfolio.isPlan}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      togglePortfolioPlan(portfolioId, isChecked, portfolio.planConfig);
                      if (
                        isChecked &&
                        (!autoPlanAnalysis || !autoPlanAnalysis.frequencyDays) &&
                        !portfolio.planConfig
                      ) {
                        setShowPlanModal(true);
                      }
                    }}
                    style={{ accentColor: "#00e5ff", width: 16, height: 16 }}
                  />
                  🤖 Convertir en Plan
                </label>

                <button
                  onClick={() => setShowInflationExplorer(true)}
                  style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                    color: "#fbbf24",
                    padding: "6px 12px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 32,
                  }}
                >
                  🔍 Ver Historial IPC (
                  {colInflationData.latest?.yoy ? `${colInflationData.latest.yoy}%` : "Colombia"})
                </button>

                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "var(--text-secondary)",
                    padding: "6px 12px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 32,
                  }}
                >
                  ⚙️ Configurar Divisa/Inflación
                </button>

                <button
                  onClick={() => setShowXtbModal(true)}
                  style={{
                    background: "rgba(0, 229, 255, 0.08)",
                    border: "1px solid rgba(0, 229, 255, 0.35)",
                    color: "#00e5ff",
                    padding: "6px 12px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 32,
                    fontWeight: 700,
                  }}
                  title="Importar compras copiadas desde xStation 5 de XTB"
                >
                  📥 Importar de XTB
                </button>
              </div>
            </div>

            {portfolioId !== "hist_default" && (
              <button
                onClick={async () => {
                  const isConfirmed = await toastConfirm(
                    `¿Estás seguro de eliminar el portafolio "${portfolio.name}" y todas sus compras?`,
                  );
                  if (isConfirmed) {
                    deletePurchasePortfolio(portfolioId);
                  }
                }}
                className="btn btn-sm"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}
              >
                🗑️ Eliminar Portafolio
              </button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 4,
                background: theme === "light" ? "#f1f5f9" : "rgba(0,0,0,0.3)",
                borderRadius: 20,
                padding: 4,
                border: theme === "light" ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)",
                maxWidth: "100%",
              }}
            >
              <button
                onClick={() => setYieldViewMode("USD")}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "USD" ? (theme === "light" ? "#ffffff" : "rgba(255,255,255,0.1)") : "transparent",
                  color: yieldViewMode === "USD" ? (theme === "light" ? "#0284c7" : "#fff") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "USD" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "USD" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Nominal ({portfolio.assetCurrency || "USD"})
              </button>
              <button
                onClick={() => {
                  if (
                    portfolio.localCurrency &&
                    portfolio.localCurrency !== (portfolio.assetCurrency || "USD")
                  ) {
                    setYieldViewMode("FX");
                  } else if (portfolio.localCurrency) {
                    setYieldViewMode("FX");
                  } else {
                    toast("Configura tu Divisa Local en ⚙️ primero.", { icon: "ℹ️" });
                  }
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "FX" ? (theme === "light" ? "#ffffff" : "rgba(0, 229, 255, 0.15)") : "transparent",
                  color: yieldViewMode === "FX" ? (theme === "light" ? "#0284c7" : "#00e5ff") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "FX" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "FX" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Divisa ({portfolio.localCurrency || "COP"}){" "}
                {isFetchingFx && yieldViewMode === "FX" && "⏳"}
              </button>
              <button
                onClick={() => {
                  if (portfolio.useAutoColInflation || portfolio.inflationRate > 0) {
                    setYieldViewMode("REAL");
                  } else {
                    toast("Configura la Inflación en ⚙️ primero.", { icon: "ℹ️" });
                  }
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "REAL" ? (theme === "light" ? "#ffffff" : "rgba(245, 158, 11, 0.15)") : "transparent",
                  color: yieldViewMode === "REAL" ? (theme === "light" ? "#d97706" : "#f59e0b") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "REAL" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "REAL" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Poder Adquisitivo Real {isFetchingInflation && yieldViewMode === "REAL" && "⏳"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 16,
                background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Capital Total Invertido (
                {yieldViewMode === "USD"
                  ? portfolio.assetCurrency || "USD"
                  : portfolio.localCurrency || "COP"}
                )
              </div>
              <div
                className="mono"
                style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}
              >
                $
                {yieldViewMode === "USD"
                  ? summary.totalInvested.toFixed(2)
                  : summary.totalInvestedFx.toFixed(2)}
              </div>
            </div>
            <div
              style={{
                padding: 16,
                background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Valor Actual {yieldViewMode === "REAL" && "(Ajustado)"}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: yieldViewMode === "REAL"
                    ? (theme === "light" ? "#d97706" : "#f59e0b")
                    : (theme === "light" ? "#0284c7" : "#00e5ff"),
                }}
              >
                $
                {yieldViewMode === "USD"
                  ? summary.totalCurrentValue.toFixed(2)
                  : yieldViewMode === "FX"
                    ? summary.totalCurrentValueFx.toFixed(2)
                    : summary.totalCurrentValueReal.toFixed(2)}
              </div>
            </div>
            {(() => {
              const netReturn =
                yieldViewMode === "USD"
                  ? summary.netReturn
                  : yieldViewMode === "FX"
                    ? summary.netReturnFx
                    : summary.netReturnReal;
              const netReturnPct =
                yieldViewMode === "USD"
                  ? summary.netReturnPct
                  : yieldViewMode === "FX"
                    ? summary.netReturnPctFx
                    : summary.netReturnPctReal;
              const isPositive = netReturn >= 0;
              const color = isPositive
                ? (theme === "light" ? "#16a34a" : "#4ade80")
                : (theme === "light" ? "#dc2626" : "#f87171");
              const bgColor = isPositive
                ? (theme === "light" ? "rgba(22, 163, 74, 0.08)" : "rgba(34, 197, 94, 0.05)")
                : (theme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.05)");
              const borderColor = isPositive
                ? (theme === "light" ? "rgba(22, 163, 74, 0.25)" : "rgba(34, 197, 94, 0.2)")
                : (theme === "light" ? "rgba(220, 38, 38, 0.25)" : "rgba(239, 68, 68, 0.2)");

              return (
                <div
                  style={{
                    padding: 16,
                    background: bgColor,
                    borderRadius: "var(--radius)",
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color }}>Beneficio Neto Total</div>
                  <div className="mono" style={{ fontSize: "1.4rem", fontWeight: 800, color }}>
                    {isPositive ? "+" : ""}${netReturn.toFixed(2)}
                    <span style={{ fontSize: "0.8rem", marginLeft: 8 }}>
                      ({isPositive ? "+" : ""}
                      {netReturnPct.toFixed(2)}%)
                    </span>
                  </div>
                  {summary.realizedPnlTotal !== 0 && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                      Latente: <span className="mono" style={{ color: summary.openNetReturn >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{summary.openNetReturn >= 0 ? "+" : ""}${summary.openNetReturn.toFixed(2)}</span>
                      {" | "}
                      Realizado: <span className="mono" style={{ color: summary.realizedPnlTotal >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{summary.realizedPnlTotal >= 0 ? "+" : ""}${summary.realizedPnlTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
          <div
            style={{
              marginTop: 16,
              padding: "16px 20px",
              background: "rgba(0,0,0,0.25)",
              borderRadius: "var(--radius)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
                marginBottom: showBreakdownCard ? 12 : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                flexWrap: "wrap",
                gap: 6,
              }}
              onClick={() => setShowBreakdownCard(!showBreakdownCard)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>📊 Comparativa de Rendimiento Multinivel (Nominal ➔ Divisa ➔ Real)</span>
                <span
                  style={{
                    fontSize: "0.74rem",
                    color: "#f59e0b",
                    background: "rgba(245,158,11,0.1)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {portfolio.useAutoColInflation
                    ? "IPC Automático (FRED/DANE)"
                    : `Inflación Manual ${portfolio.inflationRate || 0}%/año`}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBreakdownCard(!showBreakdownCard);
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  color: "var(--text-muted)",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                }}
              >
                {showBreakdownCard ? "▲ Ocultar" : "▼ Desplegar"}
              </button>
            </div>
            {showBreakdownCard && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
              {/* Level 1: Nominal */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase" }}>
                  1. Nominal ({portfolio.assetCurrency || "USD"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturn >= 0 ? "#4ade80" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {summary.netReturn >= 0 ? "+" : ""}${summary.netReturn.toFixed(2)} (
                  {summary.netReturnPct >= 0 ? "+" : ""}
                  {summary.netReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Inv: ${summary.totalInvested.toFixed(2)}
                  {summary.totalCommission > 0 && ` + Fees: $${summary.totalCommission.toFixed(2)}`}
                  {" "}➔ Val: ${summary.totalCurrentValue.toFixed(2)}
                </div>
              </div>

              {/* Level 2: FX Adjusted */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(0, 229, 255, 0.03)",
                  borderRadius: 8,
                  border: "1px solid rgba(0, 229, 255, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#00e5ff", textTransform: "uppercase" }}>
                  2. Al Cambio Divisa ({portfolio.localCurrency || "COP"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturnFx >= 0 ? "#4ade80" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {summary.netReturnFx >= 0 ? "+" : ""}${summary.netReturnFx.toFixed(2)} (
                  {summary.netReturnPctFx >= 0 ? "+" : ""}
                  {summary.netReturnPctFx.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Inv: ${summary.totalInvestedFx.toFixed(2)} ➔ Val: $
                  {summary.totalCurrentValueFx.toFixed(2)}
                </div>
              </div>

              {/* Level 3: Real Purchasing Power */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(245, 158, 11, 0.03)",
                  borderRadius: 8,
                  border: "1px solid rgba(245, 158, 11, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#f59e0b", textTransform: "uppercase" }}>
                  3. Poder Adquisitivo Real (Neto)
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturnReal >= 0 ? "#f59e0b" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {summary.netReturnReal >= 0 ? "+" : ""}${summary.netReturnReal.toFixed(2)} (
                  {summary.netReturnPctReal >= 0 ? "+" : ""}
                  {summary.netReturnPctReal.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Val. Real: ${summary.totalCurrentValueReal.toFixed(2)} (Resta inflación)
                </div>
              </div>
            </div>

            {/* FX Effect Isolated Block */}
            {portfolio.localCurrency &&
              portfolio.localCurrency !== (portfolio.assetCurrency || "USD") && (
                <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "rgba(0, 229, 255, 0.04)",
                  borderRadius: 8,
                  border: "1px dashed rgba(0, 229, 255, 0.2)",
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ fontWeight: 700, color: "#00e5ff", marginBottom: 6 }}>
                  💱 Efecto Cambiario Aislado (USD→{portfolio.localCurrency || "COP"})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    Si el dólar no hubiera movido, tu ganancia en COP sería:
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      color: summary.assetGainInCop >= 0 ? "#4ade80" : "#f87171",
                    }}
                  >
                    {summary.assetGainInCop >= 0 ? "+" : ""}
                    {summary.assetGainInCop.toFixed(2)} ({summary.assetGainInCop >= 0 ? "+" : ""}
                    {summary.assetGainInCopPct.toFixed(2)}%)
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>+</span>
                  <span style={{ color: "#00e5ff", fontWeight: 600 }}>Movimiento divisa:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      color: summary.totalFxEffect >= 0 ? "#4ade80" : "#f87171",
                    }}
                  >
                    {summary.totalFxEffect >= 0 ? "+" : ""}
                    {summary.totalFxEffect.toFixed(2)} ({summary.totalFxEffect >= 0 ? "+" : ""}
                    {summary.totalFxEffectPct.toFixed(2)}%)
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>= Ganancia total COP</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 800,
                      color: summary.netReturnFx >= 0 ? "#4ade80" : "#f87171",
                    }}
                  >
                    {summary.netReturnFx >= 0 ? "+" : ""}
                    {summary.netReturnFx.toFixed(2)} ({summary.netReturnFx >= 0 ? "+" : ""}
                    {summary.netReturnPctFx.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Explicit Deduction Equation Bar */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.06)",
                borderRadius: 8,
                border: "1px dashed rgba(245, 158, 11, 0.25)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.78rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: "#00e5ff", fontWeight: 700 }}>
                  Ganancia Bruta ({portfolio.localCurrency || "COP"}):
                </span>
                <span
                  className="mono"
                  style={{
                    color: summary.netReturnFx >= 0 ? "#4ade80" : "#f87171",
                    fontWeight: 700,
                  }}
                >
                  {summary.netReturnFx >= 0 ? "+" : ""}${summary.netReturnFx.toFixed(2)}
                </span>
                <span style={{ color: "var(--text-muted)" }}>➖</span>
                <span style={{ color: "#f87171", fontWeight: 700 }}>
                  Descuento Inflación (IPC):
                </span>
                <span className="mono" style={{ color: "#f87171", fontWeight: 700 }}>
                  -${summary.totalInflationLoss.toFixed(2)} (
                  {summary.totalInflationLossPct.toFixed(2)}%)
                </span>
                <span style={{ color: "var(--text-muted)" }}>🟰</span>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>Ganancia Real Neta:</span>
                <span
                  className="mono"
                  style={{
                    color: summary.netReturnReal >= 0 ? "#f59e0b" : "#f87171",
                    fontWeight: 800,
                  }}
                >
                  {summary.netReturnReal >= 0 ? "+" : ""}${summary.netReturnReal.toFixed(2)} (
                  {summary.netReturnPctReal >= 0 ? "+" : ""}
                  {summary.netReturnPctReal.toFixed(2)}% Real)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

        {showSettingsModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
          >
            <div
              className="card fade-up"
              style={{
                width: "100%",
                maxWidth: 450,
                padding: 24,
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 20px 0",
                  color: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                ⚙️ Configuración del Portafolio
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    Divisa del Activo
                  </label>
                  <select
                    value={portfolio.assetCurrency || "USD"}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        e.target.value,
                        portfolio.localCurrency || "COP",
                        portfolio.inflationRate || 0,
                        portfolio.useAutoColInflation || false,
                      )
                    }
                    className="input"
                    style={{ width: "100%" }}
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
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    Divisa Local
                  </label>
                  <select
                    value={portfolio.localCurrency || "COP"}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        portfolio.assetCurrency || "USD",
                        e.target.value,
                        portfolio.inflationRate || 0,
                        portfolio.useAutoColInflation || false,
                      )
                    }
                    className="input"
                    style={{ width: "100%" }}
                  >
                    <option value="COP">COP - Peso Col.</option>
                    <option value="MXN">MXN - Peso Mex.</option>
                    <option value="CLP">CLP - Peso Chi.</option>
                    <option value="USD">USD - Dólar</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: -8,
                  marginBottom: 16,
                }}
              >
                Calcularemos la ganancia en Divisa Local ajustando por la tasa de cambio histórica
                vs actual del par seleccionado.
              </div>

              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    marginBottom: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={portfolio.useAutoColInflation || false}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        portfolio.assetCurrency || "USD",
                        portfolio.localCurrency || "COP",
                        portfolio.inflationRate || 0,
                        e.target.checked,
                      )
                    }
                  />
                  Usar Inflación Automática (Colombia, mensual)
                </label>

                {!portfolio.useAutoColInflation && (
                  <>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: 8,
                      }}
                    >
                      Inflación Anual Manual (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={portfolio.inflationRate || 0}
                      onChange={(e) =>
                        updatePortfolioSettings(
                          portfolio.id,
                          portfolio.assetCurrency || "USD",
                          portfolio.localCurrency || "COP",
                          Number.parseFloat(e.target.value) || 0,
                          false,
                        )
                      }
                      className="input"
                      style={{ width: "100%" }}
                    />
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                      Descontaremos este % anual compuesto según el tiempo transcurrido de cada
                      lote.
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="btn btn-primary"
                  style={{ minWidth: 100 }}
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SMART ANALYSIS CARD */}
        {portfolio.isPlan && (
          <div
            className="card fade-up"
            style={{
              padding: "20px",
              marginBottom: "24px",
              background: "rgba(0, 229, 255, 0.03)",
              border: "1px solid rgba(0, 229, 255, 0.15)",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
            >
              <h3
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "#00e5ff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🤖</span> Análisis Inteligente del Plan{" "}
                {planAnalysis?.isManual && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: "#00e5ff20",
                      padding: "2px 6px",
                      borderRadius: 10,
                    }}
                  >
                    (Manual)
                  </span>
                )}
              </h3>
              <div style={{ display: "flex", gap: 10 }}>
                {planAnalysis?.nextDate &&
                  new Date().toISOString().split("T")[0] >= planAnalysis.nextDate && (
                    <button
                      onClick={() => setShowExecutionModal(true)}
                      className="btn btn-sm"
                      style={{
                        background: "#00e5ff",
                        color: "#000",
                        fontWeight: 600,
                        border: "none",
                        boxShadow: "0 0 10px rgba(0, 229, 255, 0.4)",
                      }}
                    >
                      🚀 Ejecutar Plan
                    </button>
                  )}
                <button
                  onClick={() => setShowPlanModal(true)}
                  className="btn btn-sm"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(0, 229, 255, 0.3)",
                    color: "#00e5ff",
                  }}
                >
                  ⚙️ Configurar
                </button>
              </div>
            </div>

            {planAnalysis ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Frecuencia Detectada
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f1f5f9" }}>
                      {planAnalysis.frequencyDays
                        ? `Cada ${planAnalysis.frequencyDays} días`
                        : "---"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Inversión Promedio
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f1f5f9" }}
                    >
                      ${planAnalysis.avgAmount?.toFixed(2) || "0.00"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Próxima Inversión Esperada
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 600,
                          color: planAnalysis.nextDate
                            ? new Date().toISOString().split("T")[0] >= planAnalysis.nextDate
                              ? "#ef4444"
                              : "#4ade80"
                            : "var(--text-muted)",
                        }}
                      >
                        {planAnalysis.nextDate ? planAnalysis.nextDate : "---"}
                      </div>
                      {planAnalysis.nextDate &&
                        new Date().toISOString().split("T")[0] >= planAnalysis.nextDate && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              background: "#ef444420",
                              color: "#ef4444",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontWeight: 700,
                              animation: "pulse 2s infinite",
                            }}
                          >
                            ¡PENDIENTE!
                          </span>
                        )}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                      title="Dinero sobrante de tus depósitos esperados menos lo invertido realmente"
                    >
                      Reserva en Efectivo Acum.
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 600,
                        color: cashReserve > 0 ? "#f59e0b" : "var(--text-muted)",
                      }}
                    >
                      {cashReserve > 0 ? "+" : ""}${cashReserve.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    Distribución Objetivo Detectada (Promedio):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {planAnalysis.distribution &&
                      Object.entries(planAnalysis.distribution).map(([ticker, pct]) => (
                        <div
                          key={ticker}
                          style={{
                            padding: "4px 10px",
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: 12,
                            fontSize: "0.8rem",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{ticker}</span>
                          <span style={{ color: "#00e5ff" }}>{pct.toFixed(1)}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: 8,
                }}
              >
                No hay suficientes datos para detectar un patrón automáticamente.
                <br />
                <button
                  onClick={() => setShowPlanModal(true)}
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: 12 }}
                >
                  Configurar Manualmente
                </button>
              </div>
            )}
          </div>
        )}

        {/* GRAPH CONTAINER */}
        <div className="card fade-up" style={{ padding: "20px", marginBottom: "24px" }}>
          <div
            className="purchases-chart-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📈</span>
              <span>Evolución del Portafolio Histórico</span>
            </h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
                flexWrap: "wrap",
                width: "100%",
                maxWidth: 420,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: "0.75rem",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => toggleSeries("valor")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#00e5ff",
                    opacity: visibleSeries.valor ? 1 : 0.4,
                  }}
                >
                  <span
                    style={{ width: 10, height: 10, borderRadius: "50%", background: "#00e5ff" }}
                  />{" "}
                  Valor
                </button>
                <button
                  onClick={() => toggleSeries("sp500")}
                  disabled={!hasIndexData}
                  title={!hasIndexData ? "Cargando datos de índices…" : "Mostrar/ocultar S&P 500"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: hasIndexData ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#ec4899",
                    opacity: hasIndexData ? (visibleSeries.sp500 ? 1 : 0.4) : 0.3,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: "#ec4899" }} /> S&P 500
                </button>
                <button
                  onClick={() => toggleSeries("nasdaq")}
                  disabled={!hasIndexData}
                  title={!hasIndexData ? "Cargando datos de índices…" : "Mostrar/ocultar NASDAQ"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: hasIndexData ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#8b5cf6",
                    opacity: hasIndexData ? (visibleSeries.nasdaq ? 1 : 0.4) : 0.3,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: "#8b5cf6" }} /> NASDAQ
                </button>
                <button
                  onClick={() => toggleSeries("invested")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#f59e0b",
                    opacity: visibleSeries.invested ? 1 : 0.4,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: "#f59e0b" }} /> Invertido
                </button>
              </div>

              {!hasIndexData && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: "0.8rem" }}>⏳</span> Cargando S&P 500 / NASDAQ…
                </span>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  maxWidth: "100%",
                }}
              >
                {["1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"].map((range) => (
                  <button
                    key={range}
                    onClick={() => handleTimeRange(range)}
                    disabled={!isRangeEnabled(range)}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "var(--text-secondary)",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      cursor: isRangeEnabled(range) ? "pointer" : "not-allowed",
                      opacity: isRangeEnabled(range) ? 1 : 0.35,
                      transition: "all 0.2s",
                      minHeight: 26,
                    }}
                    onMouseOver={(e) => {
                      if (!isRangeEnabled(range)) return;
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {currentPurchases.length === 0 && currentSales.length === 0 ? (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              Registra tu primera compra para ver la gráfica de evolución temporal.
            </div>
          ) : (
            <div
              ref={chartContainerRef}
              className="purchases-chart-container"
              style={{
                width: "100%",
                height: typeof window !== "undefined" && window.innerWidth <= 640 ? 280 : typeof window !== "undefined" && window.innerWidth <= 1024 ? 350 : 460,
              }}
            />
          )}
        </div>

        {/* FORM & PURCHASES LIST */}
        <div
          className="purchases-main-grid"
          style={{ display: "grid", gap: 24, alignItems: "start" }}
        >
          {/* ADD PURCHASE FORM */}
          <div className="card fade-up" style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>➕</span>
                <span>Registrar Compra (ETF/Acción/Cripto)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowXtbModal(true)}
                className="btn btn-sm btn-ghost"
                style={{
                  border: "1px solid rgba(0, 229, 255, 0.3)",
                  color: "#00e5ff",
                  fontSize: "0.76rem",
                  padding: "4px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Importar posiciones desde xStation de XTB"
              >
                <span>📥</span> Pegar tabla XTB
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  1. Buscar Ticker / ETF / Cripto
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Ticker (ej. XAUT-USD, SMH, BTC-USD, AAPL)"
                    value={ticker}
                    onChange={(e) => {
                      setTicker(e.target.value.toUpperCase());
                      setSelectedMeta(null);
                      setSearchResults([]);
                      setSearchError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchTicker()}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      fontSize: "0.8rem",
                      textTransform: "uppercase",
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleSearchTicker}
                    disabled={isSearching || !ticker}
                  >
                    {isSearching ? "⏳" : "Buscar"}
                  </button>
                </div>
                {searchError && (
                  <div style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 4 }}>
                    {searchError}
                  </div>
                )}

                {/* Broker Suffix Auto-translation Suggestion in Purchase Form */}
                {purchaseTranslationInfo.suggestions.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 8px",
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: "#38bdf8" }}>💡 En Yahoo:</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {purchaseTranslationInfo.suggestions.map((sug) => (
                        <button
                          key={sug.ticker}
                          type="button"
                          onClick={() => {
                            setTicker(sug.ticker);
                            searchTickersMultiple(sug.ticker)
                              .then((res) => {
                                if (res.results && res.results.length > 0) {
                                  setSearchResults(res.results);
                                }
                              })
                              .catch(() => {});
                          }}
                          style={{
                            background: "rgba(56, 189, 248, 0.2)",
                            border: "1px solid #38bdf8",
                            color: "#f0f9ff",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: "0.7rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                          title={sug.note}
                        >
                          {sug.ticker}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Market Location Filters */}
                {searchResults.length > 0 && !selectedMeta && (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                        Filtrar por Mercado / Ubicación:
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {MARKET_REGIONS.map((reg) => {
                        const isActive = searchRegion === reg.id;
                        return (
                          <button
                            key={reg.id}
                            type="button"
                            onClick={() => setSearchRegion(reg.id)}
                            title={reg.hint}
                            style={{
                              background: isActive ? "rgba(0, 229, 255, 0.2)" : "rgba(255, 255, 255, 0.04)",
                              border: isActive ? "1px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.08)",
                              color: isActive ? "#00e5ff" : "var(--text-secondary)",
                              padding: "2px 7px",
                              borderRadius: "12px",
                              fontSize: "0.68rem",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontWeight: isActive ? 600 : 400,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>{reg.icon}</span> {reg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {searchResults.length > 0 && !selectedMeta && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {(() => {
                      const filteredResults = searchResults.filter((r) => {
                        if (searchRegion === "ALL") return true;
                        const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                        return eq.region === searchRegion;
                      });

                      if (filteredResults.length === 0) {
                        return (
                          <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            No hay resultados bajo el filtro seleccionado.
                            <br />
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              style={{ marginTop: 6, color: "#00e5ff" }}
                              onClick={() => setSearchRegion("ALL")}
                            >
                              Ver todos ({searchResults.length})
                            </button>
                          </div>
                        );
                      }

                      return filteredResults.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setTicker(r.ticker);
                          setSelectedMeta(r);
                          setPrice(r.price > 0 ? r.price : 100);
                          if (!purchaseTime) {
                            setPurchaseTime(getMarketOpenTime(r.ticker, r.exchange));
                          }
                          setSearchResults([]);
                        }}
                        style={{
                          cursor: "pointer",
                          padding: "12px",
                          background: "rgba(255, 255, 255, 0.05)",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "rgba(0, 229, 255, 0.1)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 800, color: "#00e5ff", fontSize: "1.05rem" }}>
                            {r.ticker}
                          </div>
                          {r.price > 0 && <div style={{ fontWeight: 700 }}>${r.price}</div>}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#f1f5f9", fontWeight: 500 }}>
                          {r.name}
                        </div>
                        <div
                          style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 4, alignItems: "center" }}
                        >
                          {(() => {
                            const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                            return (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  background: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  borderRadius: "12px",
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "#38bdf8",
                                }}
                              >
                                {eq.flag} {eq.marketLabel}
                              </span>
                            );
                          })()}
                          {r.exchange && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background: "rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: 500,
                              }}
                            >
                              🏛️ {r.exchange}
                            </span>
                          )}
                          {r.quoteType && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background: "rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: 500,
                              }}
                            >
                              📊 {r.quoteType}
                            </span>
                          )}
                          {r.currency && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background:
                                  r.currency !== (portfolio.assetCurrency || "USD")
                                    ? "rgba(239, 68, 68, 0.2)"
                                    : "rgba(255,255,255,0.08)",
                                border:
                                  r.currency !== (portfolio.assetCurrency || "USD")
                                    ? "1px solid rgba(239, 68, 68, 0.4)"
                                    : "none",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: r.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                                color: r.currency !== (portfolio.assetCurrency || "USD") ? "#fca5a5" : "inherit",
                              }}
                            >
                              💵 {r.currency}
                              {r.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                            </span>
                          )}
                          <MarketScheduleBadge ticker={r.ticker} exchange={r.exchange} size="xs" />
                        </div>
                        {(() => {
                          const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                          if (!eq.brokerTip) return null;
                          return (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: "0.68rem",
                                color: "#94a3b8",
                                background: "rgba(255, 255, 255, 0.03)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                borderLeft: "2px solid #00e5ff",
                              }}
                            >
                              💡 {eq.brokerTip}
                            </div>
                          );
                        })()}
                      </div>
                    ));
                  })()}
                </div>
              )}

                {selectedMeta && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "16px",
                      background: "rgba(0, 229, 255, 0.05)",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 229, 255, 0.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
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
                        <div style={{ fontSize: "1.2rem", color: "#00e5ff", fontWeight: 800 }}>
                          {selectedMeta.ticker}
                        </div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            marginTop: "2px",
                          }}
                        >
                          {selectedMeta.name}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          ${selectedMeta.price}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 4 }}>
                      {selectedMeta.exchange && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          🏛️ {selectedMeta.exchange}
                        </span>
                      )}
                      {selectedMeta.quoteType && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          📊 {selectedMeta.quoteType}
                        </span>
                      )}
                      {selectedMeta.currency && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background:
                              selectedMeta.currency !== (portfolio.assetCurrency || "USD")
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(255,255,255,0.08)",
                            border:
                              selectedMeta.currency !== (portfolio.assetCurrency || "USD")
                                ? "1px solid rgba(239, 68, 68, 0.5)"
                                : "none",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: selectedMeta.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                            color: selectedMeta.currency !== (portfolio.assetCurrency || "USD") ? "#fca5a5" : "inherit",
                          }}
                        >
                          💵 {selectedMeta.currency}
                          {selectedMeta.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                        </span>
                      )}
                      <MarketScheduleBadge
                        ticker={selectedMeta.ticker}
                        exchange={selectedMeta.exchange}
                        size="sm"
                      />
                    </div>

                    {/* ALERTA DE DISCREPANCIA DE DIVISA (EUR, GBP, HKD vs Portafolio) */}
                    {selectedMeta.currency && selectedMeta.currency !== (portfolio.assetCurrency || "USD") && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "10px 12px",
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          fontSize: "0.75rem",
                          color: "#fca5a5",
                          lineHeight: "1.3",
                        }}
                      >
                        <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                        <div>
                          <strong style={{ color: "#ef4444", display: "block", marginBottom: 2 }}>
                            ¡Atención con la Divisa ({selectedMeta.currency})!
                          </strong>
                          Este producto cotiza en <strong>{selectedMeta.currency}</strong>, mientras tu portafolio base está en <strong>{portfolio.assetCurrency || "USD"}</strong>.
                          Al comprarlo, tu broker aplicará <strong>conversión de tasa de cambio y comisión FX</strong>, lo cual te descontará saldo adicional.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  3. Valor de Apertura (Monto Invertido en {portfolio.assetCurrency || "USD"})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={investedAmount}
                  onChange={(e) => setInvestedAmount(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                  }}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Volumen / Acciones</span>
                </label>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius)",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                  }}
                >
                  {price > 0 ? (investedAmount / price).toFixed(4) : 0} uds
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Fecha de Compra</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text">Hora de Compra</span>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: "#00e5ff",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                      onClick={() => setPurchaseTime(getMarketOpenTime(selectedMeta?.ticker, selectedMeta?.exchange))}
                      title="Fijar primera hora / apertura de mercado"
                    >
                      🔔 Apertura mercado
                    </span>
                  </label>
                  <input
                    type="time"
                    className="input input-bordered"
                    value={purchaseTime}
                    onChange={(e) => setPurchaseTime(e.target.value)}
                    placeholder="HH:MM (Opcional)"
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">
                    Precio de Apertura / Ejecución{" "}
                    {isFetchingHistorical && (
                      <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>Buscando a las {purchaseTime || "cierre"}...</span>
                    )}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className="input input-bordered"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
                <label className="label">
                  <span className="label-text-alt text-muted">
                    {purchaseTime ? `Auto-completado intradía a las ${purchaseTime}` : "Auto-completado por fecha (Cierre)"}
                  </span>
                </label>
              </div>

              <div className="form-control">
                <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="label-text">
                    Comisión / Descuento Broker o Plenti ({portfolio.assetCurrency || "USD"})
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    Opcional
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="input input-bordered"
                  value={commissionAmount}
                  onChange={(e) => setCommissionAmount(e.target.value)}
                />
                <label className="label">
                  <span className="label-text-alt text-muted" style={{ fontSize: "0.7rem", lineHeight: 1.25 }}>
                    💡 Se sumará al costo base para descontar la tarifa o spread de tu rentabilidad neta real.
                    {(selectedMeta?.ticker?.includes("XAUT") || selectedMeta?.ticker?.includes("PAXG") || selectedMeta?.ticker?.includes("-USD")) && (
                      <span style={{ color: "#00e5ff", display: "block", marginTop: 2 }}>
                        🪙 Compra en Plenti: Ingresa aquí la comisión o spread cobrado por la app.
                      </span>
                    )}
                  </span>
                </label>
              </div>

              {(() => {
                const canAdd = Boolean(
                  selectedMeta &&
                  Number(investedAmount) > 0 &&
                  Number(price) > 0 &&
                  date &&
                  date.trim().length > 0
                );
                return (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      marginTop: 8,
                      padding: "12px",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: canAdd ? "pointer" : "not-allowed",
                      opacity: canAdd ? 1 : 0.45,
                    }}
                    disabled={!canAdd}
                    onClick={handleAddPurchase}
                    title={
                      canAdd
                        ? "Registrar compra en el portafolio"
                        : "Completa los campos obligatorios: Buscar/seleccionar activo, Monto invertido > 0, Precio > 0 y Fecha válida"
                    }
                  >
                    Registrar Compra
                  </button>
                );
              })()}
            </div>
          </div>

          {/* PURCHASES LIST */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Tus Lotes Agrupados
              </h3>
              {lotDataList.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: isBatchUpdating
                        ? "var(--bg-surface)"
                        : theme === "light"
                          ? "rgba(2, 132, 199, 0.1)"
                          : "rgba(0, 229, 255, 0.1)",
                      color: theme === "light" ? "#0284c7" : "#00e5ff",
                      border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.2)",
                    }}
                    onClick={handleBatchRecalculate}
                    disabled={isBatchUpdating}
                  >
                    {isBatchUpdating
                      ? `⏳ Recalculando... ${batchProgress.current}/${batchProgress.total}`
                      : "🔄 Auto-Calcular Todo"}
                  </button>
                  {isBatchUpdating && (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}
                      onClick={handleStopBatch}
                    >
                      🛑 Detener
                    </button>
                  )}
                </div>
              )}
            </div>

            {groupedLots.length === 0 ? (
              <div
                className="card"
                style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}
              >
                Aún no has registrado ninguna compra en este portafolio.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  maxHeight: 650,
                  overflowY: "auto",
                }}
              >
                {groupedLots.map((group) => {
                  const isExpanded = expandedTickers[group.ticker];
                  return (
                    <div
                      key={group.ticker}
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      {/* TICKER SUMMARY CARD */}
                      <div
                        className="card"
                        style={{
                          padding: "16px",
                          background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.03)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          borderLeft: `4px solid ${group.isPositive ? "#22c55e" : "#ef4444"}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                        onClick={() => toggleExpand(group.ticker)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            theme === "light" ? "var(--bg-surface)" : "rgba(255,255,255,0.06)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.03)")
                        }
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 4,
                            }}
                          >
                            <strong style={{ fontSize: "1.1rem", color: "var(--text-primary)" }}>
                              {group.ticker}
                            </strong>
                            <button
                              onClick={(e) => handleEditParentTicker(group, e)}
                              style={{
                                background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)",
                                border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.25)",
                                color: theme === "light" ? "#0284c7" : "#00e5ff",
                                cursor: "pointer",
                                padding: "2px 7px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontWeight: 500,
                                transition: "all 0.15s ease",
                              }}
                              title="Cambiar Acción o ETF a todos los lotes de esta posición"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = theme === "light" ? "rgba(2, 132, 199, 0.18)" : "rgba(0, 229, 255, 0.2)";
                                e.currentTarget.style.borderColor = theme === "light" ? "#0284c7" : "#00e5ff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)";
                                e.currentTarget.style.borderColor = theme === "light" ? "rgba(2, 132, 199, 0.3)" : "rgba(0, 229, 255, 0.25)";
                              }}
                            >
                              <span>🔄</span> Cambiar activo
                            </button>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {group.lots.length} Lote{group.lots.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {(() => {
                            const lq = liveQuotes[group.ticker];
                            return (
                              <>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                  {lq?.name || group.name}
                                </div>
                                {lq && (lq.exchange || lq.quoteType || lq.currency) && (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      flexWrap: "wrap",
                                      marginTop: 6,
                                    }}
                                  >
                                    {lq.exchange && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background: "var(--bg-surface)",
                                          border: "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: 500,
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        🏛️ {lq.exchange}
                                      </span>
                                    )}
                                    {lq.quoteType && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background: "var(--bg-surface)",
                                          border: "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: 500,
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        📊 {lq.quoteType}
                                      </span>
                                    )}
                                    {lq.currency && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background:
                                            lq.currency !== (portfolio.assetCurrency || "USD")
                                              ? (theme === "light" ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)")
                                              : "var(--bg-surface)",
                                          border:
                                            lq.currency !== (portfolio.assetCurrency || "USD")
                                              ? "1px solid rgba(239, 68, 68, 0.4)"
                                              : "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: lq.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                                          color: lq.currency !== (portfolio.assetCurrency || "USD")
                                            ? (theme === "light" ? "#dc2626" : "#fca5a5")
                                            : "var(--text-secondary)",
                                        }}
                                        title={
                                          lq.currency !== (portfolio.assetCurrency || "USD")
                                            ? `Cotiza en ${lq.currency}. Tu portafolio base es ${portfolio.assetCurrency || "USD"}.`
                                            : undefined
                                        }
                                      >
                                        💵 {lq.currency}
                                        {lq.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                                      </span>
                                    )}
                                    <MarketScheduleBadge ticker={group.ticker} exchange={lq?.exchange} size="xs" />
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        <div
                          style={{
                            textAlign: "right",
                            flex: 1,
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 14,
                            marginRight: 8,
                          }}
                        >
                          <div style={{ minWidth: 80 }}>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>
                              Total Invertido
                            </div>
                            <div className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                              $
                              {yieldViewMode === "USD"
                                ? group.totalInvested.toFixed(2)
                                : group.totalInvestedFx.toFixed(2)}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                              Vol: {group.totalShares.toFixed(4)}
                            </div>
                            {group.totalCommission > 0 && (
                              <div style={{ fontSize: "0.65rem", color: "#f59e0b", fontWeight: 600 }}>
                                Fees: -${group.totalCommission.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div style={{ minWidth: 80 }}>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>
                              Valor Mercado
                            </div>
                            <div
                              className="mono"
                              style={{
                                fontWeight: 700,
                                color: yieldViewMode === "REAL"
                                  ? (theme === "light" ? "#d97706" : "#f59e0b")
                                  : (theme === "light" ? "#0284c7" : "#00e5ff"),
                              }}
                            >
                              $
                              {yieldViewMode === "USD"
                                ? group.totalCurrentValue.toFixed(2)
                                : yieldViewMode === "FX"
                                  ? group.totalCurrentValueFx.toFixed(2)
                                  : group.totalCurrentValueReal.toFixed(2)}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                              Apertura: ${group.avgOpenPrice.toFixed(2)}
                            </div>
                          </div>
                          {(() => {
                            const profit =
                              yieldViewMode === "USD"
                                ? group.profit
                                : yieldViewMode === "FX"
                                  ? group.profitFx
                                  : group.profitReal;
                            const profitPct =
                              yieldViewMode === "USD"
                                ? group.profitPct
                                : yieldViewMode === "FX"
                                  ? group.profitPctFx
                                  : group.profitPctReal;
                            const isPositive = profit >= 0;
                            return (
                              <div style={{ minWidth: 100 }}>
                                <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>
                                  {yieldViewMode === "REAL"
                                    ? "Beneficio Real"
                                    : "Beneficio"}
                                </div>
                                <div
                                  style={{
                                    color: isPositive
                                      ? yieldViewMode === "REAL"
                                        ? (theme === "light" ? "#d97706" : "#f59e0b")
                                        : (theme === "light" ? "#16a34a" : "#4ade80")
                                      : (theme === "light" ? "#dc2626" : "#f87171"),
                                    fontWeight: 700,
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  {isPositive ? "+" : ""}${profit.toFixed(2)}
                                  <div style={{ fontSize: "0.7rem" }}>
                                    ({isPositive ? "+" : ""}
                                    {profitPct.toFixed(2)}%{yieldViewMode === "REAL" ? " Real" : ""}
                                    )
                                  </div>
                                </div>
                                {yieldViewMode === "REAL" && (
                                  <div
                                    style={{ fontSize: "0.65rem", color: "#f87171", marginTop: 2 }}
                                  >
                                    📉 -${(group.totalInflationLoss || 0).toFixed(2)} por IPC
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        <div style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>
                          {isExpanded ? "🔽" : "▶️"}
                        </div>
                      </div>

                      {/* EXPANDED INDIVIDUAL LOTS */}
                      {isExpanded && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            paddingLeft: 24,
                          }}
                        >
                          {group.lots.map((p) => (
                            <div
                              key={p.id}
                              style={{
                                padding: "12px 16px",
                                background: theme === "light" ? "var(--bg-surface)" : "rgba(0,0,0,0.2)",
                                borderRadius: "var(--radius)",
                                border: "1px solid var(--border)",
                                borderLeft: `3px solid ${p.isPositive ? "#22c55e" : "#ef4444"}`,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 2,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.8rem",
                                      background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.05)",
                                      border: "1px solid var(--border)",
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      color: "var(--text-primary)",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    <span>📅 {p.date}</span>
                                    {p.purchaseTime && (
                                      <span style={{ color: theme === "light" ? "#0284c7" : "#00e5ff", fontWeight: 600 }}>
                                        🕒 {p.purchaseTime}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                                  <div>
                                    <div style={{ color: "var(--text-secondary)" }}>Invertido</div>
                                    <div className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                      $
                                      {yieldViewMode === "USD"
                                        ? p.invested.toFixed(2)
                                        : p.investedFx.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Apertura: ${p.purchasePrice.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Vol: {p.shares.toFixed(4)}
                                    </div>
                                    {p.commission > 0 && (
                                      <div
                                        style={{
                                          fontSize: "0.65rem",
                                          color: "#f59e0b",
                                          marginTop: 2,
                                          fontWeight: 600,
                                        }}
                                        title="Comisión o spread descontado (Plenti/Broker)"
                                      >
                                        🏷️ Fee: -${p.commission.toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div style={{ color: "var(--text-secondary)" }}>
                                      Valor Mercado
                                    </div>
                                    <div
                                      className="mono"
                                      style={{
                                        fontWeight: 700,
                                        color: yieldViewMode === "REAL"
                                          ? (theme === "light" ? "#d97706" : "#f59e0b")
                                          : (theme === "light" ? "#0284c7" : "#00e5ff"),
                                      }}
                                    >
                                      $
                                      {yieldViewMode === "USD"
                                        ? p.currentValue.toFixed(2)
                                        : yieldViewMode === "FX"
                                          ? p.currentValueFx.toFixed(2)
                                          : p.currentValueReal.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Actual: ${p.currentPrice.toFixed(2)}
                                      {p.manualCurrentPrice && (
                                        <span style={{ color: "#f59e0b", marginLeft: 4 }}>
                                          (Manual)
                                        </span>
                                      )}
                                      {!p.hasLiveQuote && !p.manualCurrentPrice && (
                                        <span style={{ color: "#ef4444", marginLeft: 4 }}>
                                          (Sin conexión)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {(() => {
                                  const profit =
                                    yieldViewMode === "USD"
                                      ? p.profit
                                      : yieldViewMode === "FX"
                                        ? p.profitFx
                                        : p.profitReal;
                                  const profitPct =
                                    yieldViewMode === "USD"
                                      ? p.profitPct
                                      : yieldViewMode === "FX"
                                        ? p.profitPctFx
                                        : p.profitPctReal;
                                  const isPositive = profit >= 0;
                                  return (
                                    <div style={{ marginTop: 4 }}>
                                      <div
                                        style={{
                                          color: isPositive
                                            ? yieldViewMode === "REAL"
                                              ? (theme === "light" ? "#d97706" : "#f59e0b")
                                              : (theme === "light" ? "#16a34a" : "#4ade80")
                                            : (theme === "light" ? "#dc2626" : "#f87171"),
                                          fontWeight: 700,
                                          fontSize: "0.8rem",
                                        }}
                                      >
                                        {yieldViewMode === "REAL" ? "Beneficio Real" : "Beneficio"}:{" "}
                                        {isPositive ? "+" : ""}${profit.toFixed(2)} (
                                        {isPositive ? "+" : ""}
                                        {profitPct.toFixed(2)}%
                                        {yieldViewMode === "REAL" ? " Real" : ""})
                                      </div>
                                      {yieldViewMode === "REAL" && (
                                        <div
                                          style={{
                                            fontSize: "0.65rem",
                                            color: "#fca5a5",
                                            marginTop: 1,
                                          }}
                                        >
                                          📉 Inflación descontada: -$
                                          {(p.inflationLoss || 0).toFixed(2)} (-
                                          {(p.inflationRatePct || 0).toFixed(2)}% acum.)
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              <div style={{ display: "flex", gap: 4, marginLeft: 16 }}>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => {
                                    const curPrice = p.currentPrice || p.purchasePrice;
                                    const totalValUSD = (p.shares * curPrice);
                                    setSellingLot(p);
                                    setSaleMode("shares");
                                    setSaleShares(p.shares);
                                    setSaleAmountUSD(Number(totalValUSD.toFixed(2)));
                                    setSalePrice(curPrice);
                                    setSaleCommission(0);
                                    setSaleDate(new Date().toISOString().split("T")[0]);
                                    setSaleTime(new Date().toTimeString().slice(0, 5));
                                    setSaleNotes("");
                                  }}
                                  title="Registrar venta o liquidación de este lote"
                                  style={{ color: "#10b981", fontWeight: 700 }}
                                >
                                  💰
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => {
                                    setEditingPurchase(p);
                                    setEditTicker(p.ticker);
                                    setEditInvested(p.investedAmount || p.invested);
                                    setEditPrice(p.purchasePrice);
                                    setEditCommissionAmount(p.commissionAmount || p.commission || 0);
                                    setEditDate(p.date);
                                    setEditPurchaseTime(p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange));
                                  }}
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={async () => {
                                    const newPrice = await toastPrompt(
                                      `Precio actual de mercado para ${p.ticker} (ej. XTB):`,
                                      p.currentPrice,
                                    );
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

        {/* ── Historial de Ventas Realizadas / Liquidaciones ── */}
        <div className="card fade-up" style={{ padding: 24, marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>💰</span> Historial de Ventas Realizadas
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Registro de posiciones cerradas y liquidaciones con ganancia/pérdida consolidada
              </p>
            </div>
            {currentSales.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 8,
                  background: totalRealizedPnl >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${totalRealizedPnl >= 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>PnL Realizado Total:</span>
                <span
                  className="mono"
                  style={{
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: totalRealizedPnl >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  {totalRealizedPnl >= 0 ? "+" : ""}${totalRealizedPnl.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {currentSales.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 8,
                border: "1px dashed var(--border-subtle)",
              }}
            >
              No has registrado ninguna venta en este portafolio aún.
              <br />
              <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                Haz clic en el botón 💰 de cualquiera de tus lotes arriba para liquidar o vender posiciones parciales o totales.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentSales.map((s) => {
                const isWin = (s.realized_pnl || 0) >= 0;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--border-subtle)",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "1rem",
                          color: "var(--text-primary)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "4px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {s.ticker}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          Vendidas: <strong className="mono">{Number(s.shares).toFixed(4)}</strong> uds a{" "}
                          <strong className="mono">${Number(s.sale_price).toFixed(2)}</strong>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          📅 {s.sale_date} {s.sale_time ? `• ⏰ ${s.sale_time}` : ""}
                          {s.sale_commission > 0 && ` • Comisión/Fee: $${s.sale_commission.toFixed(2)}`}
                          {s.notes && ` • Nota: ${s.notes}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Beneficio Realizado</div>
                        <div
                          className="mono"
                          style={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            color: isWin ? "#10b981" : "#ef4444",
                          }}
                        >
                          {isWin ? "+" : ""}${Number(s.realized_pnl || 0).toFixed(2)}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={async () => {
                          const ok = await toastConfirm("¿Eliminar este registro de venta?");
                          if (ok) removePurchaseSale(s.id);
                        }}
                        title="Eliminar registro de venta"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Banner de Monetización / Afiliados ───────────── */}
        <AffiliateBanner />

        {/* SALE MODAL */}
        {sellingLot && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
          >
            <div
              className="card fade-up"
              style={{
                width: "100%",
                maxWidth: 480,
                padding: 24,
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
                  💰 Registrar Venta ({sellingLot.ticker})
                </h3>
                <button
                  onClick={() => setSellingLot(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Lote Comprado: </span>
                    <strong className="mono" style={{ color: "#f1f5f9" }}>
                      {Number(sellingLot.shares).toFixed(4)} uds
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Precio Compra: </span>
                    <strong className="mono" style={{ color: "#f1f5f9" }}>
                      ${Number(sellingLot.purchasePrice).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Fecha de Venta</span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered input-sm"
                      value={saleDate}
                      onChange={(e) => setSaleDate(e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Hora</span>
                    </label>
                    <input
                      type="time"
                      className="input input-bordered input-sm"
                      value={saleTime}
                      onChange={(e) => setSaleTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Precio Ejecutado */}
                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>Precio de Venta Ejecutado ($)</span>
                    {sellingLot.currentPrice && (
                      <span
                        style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => {
                          const curP = Number(sellingLot.currentPrice);
                          setSalePrice(curP);
                          if (saleMode === "shares") {
                            setSaleAmountUSD(Number((saleShares * curP).toFixed(2)));
                          }
                        }}
                      >
                        Usar precio actual (${Number(sellingLot.currentPrice).toFixed(2)})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="input input-bordered input-sm"
                    value={salePrice}
                    onChange={(e) => {
                      const newP = Number(e.target.value);
                      setSalePrice(newP);
                      if (newP > 0) {
                        if (saleMode === "shares") {
                          setSaleAmountUSD(Number((saleShares * newP).toFixed(2)));
                        } else {
                          setSaleShares(saleAmountUSD / newP);
                        }
                      }
                    }}
                  />
                </div>

                {/* Selector de Modo: Por Unidades o Por Dólares */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      background: "rgba(255,255,255,0.05)",
                      padding: 2,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSaleMode("shares");
                        if (salePrice > 0 && saleAmountUSD > 0) {
                          setSaleShares(saleAmountUSD / salePrice);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: saleMode === "shares" ? "#3b82f6" : "transparent",
                        color: saleMode === "shares" ? "#fff" : "var(--text-muted)",
                        fontWeight: 600,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Por Unidades (uds)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaleMode("usd");
                        if (salePrice > 0 && saleShares > 0) {
                          setSaleAmountUSD(Number((saleShares * salePrice).toFixed(2)));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: saleMode === "usd" ? "#3b82f6" : "transparent",
                        color: saleMode === "usd" ? "#fff" : "var(--text-muted)",
                        fontWeight: 600,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Por Monto en Dólares ($)
                    </button>
                  </div>

                  {saleMode === "shares" ? (
                    <div className="form-control">
                      <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="label-text" style={{ fontSize: "0.8rem" }}>Unidades a Vender</span>
                        <span
                          style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            setSaleShares(sellingLot.shares);
                            if (salePrice > 0) {
                              setSaleAmountUSD(Number((sellingLot.shares * salePrice).toFixed(2)));
                            }
                          }}
                        >
                          Vender 100% ({Number(sellingLot.shares).toFixed(4)} uds)
                        </span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        max={sellingLot.shares}
                        className="input input-bordered input-sm"
                        value={saleShares}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSaleShares(val);
                          if (salePrice > 0) {
                            setSaleAmountUSD(Number((val * salePrice).toFixed(2)));
                          }
                        }}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        ≈ ${(Number(saleShares) * Number(salePrice || 0)).toFixed(2)} USD brutos
                      </span>
                    </div>
                  ) : (
                    <div className="form-control">
                      <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="label-text" style={{ fontSize: "0.8rem" }}>Monto en Dólares a Vender ($)</span>
                        <span
                          style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            const maxUSD = Number((sellingLot.shares * (salePrice || sellingLot.purchasePrice)).toFixed(2));
                            setSaleAmountUSD(maxUSD);
                            setSaleShares(sellingLot.shares);
                          }}
                        >
                          Vender Todo ($
                          {Number((sellingLot.shares * (salePrice || sellingLot.purchasePrice)).toFixed(2))})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        className="input input-bordered input-sm"
                        placeholder="Ej. 100.00"
                        value={saleAmountUSD}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSaleAmountUSD(val);
                          if (salePrice > 0) {
                            setSaleShares(val / salePrice);
                          }
                        }}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Equivale a: <strong className="mono" style={{ color: "#38bdf8" }}>{salePrice > 0 ? (saleAmountUSD / salePrice).toFixed(4) : 0}</strong> unidades de {sellingLot.ticker}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>
                      Comisión / Fee de Venta o Retiro Plenti ($)
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Opcional</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="input input-bordered input-sm"
                    value={saleCommission}
                    onChange={(e) => setSaleCommission(Number(e.target.value))}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>Notas o Motivo</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Toma de ganancias, liquidación Plenti..."
                    className="input input-bordered input-sm"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                  />
                </div>

                {/* Calculation preview */}
                {(() => {
                  const sPrice = Number(salePrice) || 0;
                  const sComm = Number(saleCommission) || 0;
                  const maxSh = Number(sellingLot.shares) || 1;
                  const sShares = saleMode === "usd" 
                    ? (sPrice > 0 ? Number(saleAmountUSD) / sPrice : 0)
                    : Number(saleShares) || 0;

                  const origInv = Number(sellingLot.investedAmount || sellingLot.shares * sellingLot.purchasePrice);
                  const costBasis = (Math.min(sShares, maxSh) / maxSh) * origInv;
                  const grossRev = sShares * sPrice;
                  const netGain = grossRev - costBasis - sComm;
                  const gainPct = costBasis > 0 ? (netGain / costBasis) * 100 : 0;
                  const isPositive = netGain >= 0;

                  return (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: isPositive ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                        border: `1px solid ${isPositive ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                        borderRadius: 8,
                        fontSize: "0.8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>Ingreso Bruto de Venta:</span>
                        <strong className="mono" style={{ color: "#f1f5f9" }}>
                          ${grossRev.toFixed(2)}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>Costo Base de lo Vendido:</span>
                        <span className="mono" style={{ color: "var(--text-muted)" }}>
                          ${costBasis.toFixed(2)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          paddingTop: 4,
                          marginTop: 2,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Ganancia Realizada Neta:</span>
                        <strong
                          className="mono"
                          style={{ color: isPositive ? "#10b981" : "#ef4444", fontSize: "0.9rem" }}
                        >
                          {isPositive ? "+" : ""}${netGain.toFixed(2)} ({isPositive ? "+" : ""}{gainPct.toFixed(2)}%)
                        </strong>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setSellingLot(null)}
                  >
                    Cancelar
                  </button>
                  {(() => {
                    const sPrice = Number(salePrice) || 0;
                    const maxSh = Number(sellingLot?.shares) || 0;
                    const sShares = saleMode === "usd"
                      ? (sPrice > 0 ? Number(saleAmountUSD) / sPrice : 0)
                      : Number(saleShares) || 0;
                    const canSell = Boolean(
                      sPrice > 0 &&
                      sShares > 0 &&
                      sShares <= maxSh + 1e-4 &&
                      saleDate &&
                      saleDate.trim().length > 0
                    );
                    return (
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={handleExecuteSale}
                        disabled={!canSell}
                        style={{
                          color: "#fff",
                          fontWeight: 600,
                          cursor: canSell ? "pointer" : "not-allowed",
                          opacity: canSell ? 1 : 0.45,
                        }}
                        title={
                          canSell
                            ? "Confirmar liquidación o venta"
                            : "Completa los campos obligatorios: Precio > 0, Cantidad/Monto a vender > 0 (sin exceder el disponible) y Fecha válida"
                        }
                      >
                        Confirmar Venta
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT PURCHASE MODAL */}
        {editingPurchase && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
          >
            <div
              className="card fade-up"
              style={{
                width: "100%",
                maxWidth: 460,
                padding: 24,
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
                  ✏️ Editar Lote ({editTicker})
                </h3>
                <button
                  onClick={() => setEditingPurchase(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Fecha</span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered input-sm"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Hora</span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: "#00e5ff",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                        onClick={() =>
                          setEditPurchaseTime(
                            getMarketOpenTime(editTicker, editingPurchase?.exchange)
                          )
                        }
                        title="Fijar primera hora / apertura de mercado"
                      >
                        🔔 Apertura
                      </span>
                    </label>
                    <input
                      type="time"
                      className="input input-bordered input-sm"
                      value={editPurchaseTime}
                      onChange={(e) => setEditPurchaseTime(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Monto Invertido ($)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      className="input input-bordered input-sm"
                      value={editInvested}
                      onChange={(e) => setEditInvested(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>
                        Precio Apertura{" "}
                        {isFetchingHistorical && (
                          <span style={{ color: "#f59e0b", fontSize: "0.65rem" }}>Buscando...</span>
                        )}
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input input-bordered input-sm"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>
                      Comisión / Descuento Plenti o Broker ($)
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      Opcional
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="input input-bordered input-sm"
                    value={editCommissionAmount}
                    onChange={(e) => setEditCommissionAmount(Number(e.target.value))}
                  />
                </div>

                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Volumen resultante:</span>
                  <strong className="mono" style={{ color: "#f1f5f9" }}>
                    {editPrice > 0 ? (editInvested / editPrice).toFixed(4) : 0} uds
                  </strong>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setEditingPurchase(null)}
                  >
                    Cancelar
                  </button>
                  {(() => {
                    const canSave = Boolean(
                      Number(editInvested) > 0 &&
                      Number(editPrice) > 0 &&
                      editDate &&
                      editDate.trim().length > 0
                    );
                    return (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveEditedPurchase}
                        disabled={!canSave}
                        style={{
                          cursor: canSave ? "pointer" : "not-allowed",
                          opacity: canSave ? 1 : 0.45,
                        }}
                        title={
                          canSave
                            ? "Guardar cambios del lote"
                            : "Completa los campos obligatorios: Monto invertido > 0, Precio > 0 y Fecha válida"
                        }
                      >
                        Guardar Cambios
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        <PlanConfigModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          initialConfig={portfolio.planConfig || autoPlanAnalysis}
          onSave={(newConfig) => {
            togglePortfolioPlan(portfolioId, true, newConfig);
            setShowPlanModal(false);
          }}
        />
        <PlanExecutionModal
          isOpen={showExecutionModal}
          onClose={() => setShowExecutionModal(false)}
          planAnalysis={planAnalysis}
          liveQuotes={liveQuotes}
          currentPurchases={currentPurchases}
          onSave={handleExecutePlan}
        />
        <InflationExplorerModal
          isOpen={showInflationExplorer}
          onClose={() => setShowInflationExplorer(false)}
          inflationData={colInflationData}
        />
        <ChangeTickerModal
          isOpen={Boolean(changingTickerGroup)}
          onClose={() => setChangingTickerGroup(null)}
          group={changingTickerGroup}
          liveQuote={changingTickerGroup ? liveQuotes[changingTickerGroup.ticker] : null}
          portfolioCurrency={portfolio.assetCurrency || "USD"}
          onConfirmChange={handleConfirmChangeTicker}
        />
        <XtbImportModal
          isOpen={showXtbModal}
          onClose={() => setShowXtbModal(false)}
          currentPortfolioId={portfolioId}
          purchasePortfolios={purchasePortfolios}
          onImportPurchases={handleImportXtbPurchases}
          onCreatePortfolio={addPurchasePortfolio}
          onSelectPortfolio={onSelectPortfolio}
        />
      </div>
    </>
  );
}
