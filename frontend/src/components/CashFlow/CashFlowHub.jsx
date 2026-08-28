import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchFxHistory } from "../../api/client";
import { useCashFlowStore } from "../../store/cashFlowStore";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { usePortfolioStore } from "../../store/portfolioStore";
import { formatCashFlowMoneyWithCode, formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { formatPeriodName, getNextPeriod, getPrevPeriod } from "../../utils/periodUtils";
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
import "./CashFlow.css";

export default function CashFlowHub() {
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
  const { settingsByMode, mode } = usePortfolioStore();

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
      const currentSettings = settingsByMode[mode] || settingsByMode.historical;
      const inv = currentSettings?.investment || 0;
      if (inv > 0) {
        syncFromPortfolio(inv, fxRate);
      }
    }
  }, [isInitialized, fixedAccounts, fixedCdts, settingsByMode, mode, fxRate, syncFromFixedIncome, syncFromPortfolio]);

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
                color: isAtStartPeriod ? "#475569" : "#38bdf8",
                cursor: isAtStartPeriod ? "not-allowed" : "pointer",
                opacity: isAtStartPeriod ? 0.25 : 1,
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
                color: "#f8fafc",
                letterSpacing: "0.3px",
                width: "160px",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-block",
              }}
            >
              📅 {formatPeriodName(activePeriod)}
            </span>

            <button
              type="button"
              onClick={() => setActivePeriod(getNextPeriod(activePeriod))}
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
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
                background: currency === "COP" ? "rgba(0, 229, 255, 0.18)" : "transparent",
                color: currency === "COP" ? "#00e5ff" : "#94a3b8",
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
                background: currency === "USD" ? "rgba(0, 229, 255, 0.18)" : "transparent",
                color: currency === "USD" ? "#00e5ff" : "#94a3b8",
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
              <span style={{ fontSize: "0.7rem", opacity: 0.8, color: "#38bdf8" }}>
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
            style={{ borderColor: "rgba(0, 229, 255, 0.3)", color: "#38bdf8" }}
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

      {/* ── 4. Real Liquid Cash & Funds Availability Card ──────────── */}
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

      {/* ── 5. Dynamic Rule & Strategy Selector ────────────────────── */}
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

      {/* ── 6. Native SVG Sankey / Cash Waterfall Flow Chart ───────── */}
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

      {/* ── 7. Emergency Fund Runway Tracker ───────────────────────── */}
      <EmergencyFundCard
        emergencyItem={emergencyItem}
        totalNeeds={totalNeeds}
        targetMonths={emergencyFundTargetMonths}
        onSelectTargetMonths={setEmergencyFundTargetMonths}
        currency={currency}
        fxRate={fxRate}
        onEditEmergency={() => handleOpenAddModal("wealth")}
      />

      {/* ── 8. 4 Pillars Structured Breakdown Grid (Topes Presupuestados vs Gastado) ── */}
      <div className="cashflow-pillars-grid">
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

      {/* ── 9. Expenses Log & Executed Transactions Section ────────── */}
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

      {/* ── 10. Credit Cards & Installments Management Section ──────── */}
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
