import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchFxHistory, fetchLiveQuotes, fetchNAV } from "../../api/client";
import { useCashFlowStore } from "../../store/cashFlowStore";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { usePortfolioStore } from "../../store/portfolioStore";
import { formatCashFlowMoneyWithCode, formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { formatPeriodName, formatPeriodWithCycleRange, getNextPeriod, getPrevPeriod } from "../../utils/periodUtils";
import CashFlowAllocationModal from "./CashFlowAllocationModal";
import CashFlowRuleSelector from "./CashFlowRuleSelector";
import CashFlowSankey from "./CashFlowSankey";
import ColombiaPayrollModal from "./ColombiaPayrollModal";
import CreditCardConfigModal from "./CreditCardConfigModal";
import CreditCardPaymentModal from "./CreditCardPaymentModal";
import CreditCardsSection from "./CreditCardsSection";
import CreditPurchaseModal from "./CreditPurchaseModal";
import EmergencyFundCard from "./EmergencyFundCard";
import ExpensesLogSection from "./ExpensesLogSection";
import ExpenseTransactionModal from "./ExpenseTransactionModal";
import LoanSettlementModal from "./LoanSettlementModal";
import PayrollEntityModal from "./PayrollEntityModal";
import PillarBreakdownCard from "./PillarBreakdownCard";
import RealCashLiquidityCard from "./RealCashLiquidityCard";
import AffiliateBanner from "../Common/AffiliateBanner";
import QuantumOrbitalLoader from "../QuantumOrbitalLoader";
import { useTheme } from "../../context/ThemeContext";
import "./CashFlow.css";

export default function CashFlowHub() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const {
    startPeriod,
    activePeriod,
    currency,
    allocationModel,
    customRatios,
    emergencyFundTargetMonths,
    payrollAccount,
    creditCards,
    creditPurchases,
    creditCardPayments,
    expensesLog,
    inflows,
    needs,
    wants,
    wealth,
    salaryHistory,
    isInitialized,
    initFetchCashFlow,
    setCurrency,
    setActivePeriod,
    setAllocationModel,
    setCustomRatios,
    setEmergencyFundTargetMonths,
    setPayrollAccount,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    addCreditPurchase,
    updateCreditPurchase,
    deleteCreditPurchase,
    addCreditCardPayment,
    deleteCreditCardPayment,
    addExpenseTransaction,
    updateExpenseTransaction,
    deleteExpenseTransaction,
    addInflow,
    updateInflow,
    deleteInflow,
    addNeed,
    updateNeed,
    deleteNeed,
    addWant,
    updateWant,
    deleteWant,
    addWealth,
    updateWealth,
    deleteWealth,
    recordSalaryAdjustment,
    settleLoanTransaction,
    toggleExpenseLoan,
    syncFromFixedIncome,
    syncFromPortfolio,
  } = useCashFlowStore();

  const { accounts: fixedAccounts, cdts: fixedCdts } = useFixedIncomeStore();
  const { settingsByMode, mode, customStrategies, individualPurchases, purchaseSales, purchasePortfolios } = usePortfolioStore();

  const [fxRate, setFxRate] = useState(4150);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("inflow"); // 'inflow' | 'needs' | 'wants' | 'wealth'
  const [editItem, setEditItem] = useState(null);
  const [payrollModalOpen, setPayrollModalOpen] = useState(false);
  const [payrollEntityModalOpen, setPayrollEntityModalOpen] = useState(false);
  const [creditPurchaseModalOpen, setCreditPurchaseModalOpen] = useState(false);
  const [cardConfigModalOpen, setCardConfigModalOpen] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [expenseToSettle, setExpenseToSettle] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [showLiquidity, setShowLiquidity] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showPillars, setShowPillars] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCreditCards, setShowCreditCards] = useState(false);

  // Fetch Live TRM USD/COP on mount
  useEffect(() => {
    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (res?.current) {
          setFxRate(Number(res.current));
        }
      })
      .catch(console.error);
  }, []);

  // Live Quotes & Strategy NAV for Real Investments tracking
  const [liveQuotesMap, setLiveQuotesMap] = useState({});
  const [historicalNavData, setHistoricalNavData] = useState(null);
  const [customRealNavData, setCustomRealNavData] = useState(null);

  // Fetch Live Quotes for active purchase tickers
  useEffect(() => {
    const activeTickers = [
      ...new Set(
        (individualPurchases || [])
          .filter((p) => Number(p.shares || 0) > 0 && p.ticker)
          .map((p) => p.ticker)
      ),
    ];
    if (activeTickers.length === 0) return;

    let isCancelled = false;
    const fetchQuotes = () => {
      fetchLiveQuotes(activeTickers)
        .then((quotes) => {
          if (!isCancelled && Array.isArray(quotes)) {
            const map = {};
            quotes.forEach((q) => {
              if (q?.ticker) map[q.ticker] = q;
            });
            setLiveQuotesMap((prev) => ({ ...prev, ...map }));
          }
        })
        .catch(console.error);
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [individualPurchases]);

  // Fetch NAV for Titanes Tech (historical)
  useEffect(() => {
    let isCancelled = false;
    fetchNAV({
      period: "1Y",
      investment: Number(settingsByMode?.historical?.investment || 2000),
      numSlots: Number(settingsByMode?.historical?.numSlots || 15),
      strategyId: "historical",
    })
      .then((data) => {
        if (!isCancelled && data?.summary) {
          setHistoricalNavData(data);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [settingsByMode?.historical?.investment, settingsByMode?.historical?.numSlots]);

  // Fetch NAV for Real Custom Strategy (e.g. strat_1788304141581)
  const realCustomStrat = useMemo(() => {
    return (customStrategies || []).find((s) => s.isRealMoney);
  }, [customStrategies]);

  useEffect(() => {
    if (!realCustomStrat?.id) return;
    let isCancelled = false;
    fetchNAV({
      period: "1Y",
      investment: Number(realCustomStrat.capital || settingsByMode?.[realCustomStrat.id]?.investment || 1010),
      numSlots: Number(realCustomStrat.numSlots || 20),
      strategyId: realCustomStrat.id,
    })
      .then((data) => {
        if (!isCancelled && data?.summary) {
          setCustomRealNavData(data);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [realCustomStrat, settingsByMode]);

  // Initialize store on mount
  useEffect(() => {
    initFetchCashFlow();
  }, [initFetchCashFlow]);

  // Live Auto-Sync Passive Yields & Portfolio Equity
  useEffect(() => {
    if (isInitialized) {
      if (fixedAccounts?.length > 0 || fixedCdts?.length > 0) {
        syncFromFixedIncome(fixedAccounts || [], fixedCdts || [], fxRate);
      }

      // Sum ALL strategies capital (historical + all custom strategies)
      let totalEquityUSD = settingsByMode?.historical?.investment || 0;
      if (Array.isArray(customStrategies)) {
        customStrategies.forEach((strat) => {
          totalEquityUSD += Number(strat.capital || settingsByMode?.[strat.id]?.investment || 0);
        });
      }
      // Add individual purchase lots (shares * purchasePrice per lot)
      if (Array.isArray(individualPurchases)) {
        individualPurchases.forEach((lot) => {
          totalEquityUSD += Number(lot.shares || 0) * Number(lot.purchasePrice || 0);
        });
      }

      if (totalEquityUSD > 0) {
        syncFromPortfolio(totalEquityUSD, fxRate);
      }
    }
  }, [isInitialized, fixedAccounts, fixedCdts, settingsByMode, mode, customStrategies, individualPurchases, fxRate, syncFromFixedIncome, syncFromPortfolio]);

  const formatMoney = (val, cur = currency) => formatCashFlowMoneyWithCode(val, cur, fxRate);

  // ── Period Filtered Items ──────────────────────────────────────────
  const isAtStartPeriod = Boolean(startPeriod && activePeriod <= startPeriod);

  const periodInflows = useMemo(() => {
    return inflows.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [inflows, activePeriod]);

  const periodNeeds = useMemo(() => {
    return needs.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [needs, activePeriod]);

  const periodWants = useMemo(() => {
    return wants.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [wants, activePeriod]);

  const periodWealth = useMemo(() => {
    return wealth.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [wealth, activePeriod]);

  // Active period real expenses log
  const periodExpenses = useMemo(() => {
    return (expensesLog || []).filter((tx) => !tx.period || tx.period === activePeriod);
  }, [expensesLog, activePeriod]);

  // ── Totals Aggregation (Base COP) ──────────────────────────────────
  const totalInflow = useMemo(() => {
    return periodInflows.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodInflows]);

  const salaryInflows = useMemo(() => {
    return periodInflows.filter(
      (i) =>
        i.category === "salary" ||
        i.category === "overtime" ||
        i.name?.toLowerCase().includes("salario") ||
        i.name?.toLowerCase().includes("nómina") ||
        i.name?.toLowerCase().includes("extras")
    );
  }, [periodInflows]);

  const netSalary = useMemo(() => {
    const sum = salaryInflows.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    return sum > 0 ? sum : totalInflow;
  }, [salaryInflows, totalInflow]);

  const totalNeeds = useMemo(() => {
    return periodNeeds.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodNeeds]);

  const totalWants = useMemo(() => {
    return periodWants.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodWants]);

  const totalWealth = useMemo(() => {
    return periodWealth.reduce((acc, curr) => acc + (Number(curr.monthlyContribution) || 0), 0);
  }, [periodWealth]);

  const totalAllocated = totalNeeds + totalWants + totalWealth;
  const freeCashFlow = Math.max(0, totalInflow - totalAllocated);

  const totalPassiveInflow = useMemo(() => {
    return periodInflows
      .filter((i) => i.isPassive || i.category?.startsWith("passive_"))
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodInflows]);

  const passivePctOfInflow = totalInflow > 0 ? ((totalPassiveInflow / totalInflow) * 100).toFixed(1) : 0;
  const savingsRate = totalInflow > 0 ? ((totalWealth / totalInflow) * 100).toFixed(1) : 0;

  // Emergency Fund Metrics
  const emergencyItem = wealth.find((w) => w.category === "emergency_fund") || {
    currentBalance: 0,
    targetAmount: (totalNeeds || 1) * emergencyFundTargetMonths,
  };

  // Days of Freedom Metric
  const dailyBurn = (totalNeeds + totalWants) / 30;
  const daysOfFreedom = dailyBurn > 0 ? (totalWealth / dailyBurn).toFixed(1) : "0.0";

  // ── Flujo en Paralelo: Patrimonio Total Invertido (Solo Dinero Real) ──
  const realInvestmentMetrics = useMemo(() => {
    // 1. Estrategia 1: Titanes Tech (historical)
    const titanesBaseUSD = Number(settingsByMode?.historical?.investment || 2000);
    // Rendimiento activo o total de Titanes Tech desde NAV summary
    const titanesReturnUSD = Number(historicalNavData?.summary?.active_return ?? historicalNavData?.summary?.total_return ?? 0);
    const titanesCurrentUSD = titanesBaseUSD + titanesReturnUSD;

    // 2. Estrategia 2: Estrategia Personalizada con Dinero Real (ej. strat_1788304141581)
    let customRealBaseUSD = 0;
    let customRealCurrentUSD = 0;
    let customRealReturnUSD = 0;
    const realStrats = (customStrategies || []).filter((s) => s.isRealMoney);

    realStrats.forEach((strat) => {
      const base = Number(strat.capital || settingsByMode?.[strat.id]?.investment || 0);
      customRealBaseUSD += base;
      // Si tenemos NAV para esta estrategia real, sumamos su retorno
      const stratNav = strat.id === realCustomStrat?.id ? customRealNavData : null;
      const ret = Number(stratNav?.summary?.active_return ?? stratNav?.summary?.total_return ?? 0);
      customRealReturnUSD += ret;
      customRealCurrentUSD += (base + ret);
    });

    const strategiesCount = 1 + realStrats.length; // Titanes Tech (1) + Real Custom (1) = 2
    const strategiesInvestedUSD = titanesBaseUSD + customRealBaseUSD;
    const strategiesMarketValueUSD = titanesCurrentUSD + (customRealCurrentUSD || customRealBaseUSD);
    const strategiesUnrealizedPnlUSD = strategiesMarketValueUSD - strategiesInvestedUSD;

    // 3. Compras individuales activas (costo base vs valor actual con cotizaciones en vivo)
    let purchasesInvestedUSD = 0;
    let purchasesMarketValueUSD = 0;
    let activeLotsCount = 0;

    (individualPurchases || []).forEach((lot) => {
      const sh = Number(lot.shares || 0);
      const prc = Number(lot.purchasePrice || 0);
      if (sh > 0) {
        const invested = lot.investedAmount != null ? Number(lot.investedAmount) : sh * prc;
        const liveQuote = liveQuotesMap[lot.ticker];
        const currentPrc = Number(lot.manualCurrentPrice || liveQuote?.price || prc);
        const curVal = sh * currentPrc;

        purchasesInvestedUSD += invested;
        purchasesMarketValueUSD += curVal;
        activeLotsCount += 1;
      }
    });

    const purchasesUnrealizedPnlUSD = purchasesMarketValueUSD - purchasesInvestedUSD;

    // 4. Totales Combinados (Costo Base vs Valor de Mercado)
    const totalInvestedUSD = strategiesInvestedUSD + purchasesInvestedUSD;
    const totalInvestedCOP = Math.round(totalInvestedUSD * fxRate);

    const totalMarketValueUSD = strategiesMarketValueUSD + purchasesMarketValueUSD;
    const totalMarketValueCOP = Math.round(totalMarketValueUSD * fxRate);

    const totalUnrealizedPnlUSD = totalMarketValueUSD - totalInvestedUSD;
    const totalUnrealizedPnlCOP = Math.round(totalUnrealizedPnlUSD * fxRate);
    const totalUnrealizedPnlPct = totalInvestedUSD > 0 ? (totalUnrealizedPnlUSD / totalInvestedUSD) * 100 : 0;

    // 5. Actividad de Posiciones Cerradas / Ventas durante el periodo activo
    let closedPnlMonthUSD = 0;
    let closedCountMonth = 0;
    (purchaseSales || []).forEach((sale) => {
      const saleDateStr = sale.saleDate || sale.sale_date || "";
      if (saleDateStr.startsWith(activePeriod)) {
        closedPnlMonthUSD += Number(sale.realizedPnl ?? sale.realized_pnl ?? 0);
        closedCountMonth += 1;
      }
    });

    return {
      // Base Cost Basis
      totalInvestedUSD,
      totalInvestedCOP,
      strategiesInvestedUSD,
      purchasesInvestedUSD,
      // Current Market Value
      totalMarketValueUSD,
      totalMarketValueCOP,
      strategiesMarketValueUSD,
      purchasesMarketValueUSD,
      // Unrealized P&L
      totalUnrealizedPnlUSD,
      totalUnrealizedPnlCOP,
      totalUnrealizedPnlPct,
      strategiesUnrealizedPnlUSD,
      purchasesUnrealizedPnlUSD,
      // Counts
      strategiesCount,
      activeLotsCount,
      // Monthly Closed Realized
      closedPnlMonthUSD,
      closedPnlMonthCOP: Math.round(closedPnlMonthUSD * fxRate),
      closedCountMonth,
    };
  }, [
    customStrategies,
    settingsByMode,
    historicalNavData,
    customRealNavData,
    realCustomStrat,
    individualPurchases,
    liveQuotesMap,
    purchaseSales,
    activePeriod,
    fxRate,
  ]);

  // List of budget envelope items (needs + wants + wealth) for transaction logging
  const budgetEnvelopes = useMemo(() => {
    return [
      ...periodNeeds.map((n) => ({ ...n, pillarType: "needs", typeLabel: "Gastos Fijos", amount: n.amount })),
      ...periodWants.map((w) => ({ ...w, pillarType: "wants", typeLabel: "Estilo de Vida", amount: w.amount })),
      ...periodWealth.map((w) => ({
        ...w,
        pillarType: "wealth",
        typeLabel: "Ahorro & Inversión",
        amount: Number(w.monthlyContribution) || 0,
      })),
    ];
  }, [periodNeeds, periodWants, periodWealth]);

  // ── Modal Handlers ──────────────────────────────────────────────────
  const handleOpenAddModal = (type = "inflow") => {
    setModalType(type);
    setEditItem(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (item, type = "inflow") => {
    setModalType(type);
    setEditItem({ ...item, pillarType: type });
    setModalOpen(true);
  };

  const handleDeleteItem = (id, type) => {
    if (type === "inflow") deleteInflow(id);
    if (type === "needs") deleteNeed(id);
    if (type === "wants") deleteWant(id);
    if (type === "wealth") deleteWealth(id);
    toast.success("Ítem eliminado correctamente", { icon: "🗑️" });
  };

  const handleOpenNewCardModal = () => {
    setCardToEdit(null);
    setCardConfigModalOpen(true);
  };

  const handleOpenEditCardModal = (card) => {
    setCardToEdit(card);
    setCardConfigModalOpen(true);
  };

  const handleSaveCard = (cardData) => {
    if (cardToEdit) {
      updateCreditCard(cardData.id, cardData);
      toast.success(`Tarjeta ${cardData.name} actualizada con éxito`, { icon: "💳" });
    } else {
      addCreditCard(cardData);
    }
  };

  const handleAutoSync = () => {
    syncFromFixedIncome(fixedAccounts, fixedCdts, fxRate);
    const currentSettings = settingsByMode[mode] || settingsByMode.historical;
    const inv = currentSettings?.investment || 0;
    if (inv > 0) {
      syncFromPortfolio(inv, fxRate);
    }
    toast.success("Patrimonio y rendimientos pasivos sincronizados en tiempo real", {
      icon: "⚡",
    });
  };

  return (
    <div className="cashflow-dashboard-container">
      {/* ── 1. Top Hero Header Banner ───────────────────────────────── */}
      <div className="cashflow-header-bar">
        <div className="cashflow-header-info">
          <h2 className="cashflow-title">
            <span>🌊</span> Flujo de Capital & Asignación Presupuestal
          </h2>
          <p className="cashflow-subtitle">
            Ingeniería financiera para optimización de flujo libre, nómina legal, tarjetas 0% MSI y liquidez multicuenta.
          </p>
        </div>


        {/* Primary Call-to-Action Buttons */}
        <div className="cashflow-header-actions">
          {/* Log Real Expense Button */}
          <button
            type="button"
            className="cashflow-action-btn secondary"
            style={{
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#fb7185",
            }}
            onClick={() => setExpenseModalOpen(true)}
            title="Registrar un gasto real consumido o un aporte a CDT/Cajita indicando la fuente de pago"
          >
            <span>💸</span>
            <span>Registrar Movimiento / Gasto</span>
          </button>

          {/* New Item Modal Button */}
          <button
            type="button"
            className="cashflow-action-btn primary"
            onClick={() => handleOpenAddModal("inflow")}
          >
            <span>+</span>
            <span>Nueva Asignación / Tope</span>
          </button>
        </div>
      </div>

      {/* ── 2. Floating Navigation & Utilities Toolbar ─────────────── */}
      <div className="cashflow-sub-toolbar">
        {/* Left Side: Period Navigator & Currency Selector */}
        <div className="cashflow-toolbar-left">
          {/* Dynamic Month Navigator */}
          <div className="cashflow-period-navigator">
            <button
              type="button"
              onClick={() => setActivePeriod(getPrevPeriod(activePeriod))}
              disabled={isAtStartPeriod}
              style={{
                background: "transparent",
                border: "none",
                color: isAtStartPeriod ? "var(--text-muted)" : "var(--accent-primary)",
                cursor: isAtStartPeriod ? "not-allowed" : "pointer",
                opacity: isAtStartPeriod ? 0.35 : 1,
                pointerEvents: isAtStartPeriod ? "none" : "auto",
                fontSize: "1rem",
                padding: "4px 8px",
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              title={isAtStartPeriod ? "Mes de inicio alcanzado" : "Mes anterior"}
            >
              ◀
            </button>

            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "0.3px",
                padding: "0 6px",
                textAlign: "center",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
              title={`Ciclo salarial financiado por la nómina de ${payrollAccount?.name || "Nómina"}`}
            >
              📅 {formatPeriodWithCycleRange(activePeriod, payrollAccount?.payDay || 25, payrollAccount?.customPayDate)}
            </span>

            <button
              type="button"
              onClick={() => setActivePeriod(getNextPeriod(activePeriod))}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-primary)",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "4px 8px",
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              title="Mes siguiente"
            >
              ▶
            </button>
          </div>

          {/* Currency Toggle with Real Live TRM Indicator */}
          <div className="cashflow-currency-toggle">
            <button
              type="button"
              onClick={() => setCurrency("COP")}
              style={{
                padding: "6px 14px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: currency === "COP" ? 700 : 400,
                background: currency === "COP" ? "var(--accent-glow)" : "transparent",
                color: currency === "COP" ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span role="img" aria-label="Colombia">🇨🇴</span>
              <span>COP</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              style={{
                padding: "6px 14px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: currency === "USD" ? 700 : 400,
                background: currency === "USD" ? "var(--accent-glow)" : "transparent",
                color: currency === "USD" ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              title={`Tasa Representativa del Mercado oficial: $${Math.round(fxRate).toLocaleString("es-CO")} COP por USD`}
            >
              <span role="img" aria-label="USA">🇺🇸</span>
              <span>USD</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.85, color: "var(--accent-primary)" }}>
                (≈${Math.round(fxRate).toLocaleString("es-CO")})
              </span>
            </button>
          </div>
        </div>

        {/* Right Side: Tools & Automation */}
        <div className="cashflow-toolbar-right">
          {/* Payroll Calculator Button */}
          <button
            type="button"
            className="cashflow-action-btn secondary"
            style={{ borderColor: "var(--border-accent)", color: "var(--accent-primary)" }}
            onClick={() => setPayrollModalOpen(true)}
            title="Calcular Salario Neto a partir de Salario Bruto restando Salud, Pensión y Parafiscales de Ley Colombia"
          >
            <span role="img" aria-label="Colombia">🇨🇴</span>
            <span>Liquidar Salario Neto</span>
          </button>

          {/* Sync Button */}
          <button
            type="button"
            className="cashflow-action-btn sync"
            onClick={handleAutoSync}
            title="Importar rendimientos pasivos de Cajitas Nu, Plenti USD, CDTs y Titanes Tech ETF"
          >
            <span>⚡</span>
            <span>Sincronizar Patrimonio</span>
          </button>
        </div>
      </div>

      {/* ── 3. Top KPI Summary Cards Grid (with Real TRM Conversion) ── */}
      <div className="cashflow-kpi-grid">
        {/* KPI 1: Total Inflow */}
        <div className="cashflow-kpi-card emerald">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>💼</span> Ingreso Total ({formatPeriodName(activePeriod)})
            </span>
            <span className="cashflow-kpi-badge success">Inflow</span>
          </div>
          <div className="cashflow-kpi-value">{formatMoney(totalInflow, currency)}</div>
          <div className="cashflow-kpi-footer">
            <span>Pasivo: {formatMoney(totalPassiveInflow, currency)}</span>
            <span style={{ color: "#00e5ff", fontWeight: 600 }}>{passivePctOfInflow}% del total</span>
          </div>
        </div>

        {/* KPI 2: Effective Savings Rate */}
        <div className="cashflow-kpi-card cyan">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>💎</span> Tasa de Ahorro Efectiva
            </span>
            <span
              className={`cashflow-kpi-badge ${
                Number(savingsRate) >= 30 ? "success" : Number(savingsRate) >= 20 ? "info" : "warning"
              }`}
            >
              {Number(savingsRate) >= 30 ? "🔥 Nivel FIRE" : Number(savingsRate) >= 20 ? "⚡ Saludable" : "⚠️ Bajo"}
            </span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#00e5ff" }}>
            {savingsRate}%
          </div>
          <div className="cashflow-kpi-footer">
            <span>Aporte: {formatMoney(totalWealth, currency)}</span>
            <span>Meta: {customRatios.savings}%</span>
          </div>
        </div>

        {/* KPI 3: Free Cash Flow Margin */}
        <div className="cashflow-kpi-card purple">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>⚪</span> Flujo Libre Disponible
            </span>
            <span className="cashflow-kpi-badge purple">Colchón</span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#c084fc" }}>
            {formatMoney(freeCashFlow, currency)}
          </div>
          <div className="cashflow-kpi-footer">
            <span>Asignado: {formatMoney(totalAllocated, currency)}</span>
            <span>{totalInflow > 0 ? ((freeCashFlow / totalInflow) * 100).toFixed(0) : 0}% libre</span>
          </div>
        </div>

        {/* KPI 4: Days of Financial Freedom */}
        <div className="cashflow-kpi-card amber">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>⏳</span> Días de Libertad / Mes
            </span>
            <span className="cashflow-kpi-badge warning">Independencia</span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#fbbf24" }}>
            +{daysOfFreedom} Días
          </div>
          <div className="cashflow-kpi-footer">
            <span>Gasto Diario: {formatMoney(dailyBurn, currency)}</span>
            <span style={{ color: "#10b981", fontWeight: 700 }}>Aceleración FIRE</span>
          </div>
        </div>
      </div>

      {/* ── Flujo en Paralelo: Patrimonio Invertido Real & Monitor de Posiciones Cerradas ── */}
      {/* ── Flujo en Paralelo: Patrimonio Invertido Real, Valor Actual & Ganancia/Pérdida ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.75)",
          border: isLight ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.2)",
          borderRadius: "18px",
          padding: "16px 20px",
          boxShadow: isLight ? "0 4px 16px rgba(0, 0, 0, 0.05)" : "0 8px 24px rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Tarjeta 1: Capital Base Invertido (Costo de adquisición) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.76rem",
                fontWeight: 700,
                color: isLight ? "#0284c7" : "var(--accent-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🚀</span> Capital Base Invertido
            </span>
            <span
              style={{
                fontSize: "0.66rem",
                padding: "2px 8px",
                borderRadius: "10px",
                background: "rgba(0, 229, 255, 0.12)",
                color: "#00e5ff",
                border: "1px solid rgba(0, 229, 255, 0.3)",
                fontWeight: 700,
              }}
            >
              DINERO REAL
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
            <span
              style={{
                fontSize: "1.4rem",
                fontWeight: 800,
                color: isLight ? "#0f172a" : "#f8fafc",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {currency === "USD"
                ? `$${realInvestmentMetrics.totalInvestedUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                : `$${realInvestmentMetrics.totalInvestedCOP.toLocaleString("es-CO")} COP`}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
              {currency === "USD"
                ? `(≈$${realInvestmentMetrics.totalInvestedCOP.toLocaleString("es-CO")} COP)`
                : `(≈$${realInvestmentMetrics.totalInvestedUSD.toFixed(2)} USD)`}
            </span>
          </div>

          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <span>Estrategias Reales ({realInvestmentMetrics.strategiesCount}): <strong>${realInvestmentMetrics.strategiesInvestedUSD.toFixed(0)} USD</strong></span>
            <span>·</span>
            <span>Compras Activas ({realInvestmentMetrics.activeLotsCount} lotes): <strong>${realInvestmentMetrics.purchasesInvestedUSD.toFixed(0)} USD</strong></span>
          </div>
        </div>

        {/* Tarjeta 2: Valor Actual de Mercado & Ganancia / Pérdida (P&L No Realizado) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderLeft: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
            paddingLeft: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.76rem",
                fontWeight: 700,
                color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "#10b981" : "#f43f5e",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>📈</span> Valor Actual & Rendimiento
            </span>
            <span
              style={{
                fontSize: "0.66rem",
                padding: "2px 8px",
                borderRadius: "10px",
                background:
                  realInvestmentMetrics.totalUnrealizedPnlUSD >= 0
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(244, 63, 94, 0.12)",
                color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "#10b981" : "#f43f5e",
                border:
                  realInvestmentMetrics.totalUnrealizedPnlUSD >= 0
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : "1px solid rgba(244, 63, 94, 0.3)",
                fontWeight: 700,
              }}
            >
              {realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "GANANCIA" : "PÉRDIDA"} {realInvestmentMetrics.totalUnrealizedPnlPct >= 0 ? "+" : ""}
              {realInvestmentMetrics.totalUnrealizedPnlPct.toFixed(2)}%
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
            <span
              style={{
                fontSize: "1.4rem",
                fontWeight: 800,
                color: isLight ? "#0f172a" : "#f8fafc",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {currency === "USD"
                ? `$${realInvestmentMetrics.totalMarketValueUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                : `$${realInvestmentMetrics.totalMarketValueCOP.toLocaleString("es-CO")} COP`}
            </span>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
                color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "#10b981" : "#f43f5e",
              }}
            >
              ({realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "+" : ""}
              {currency === "USD"
                ? `$${realInvestmentMetrics.totalUnrealizedPnlUSD.toFixed(2)} USD`
                : `$${realInvestmentMetrics.totalUnrealizedPnlCOP.toLocaleString("es-CO")} COP`})
            </span>
          </div>

          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <span>
              En Estrategias:{" "}
              <strong style={{ color: realInvestmentMetrics.strategiesUnrealizedPnlUSD >= 0 ? "#10b981" : "#f43f5e" }}>
                {realInvestmentMetrics.strategiesUnrealizedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.strategiesUnrealizedPnlUSD.toFixed(2)} USD
              </strong>
            </span>
            <span>·</span>
            <span>
              En Compras:{" "}
              <strong style={{ color: realInvestmentMetrics.purchasesUnrealizedPnlUSD >= 0 ? "#10b981" : "#f43f5e" }}>
                {realInvestmentMetrics.purchasesUnrealizedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.purchasesUnrealizedPnlUSD.toFixed(2)} USD
              </strong>
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Posiciones Cerradas / Rotación del Mes */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderLeft: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
            paddingLeft: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.76rem",
                fontWeight: 700,
                color: isLight ? "#059669" : "#34d399",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>💼</span> Cerradas en Mes ({formatPeriodName(activePeriod)})
            </span>
            <span
              style={{
                fontSize: "0.66rem",
                padding: "2px 8px",
                borderRadius: "10px",
                background:
                  realInvestmentMetrics.closedPnlMonthUSD >= 0
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(244, 63, 94, 0.12)",
                color: realInvestmentMetrics.closedPnlMonthUSD >= 0 ? (isLight ? "#059669" : "#34d399") : "#fb7185",
                fontWeight: 700,
              }}
            >
              {realInvestmentMetrics.closedCountMonth} {realInvestmentMetrics.closedCountMonth === 1 ? "VENTA" : "VENTAS"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
            <span
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: realInvestmentMetrics.closedPnlMonthUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {realInvestmentMetrics.closedPnlMonthUSD >= 0 ? "+" : ""}
              {currency === "USD"
                ? `$${realInvestmentMetrics.closedPnlMonthUSD.toFixed(2)} USD`
                : `$${realInvestmentMetrics.closedPnlMonthCOP.toLocaleString("es-CO")} COP`}
            </span>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
              P&L Realizado
            </span>
          </div>

          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
            {realInvestmentMetrics.closedCountMonth > 0
              ? "Fondos rotados / liquidados disponibles en broker para reinversión."
              : "Sin tomas de ganancia o ventas ejecutadas en este periodo."}
          </div>
        </div>
      </div>

      {/* ── 4. Native SVG Sankey Flow Chart + Quantum Atom Visualizer Side Panel ── */}
      <div className="cashflow-sankey-row">
        <CashFlowSankey
          inflows={periodInflows}
          needs={periodNeeds}
          wants={periodWants}
          wealth={periodWealth}
          currency={currency}
          fxRate={fxRate}
          customRatios={customRatios}
          onEditNode={(item, type) => handleOpenEditModal(item, type)}
        />

        <div className="cashflow-quantum-sidepanel">
          <div className="cashflow-quantum-sidepanel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: "0 0 8px var(--accent-primary)",
                  animation: "pulse 1.2s infinite alternate",
                }}
              />
              <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.2px" }}>
                Modelo Cuántico Atómico
              </span>
            </div>
            <span
              style={{
                fontSize: "0.68rem",
                color: "var(--accent-primary)",
                background: "var(--accent-glow)",
                padding: "2px 8px",
                borderRadius: 8,
                border: "1px solid var(--border-accent)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              Ψ_nlm(r,θ,φ)
            </span>
          </div>

          <div
            style={{
              flex: 1,
              width: "100%",
              minHeight: 380,
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              position: "relative",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <QuantumOrbitalLoader
              height="100%"
              width="100%"
              compact={false}
              showHud={true}
              cycleDuration={5.0}
              message="Densidad de Probabilidad |Ψ|²"
              style={{
                borderRadius: "12px",
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
            }}
          >
            <span>Transiciones Cuánticas Activas</span>
            <span style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
              1s ➔ 5g / sp³
            </span>
          </div>
        </div>
      </div>

      {/* ── 5. Real Liquid Cash & Funds Availability Card (COLLAPSIBLE) ──────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showLiquidity ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showLiquidity ? 14 : 0,
          }}
          onClick={() => setShowLiquidity(!showLiquidity)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>💧</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Disponibilidad Real de Plata Líquida & Fondos
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#a855f7",
                background: "rgba(130, 10, 209, 0.15)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(130, 10, 209, 0.3)",
              }}
            >
              {payrollAccount?.name || "Cuenta Principal"}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowLiquidity(!showLiquidity);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showLiquidity ? "▲ Ocultar Disponibilidad" : "▼ Desplegar Disponibilidad"}
          </button>
        </div>

        {showLiquidity && (
          <RealCashLiquidityCard
            payrollAccount={payrollAccount}
            totalInflow={totalInflow}
            inflows={periodInflows}
            needs={periodNeeds}
            wants={periodWants}
            wealth={periodWealth}
            creditCards={creditCards}
            creditPurchases={creditPurchases}
            creditCardPayments={creditCardPayments}
            expensesLog={periodExpenses}
            fixedIncomeAccounts={fixedAccounts}
            activePeriod={activePeriod}
            currency={currency}
            fxRate={fxRate}
            onOpenPayrollModal={() => setPayrollEntityModalOpen(true)}
            onOpenExpenseModal={() => {
              setExpenseToEdit(null);
              setExpenseModalOpen(true);
            }}
            onOpenPaymentModal={() => setPaymentModalOpen(true)}
          />
        )}
      </div>

      {/* ── 6. Dynamic Rule & Strategy Selector (COLLAPSIBLE) ────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showRules ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showRules ? 14 : 0,
          }}
          onClick={() => setShowRules(!showRules)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>⚙️</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Distribución Estratégica del Flujo & Reglas
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#0284c7",
                background: "rgba(2, 132, 199, 0.12)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(2, 132, 199, 0.25)",
              }}
            >
              Ratio: {customRatios.needs}% Fijos • {customRatios.wants}% Gustos • {customRatios.savings}% Ahorro
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowRules(!showRules);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showRules ? "▲ Ocultar Estrategia" : "▼ Desplegar Estrategia"}
          </button>
        </div>

        {showRules && (
          <CashFlowRuleSelector
            allocationModel={allocationModel}
            onSelectModel={setAllocationModel}
            customRatios={customRatios}
            onUpdateRatios={setCustomRatios}
            totalInflow={totalInflow}
            totalNeeds={totalNeeds}
            totalWants={totalWants}
            totalWealth={totalWealth}
            expensesLog={periodExpenses}
            currency={currency}
            fxRate={fxRate}
          />
        )}
      </div>

      {/* ── 7. Emergency Fund Runway Tracker (COLLAPSIBLE) ───────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showEmergency ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showEmergency ? 14 : 0,
          }}
          onClick={() => setShowEmergency(!showEmergency)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>🛡️</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Fondo de Emergencia & Pista de Aterrizaje (Runway)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.25)",
              }}
            >
              Meta: {emergencyFundTargetMonths} meses
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowEmergency(!showEmergency);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showEmergency ? "▲ Ocultar Fondo Emergencia" : "▼ Desplegar Fondo Emergencia"}
          </button>
        </div>

        {showEmergency && (
          <EmergencyFundCard
            emergencyItem={emergencyItem}
            totalNeeds={totalNeeds}
            targetMonths={emergencyFundTargetMonths}
            onSelectTargetMonths={setEmergencyFundTargetMonths}
            currency={currency}
            fxRate={fxRate}
            onEditEmergency={() => handleOpenAddModal("wealth")}
          />
        )}
      </div>

      {/* ── 8. 4 Pillars Structured Breakdown Grid (Topes Presupuestados vs Gastado) (COLLAPSIBLE) ── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showPillars ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showPillars ? 14 : 0,
          }}
          onClick={() => setShowPillars(!showPillars)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>🏛️</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Presupuesto Estructurado por Pilares (Ingresos, Gastos Fijos, Estilo de Vida, Ahorro)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#a855f7",
                background: "rgba(168, 85, 247, 0.12)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(168, 85, 247, 0.25)",
              }}
            >
              Asignado: {formatMoney(totalAllocated, currency)} ({totalInflow > 0 ? Math.round((totalAllocated / totalInflow) * 100) : 0}%)
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPillars(!showPillars);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showPillars ? "▲ Ocultar Pilares" : "▼ Desplegar Pilares"}
          </button>
        </div>

        {showPillars && (
          <div className="cashflow-pillars-grid" style={{ marginTop: 14 }}>
            {/* Pillar 1: Inflows */}
            <PillarBreakdownCard
              type="inflow"
              title="Ingresos Totales (Inflows)"
              icon="🟢"
              items={periodInflows}
              expensesLog={periodExpenses}
              totalInflow={totalInflow}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "inflow")}
            />

            {/* Pillar 2: Needs */}
            <PillarBreakdownCard
              type="needs"
              title="Gastos Fijos Planeados (Needs)"
              icon="🔴"
              items={periodNeeds}
              expensesLog={periodExpenses}
              totalInflow={totalInflow}
              targetRatio={customRatios.needs}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "needs")}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onSettleTransaction={(tx) => setExpenseToSettle(tx)}
            />

            {/* Pillar 3: Wants */}
            <PillarBreakdownCard
              type="wants"
              title="Estilo de Vida Presupuestado (Wants)"
              icon="🟣"
              items={periodWants}
              expensesLog={periodExpenses}
              totalInflow={totalInflow}
              targetRatio={customRatios.wants}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "wants")}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onSettleTransaction={(tx) => setExpenseToSettle(tx)}
            />

            {/* Pillar 4: Wealth */}
            <PillarBreakdownCard
              type="wealth"
              title="Ahorro & Inversión Planeado (Wealth)"
              icon="🔵"
              items={periodWealth}
              expensesLog={periodExpenses}
              totalInflow={totalInflow}
              targetRatio={customRatios.savings}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "wealth")}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onOpenAddExpenseModal={(item) => {
                setExpenseToEdit({
                  budgetItemId: item.id,
                  budgetItemName: item.name,
                  budgetItemType: "wealth",
                  amount: item.monthlyContribution || item.amount || 0,
                  description: `Aporte a ${item.name}`,
                  paymentSource: item.paymentSource || { type: "payroll", targetName: payrollAccount.name },
                });
                setExpenseModalOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* ── 9. Expenses Log & Executed Transactions Section (COLLAPSIBLE) ────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showExpenses ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showExpenses ? 14 : 0,
          }}
          onClick={() => setShowExpenses(!showExpenses)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>📋</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Historial de Gastos Reales, Ahorro & Abonos ({activePeriod})
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#f43f5e",
                background: "rgba(244, 63, 94, 0.12)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(244, 63, 94, 0.25)",
              }}
            >
              {(expensesLog || []).filter(tx => !tx.period || tx.period === activePeriod).length} movimientos
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowExpenses(!showExpenses);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showExpenses ? "▲ Ocultar Gastos" : "▼ Desplegar Gastos"}
          </button>
        </div>

        {showExpenses && (
          <div style={{ marginTop: 14 }}>
            <ExpensesLogSection
              expensesLog={expensesLog}
              creditCardPayments={creditCardPayments}
              activePeriod={activePeriod}
              currency={currency}
              fxRate={fxRate}
              payrollAccount={payrollAccount}
              creditCards={creditCards}
              fixedIncomeAccounts={fixedAccounts}
              onOpenExpenseModal={() => {
                setExpenseToEdit(null);
                setExpenseModalOpen(true);
              }}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onOpenPaymentModal={() => setPaymentModalOpen(true)}
              onDeleteTransaction={deleteExpenseTransaction}
              onDeletePayment={deleteCreditCardPayment}
              onConfirmSettlement={settleLoanTransaction}
              onToggleExpenseLoan={toggleExpenseLoan}
            />
          </div>
        )}
      </div>

      {/* ── 10. Credit Cards & Installments Management Section (COLLAPSIBLE) ──────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showCreditCards ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          marginTop: 14,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showCreditCards ? 14 : 0,
          }}
          onClick={() => setShowCreditCards(!showCreditCards)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>💳</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Tarjetas de Crédito & Financiación Inteligente (MSI / Cuotas)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.25)",
              }}
            >
              {creditCards.length} tarjeta(s) registrada(s)
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCreditCards(!showCreditCards);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showCreditCards ? "▲ Ocultar Tarjetas" : "▼ Desplegar Tarjetas"}
          </button>
        </div>

        {showCreditCards && (
          <div style={{ marginTop: 14 }}>
            <CreditCardsSection
              creditCards={creditCards}
              creditPurchases={creditPurchases}
              creditCardPayments={creditCardPayments}
              netSalary={netSalary}
              activePeriod={activePeriod}
              currency={currency}
              fxRate={fxRate}
              onOpenCreditPurchaseModal={() => setCreditPurchaseModalOpen(true)}
              onOpenNewCardModal={handleOpenNewCardModal}
              onOpenEditCardModal={handleOpenEditCardModal}
              onOpenPaymentModal={() => setPaymentModalOpen(true)}
              onDeletePurchase={deleteCreditPurchase}
              onDeleteCard={deleteCreditCard}
              onDeletePayment={deleteCreditCardPayment}
            />
          </div>
        )}
      </div>

      {/* ── Banner de Referidos Financieros (Nu, Rappi, Plenti, ARQ) ── */}
      <AffiliateBanner type="fixed_income" />

      {/* ── 11. Interactive Allocation Modal ───────────────────────── */}
      <CashFlowAllocationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialType={modalType}
        editItem={editItem}
        activePeriod={activePeriod}
        currency={currency}
        payrollAccount={payrollAccount}
        creditCards={creditCards}
        fixedIncomeAccounts={fixedAccounts}
        onOpenPayrollModal={() => setPayrollModalOpen(true)}
        onSaveInflow={addInflow}
        onUpdateInflow={updateInflow}
        onSaveNeed={addNeed}
        onUpdateNeed={updateNeed}
        onSaveWant={addWant}
        onUpdateWant={updateWant}
        onSaveWealth={addWealth}
        onUpdateWealth={updateWealth}
        totalInflowCurrent={totalInflow}
        totalNeedsCurrent={totalNeeds}
        totalWantsCurrent={totalWants}
        totalWealthCurrent={totalWealth}
      />

      {/* ── 12. Colombia Legal Payroll & Parafiscales Modal ─────────── */}
      <ColombiaPayrollModal
        isOpen={payrollModalOpen}
        onClose={() => setPayrollModalOpen(false)}
        onApplySalary={recordSalaryAdjustment}
        activePeriod={activePeriod}
        salaryHistory={salaryHistory}
      />

      {/* ── 13. Payroll Bank Account Entity Selector Modal ─────────── */}
      <PayrollEntityModal
        isOpen={payrollEntityModalOpen}
        onClose={() => setPayrollEntityModalOpen(false)}
        currentAccount={payrollAccount}
        onSavePayrollAccount={setPayrollAccount}
      />

      {/* ── 14. Credit Purchase & Installments Modal ────────────────── */}
      <CreditPurchaseModal
        isOpen={creditPurchaseModalOpen}
        onClose={() => setCreditPurchaseModalOpen(false)}
        creditCards={creditCards}
        activePeriod={activePeriod}
        currency={currency}
        onSaveCreditPurchase={addCreditPurchase}
      />

      {/* ── 15. Credit Card Config / Edit Modal (Real Quotas & SFC Rates) ── */}
      <CreditCardConfigModal
        isOpen={cardConfigModalOpen}
        onClose={() => setCardConfigModalOpen(false)}
        cardToEdit={cardToEdit}
        creditCards={creditCards}
        netSalary={netSalary}
        currency={currency}
        fxRate={fxRate}
        onSaveCard={handleSaveCard}
        onDeleteCard={deleteCreditCard}
      />

      {/* ── 16. Real Executed Expense / Wealth Logging & Edit Modal ─── */}
      <ExpenseTransactionModal
        isOpen={expenseModalOpen}
        onClose={() => {
          setExpenseToEdit(null);
          setExpenseModalOpen(false);
        }}
        activePeriod={activePeriod}
        currency={currency}
        budgetItems={budgetEnvelopes}
        payrollAccount={payrollAccount}
        creditCards={creditCards}
        fixedIncomeAccounts={fixedAccounts}
        editTransaction={expenseToEdit}
        onSaveExpenseTransaction={addExpenseTransaction}
        onUpdateExpenseTransaction={updateExpenseTransaction}
      />

      {/* ── 17. Credit Card Debt Payment & Quota Liberation Modal ───── */}
      <CreditCardPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        activePeriod={activePeriod}
        currency={currency}
        creditCards={creditCards}
        payrollAccount={payrollAccount}
        fixedIncomeAccounts={fixedAccounts}
        onSavePayment={addCreditCardPayment}
      />

      {/* ── 18. Global Loan Settlement & Reimbursement Modal ────────── */}
      {expenseToSettle && (
        <LoanSettlementModal
          isOpen={Boolean(expenseToSettle)}
          onClose={() => setExpenseToSettle(null)}
          transaction={expenseToSettle}
          currency={currency}
          fxRate={fxRate}
          payrollAccount={payrollAccount}
          creditCards={creditCards}
          fixedIncomeAccounts={fixedAccounts}
          onConfirmSettlement={settleLoanTransaction}
        />
      )}
    </div>
  );
}
