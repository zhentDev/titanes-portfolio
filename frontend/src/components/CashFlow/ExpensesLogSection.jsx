import React, { useState, useMemo } from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import LoanSettlementModal from "./LoanSettlementModal";
import AssignMovementModal from "./AssignMovementModal";
import { toastConfirm } from "../../utils/toastAlerts";
import { useTheme } from "../../context/ThemeContext";
import "./CashFlow.css";

export default function ExpensesLogSection({
  expensesLog = [],
  creditCardPayments = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  creditCards = [],
  debts = [],
  budgetItems = [],
  fixedIncomeAccounts = [],
  onOpenExpenseModal,
  onEditTransaction,
  onOpenPaymentModal,
  onSaveTransaction,
  onDeleteTransaction,
  onDeletePayment,
  onConfirmSettlement,
  onToggleExpenseLoan,
  onConvertExpenseToCardPayment,
  onReclassifyMovement,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [filterSource, setFilterSource] = useState("all");
  const [settlingTransaction, setSettlingTransaction] = useState(null);
  const [assignModalItem, setAssignModalItem] = useState(null);
  const [collapsedDeductions, setCollapsedDeductions] = useState({});
  const toggleDeductions = (id) => setCollapsedDeductions((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDeleteTransaction = async (item) => {
    const title = item.description || "este movimiento";
    const ok = await toastConfirm(`¿Estás seguro de que deseas eliminar "${title}" por ${formatMoney(item.amount, currency)}?`);
    if (ok && onDeleteTransaction) {
      onDeleteTransaction(item.id);
    }
  };

  const handleDeleteCardPayment = async (item) => {
    const cardTitle = item.cardName || "tarjeta";
    const ok = await toastConfirm(`¿Estás seguro de que deseas eliminar el abono a "${cardTitle}" por ${formatMoney(item.amount, currency)}?`);
    if (ok && onDeletePayment) {
      onDeletePayment(item.id);
    }
  };

  const formatMovementDateTime = (item) => {
    const d = item.date || item.createdAt?.slice(0, 10) || "";
    let timeStr = item.time || "";

    if (!timeStr && item.createdAt) {
      try {
        const dt = new Date(item.createdAt);
        if (!isNaN(dt.getTime())) {
          timeStr = dt.toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        }
      } catch {}
    } else if (timeStr && timeStr.includes(":")) {
      const parts = timeStr.split(":");
      let h = parseInt(parts[0], 10);
      const m = parts[1]?.slice(0, 2) || "00";
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      timeStr = `${h}:${m} ${ampm}`;
    }

    return { date: d, time: timeStr };
  };

  const periodExpenses = useMemo(() => {
    return (expensesLog || [])
      .filter((tx) => !tx.period || tx.period === activePeriod)
      .map((tx) => {
        const isIncome = tx.type === "credit" || tx.budgetItemType === "income";
        const isWealth = tx.budgetItemType === "wealth" || tx.budgetItemId?.startsWith("wealth_");
        return {
          ...tx,
          itemType: isWealth ? "wealth_saving" : isIncome ? "income" : "expense",
        };
      });
  }, [expensesLog, activePeriod]);

  // Sub-items resulting from credit card multi-rubro split distribution are deductions,
  // NOT standalone movements. The only true primary movement is the credit card payment.
  const isSplitDeductionChild = (tx) => Boolean(
    tx.isCreditCardPayoff ||
    tx.creditCardPaymentId ||
    (tx.id && String(tx.id).includes("_split_")) ||
    (tx.description && String(tx.description).toLowerCase().includes("descontado de"))
  );

  const standaloneExpenses = useMemo(() => {
    return periodExpenses.filter((tx) => !isSplitDeductionChild(tx));
  }, [periodExpenses]);

  const periodPayments = useMemo(() => {
    return (creditCardPayments || [])
      .filter((p) => !p.period || p.period === activePeriod)
      .map((p) => {
        let deductions = Array.isArray(p.budgetDeductions) && p.budgetDeductions.length > 0
          ? p.budgetDeductions
          : [];

        // If not stored in p.budgetDeductions, find any split child expenses in expensesLog matching this payment
        if (deductions.length === 0 && (p.description?.includes("Distribuido en") || p.notes?.includes("Distribuido"))) {
          const matchingChildren = (expensesLog || []).filter(
            (e) =>
              (e.creditCardPaymentId === p.id ||
                (e.id && String(e.id).includes("_split_")) ||
                (e.description && String(e.description).toLowerCase().includes("descontado de"))) &&
              (!e.period || e.period === activePeriod)
          );
          if (matchingChildren.length > 0) {
            deductions = matchingChildren.map((c) => ({
              budgetItemId: c.budgetItemId,
              budgetItemName: c.budgetItemName,
              budgetItemType: c.budgetItemType,
              amount: Number(c.amount),
              isEmergencySavingsDeduction: c.budgetItemType === "wealth" || c.budgetItemId?.startsWith("wealth_"),
            }));
          }
        }

        return {
          ...p,
          itemType: "card_payment",
          budgetDeductions: deductions,
        };
      });
  }, [creditCardPayments, expensesLog, activePeriod]);

  // Combined sorted activity feed: Standalone movements + Card Payments (no duplicate split children)
  const combinedActivities = useMemo(() => {
    const combined = [...standaloneExpenses, ...periodPayments];
    return combined.sort((a, b) => {
      const getTimestamp = (item) => {
        if (item.createdAt) {
          const t = new Date(item.createdAt).getTime();
          if (!isNaN(t)) return t;
        }
        if (item.date) {
          const timePart = item.time ? (item.time.length === 5 ? `${item.time}:00` : item.time) : "00:00:00";
          const t = new Date(`${item.date}T${timePart}`).getTime();
          if (!isNaN(t)) return t;
        }
        return 0;
      };

      const diff = getTimestamp(b) - getTimestamp(a);
      if (diff !== 0) return diff;

      const dateA = a.date || a.createdAt || "";
      const dateB = b.date || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
  }, [standaloneExpenses, periodPayments]);

  const pendingLoans = useMemo(() => {
    return standaloneExpenses.filter((tx) => tx.isLoan && tx.loanStatus !== "settled");
  }, [standaloneExpenses]);

  const totalPendingLoansAmt = useMemo(() => {
    return pendingLoans.reduce((acc, tx) => acc + (Number(tx.loanAmount) || Number(tx.amount) || 0), 0);
  }, [pendingLoans]);

  const filteredActivities = useMemo(() => {
    if (filterSource === "all") return combinedActivities;
    if (filterSource === "only_loans") return combinedActivities.filter((i) => i.isLoan);
    if (filterSource === "only_expenses") return combinedActivities.filter((i) => i.itemType === "expense" && !i.isLoan);
    if (filterSource === "only_incomes") return combinedActivities.filter((i) => i.itemType === "income");
    if (filterSource === "only_wealth") return combinedActivities.filter((i) => i.itemType === "wealth_saving");
    if (filterSource === "only_payments") return combinedActivities.filter((i) => i.itemType === "card_payment");
    if (filterSource === "payroll") {
      return combinedActivities.filter(
        (i) =>
          ((i.itemType === "expense" || i.itemType === "wealth_saving") && (!i.paymentSource || i.paymentSource.type === "payroll")) ||
          (i.itemType === "card_payment" && (!i.sourceType || i.sourceType === "payroll"))
      );
    }
    if (filterSource === "credit_card") {
      return combinedActivities.filter((i) => i.itemType === "expense" && i.paymentSource?.type === "credit_card");
    }
    if (filterSource === "fixed_pocket") {
      return combinedActivities.filter(
        (i) =>
          ((i.itemType === "expense" || i.itemType === "wealth_saving") && i.paymentSource?.type === "fixed_pocket") ||
          (i.itemType === "card_payment" && i.sourceType === "fixed_pocket")
      );
    }
    if (filterSource === "investment_cash") {
      return combinedActivities.filter((i) => i.paymentSource?.type === "investment_cash");
    }
    return combinedActivities;
  }, [combinedActivities, filterSource]);

  const totalSpentInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "expense")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalIncomeInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "income")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalSavedInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "wealth_saving")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalPaidToCards = periodPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  return (
    <div className="cashflow-expenses-section">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>📋</span> Historial de Gastos Reales, Ahorro & Abonos ({activePeriod})
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Transacciones de nómina: gastos de vida, transferencias a CDTs o cuentas de ahorro y abonos de deuda de tarjetas.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "space-between", width: "100%", maxWidth: "100%" }}>
          <div style={{ display: "flex", gap: "10px 18px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Saldo Actual Disponible en Nómina */}
            <div
              style={{
                minWidth: "135px",
                textAlign: "left",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                borderRadius: "10px",
                padding: "4px 10px",
              }}
            >
              <span style={{ fontSize: "0.72rem", color: "#10b981", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                <span>🏦</span> Saldo en Nómina
              </span>
              <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: (totalIncomeInPeriod - totalSpentInPeriod - totalSavedInPeriod - totalPaidToCards) >= 0 ? "#10b981" : "#f43f5e" }}>
                {(totalIncomeInPeriod - totalSpentInPeriod - totalSavedInPeriod - totalPaidToCards) >= 0
                  ? `+${formatMoney(totalIncomeInPeriod - totalSpentInPeriod - totalSavedInPeriod - totalPaidToCards, currency)}`
                  : `-${formatMoney(Math.abs(totalIncomeInPeriod - totalSpentInPeriod - totalSavedInPeriod - totalPaidToCards), currency)}`}
              </strong>
            </div>

            {totalIncomeInPeriod > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "#10b981", display: "block" }}>📥 Total Ingresos</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#10b981" }}>
                  +{formatMoney(totalIncomeInPeriod, currency)}
                </strong>
              </div>
            )}

            <div style={{ minWidth: "105px", textAlign: "left" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Total Gastado Real</span>
              <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#f43f5e" }}>
                -{formatMoney(totalSpentInPeriod, currency)}
              </strong>
            </div>

            {totalPendingLoansAmt > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "#fcd34d", display: "block" }}>🤝 Préstamos por Cobrar</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#f59e0b" }}>
                  {formatMoney(totalPendingLoansAmt, currency)}
                </strong>
              </div>
            )}

            {totalSavedInPeriod > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Aporte a CDTs / Ahorro</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#38bdf8" }}>
                  -{formatMoney(totalSavedInPeriod, currency)}
                </strong>
              </div>
            )}

            {totalPaidToCards > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Abonos a Tarjetas</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#10b981" }}>
                  -{formatMoney(totalPaidToCards, currency)}
                </strong>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onOpenPaymentModal && (
              <button
                type="button"
                className="cashflow-action-btn secondary"
                onClick={onOpenPaymentModal}
                style={{
                  fontSize: "0.8rem",
                  padding: "7px 12px",
                  borderColor: "rgba(16, 185, 129, 0.4)",
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.12)",
                }}
              >
                <span>💵</span> Abonar Tarjeta
              </button>
            )}

            {onOpenExpenseModal && (
              <button
                type="button"
                className="cashflow-action-btn primary"
                onClick={onOpenExpenseModal}
                style={{ fontSize: "0.8rem", padding: "7px 14px" }}
              >
                <span>+</span> Registrar Movimiento
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { id: "all", label: `Todos los Movimientos (${combinedActivities.length})` },
          { id: "only_expenses", label: `💸 Gastos Reales (${standaloneExpenses.filter(i => i.itemType === "expense" && !i.isLoan).length})` },
          { id: "only_incomes", label: `📥 Ingresos (${standaloneExpenses.filter(i => i.itemType === "income").length})` },
          { id: "only_payments", label: `💵 Abonos a Tarjetas (${periodPayments.length})` },
          { id: "only_loans", label: `🤝 Préstamos por Cobrar ${pendingLoans.length > 0 ? `(${pendingLoans.length})` : ""}` },
          { id: "only_wealth", label: `💎 Aportes CDTs/Ahorro (${standaloneExpenses.filter(i => i.itemType === "wealth_saving").length})` },
          { id: "payroll", label: "🏦 Nómina" },
          { id: "credit_card", label: "💳 Tarjeta de Crédito" },
          { id: "fixed_pocket", label: "📦 Cuentas de Ahorro / Renta Fija" },
          { id: "investment_cash", label: "🚀 Broker" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterSource(f.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: filterSource === f.id ? "1px solid var(--text-accent)" : "1px solid var(--border)",
              background: filterSource === f.id ? "rgba(2, 132, 199, 0.15)" : "var(--bg-surface)",
              color: filterSource === f.id ? "var(--text-accent)" : "var(--text-muted)",
              fontSize: "0.78rem",
              fontWeight: filterSource === f.id ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transactions & Payments List */}
      {filteredActivities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b", fontSize: "0.85rem" }}>
          No hay movimientos registrados con este filtro en este período.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredActivities.map((item) => {
            const isPayment = item.itemType === "card_payment";
            const isWealth = item.itemType === "wealth_saving";

            if (isPayment) {
              const hasDeductions = Array.isArray(item.budgetDeductions) && item.budgetDeductions.length > 0;
              const hasWealthEmergency = hasDeductions && item.budgetDeductions.some(
                (d) => d.budgetItemType === "wealth" || d.isEmergencySavingsDeduction || d.budgetItemName?.toLowerCase().includes("ahorro") || d.budgetItemName?.toLowerCase().includes("renta") || d.budgetItemName?.toLowerCase().includes("invers")
              );
              const isCollapsed = Boolean(collapsedDeductions[item.id]);

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: hasWealthEmergency ? "rgba(245, 158, 11, 0.05)" : "rgba(16, 185, 129, 0.08)",
                    border: hasWealthEmergency ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "1rem" }}>{hasWealthEmergency ? "⚠️ 💳" : "💵"}</span>
                        <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)", wordBreak: "break-word" }}>
                          {item.cardName} • {item.description || "Abono a deuda / pago factura"}
                        </strong>
                        <span
                          style={{
                            background: "rgba(16, 185, 129, 0.2)",
                            border: "1px solid #10b981",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            color: "#10b981",
                            fontWeight: 700,
                          }}
                        >
                          ✓ Abono / Libera Cupo
                        </span>
                        {hasWealthEmergency ? (
                          <span
                            style={{
                              background: "rgba(245, 158, 11, 0.18)",
                              border: "1px solid rgba(245, 158, 11, 0.4)",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              color: "#f59e0b",
                              fontWeight: 700,
                            }}
                          >
                            ⚠️ Desvío de Ahorro (Emergencia)
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "rgba(16, 185, 129, 0.12)",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              color: "#10b981",
                              fontWeight: 700,
                            }}
                          >
                            📤 Salida (Abono)
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>📅 {formatMovementDateTime(item).date || "Fecha no especificada"}</span>
                        {formatMovementDateTime(item).time && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {formatMovementDateTime(item).time}</span>
                          </>
                        )}
                        <span>•</span>
                        <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                          Pagado desde: {item.sourceAccount || "Nómina Nu"}
                        </span>
                        {onReclassifyMovement && (
                          <>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setAssignModalItem(item)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#0ea5e9",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                                padding: 0,
                                textDecoration: "underline",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title="Distribuir este abono en varios rubros del mes o cambiar asignación"
                            >
                              <span>🏷️</span> Distribuir en Rubros / Reasignar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, textAlign: "right" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: hasWealthEmergency ? "#f59e0b" : "#10b981" }}>
                        -{formatMoney(item.amount, currency)}
                      </span>
                      {onEditTransaction && (
                        <button
                          type="button"
                          onClick={() => onEditTransaction(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            cursor: "pointer",
                            padding: "4px",
                            fontSize: "0.85rem",
                          }}
                          title="Editar este pago de tarjeta"
                        >
                          ✏️
                        </button>
                      )}
                      {onDeletePayment && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCardPayment(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: "4px",
                            fontSize: "0.85rem",
                          }}
                          title="Revertir este pago de tarjeta"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Integrated Distribution Sub-list ("parte de lista") */}
                  {hasDeductions && (
                    <div style={{ marginTop: 10, width: "100%" }}>
                      <div
                        onClick={() => toggleDeductions(item.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          color: isLight ? "#0284c7" : "#38bdf8",
                          cursor: "pointer",
                          padding: "2px 0",
                          userSelect: "none",
                        }}
                      >
                        <span>{isCollapsed ? "▶" : "▼"}</span>
                        <span>
                          Distribución imputada en {item.budgetDeductions.length} rubros
                          {hasWealthEmergency && (
                            <span style={{ color: "#f59e0b", marginLeft: 6, fontWeight: 700 }}>
                              (⚠️ Ahorro usado para cubrir tarjeta por emergencia)
                            </span>
                          )}
                        </span>
                      </div>

                      {!isCollapsed && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            marginTop: 8,
                            padding: "8px 12px",
                            borderRadius: "10px",
                            background: isLight ? "rgba(241, 245, 249, 0.7)" : "rgba(10, 16, 30, 0.45)",
                            border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {item.budgetDeductions.map((ded, idx) => {
                            const isWealthDeduction =
                              ded.budgetItemType === "wealth" ||
                              ded.isEmergencySavingsDeduction ||
                              ded.budgetItemName?.toLowerCase().includes("ahorro") ||
                              ded.budgetItemName?.toLowerCase().includes("renta") ||
                              ded.budgetItemName?.toLowerCase().includes("invers");

                            return (
                              <div
                                key={idx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 10px",
                                  borderRadius: "7px",
                                  background: isWealthDeduction
                                    ? (isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.18)")
                                    : (isLight ? "#ffffff" : "rgba(15, 23, 42, 0.6)"),
                                  border: isWealthDeduction
                                    ? "1px solid rgba(245, 158, 11, 0.45)"
                                    : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)"),
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "0.95rem" }}>
                                    {isWealthDeduction ? "⚠️" : ded.budgetItemType === "needs" ? "🏠" : "🍿"}
                                  </span>
                                  <strong style={{ fontSize: "0.82rem", color: isWealthDeduction ? "#f59e0b" : "var(--text-primary)" }}>
                                    {ded.budgetItemName}
                                  </strong>
                                  {isWealthDeduction ? (
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        fontWeight: 800,
                                        color: "#f59e0b",
                                        background: isLight ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.3)",
                                        border: "1px solid rgba(245, 158, 11, 0.5)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      ⚠️ Desvío de Ahorro (Caso de Emergencia para Tarjeta)
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        color: "var(--text-muted)",
                                        background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {ded.budgetItemType === "needs" ? "Gastos Fijos" : "Estilo de Vida"}
                                    </span>
                                  )}
                                </div>

                                <span
                                  style={{
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: "0.85rem",
                                    fontWeight: 700,
                                    color: isWealthDeduction ? "#f59e0b" : (isLight ? "#0f172a" : "#f1f5f9"),
                                  }}
                                >
                                  -{formatMoney(ded.amount, currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (isWealth) {
              const isCardPayoffEmergency =
                item.isCreditCardPayoff ||
                Boolean(item.creditCardPaymentId) ||
                item.isEmergencySavingsDeduction ||
                item.description?.toLowerCase().includes("pago") ||
                item.description?.toLowerCase().includes("descontado de");

              const cardBg = isCardPayoffEmergency
                ? (isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)")
                : "rgba(56, 189, 248, 0.08)";
              const cardBorder = isCardPayoffEmergency
                ? "1px solid rgba(245, 158, 11, 0.4)"
                : "1px solid rgba(56, 189, 248, 0.25)";
              const mainColor = isCardPayoffEmergency ? "#f59e0b" : "#38bdf8";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1rem" }}>{isCardPayoffEmergency ? "⚠️ 💳" : "💎"}</span>
                      <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)", wordBreak: "break-word" }}>
                        {item.description}
                      </strong>
                      <span
                        style={{
                          background: isCardPayoffEmergency ? "rgba(245, 158, 11, 0.15)" : "rgba(56, 189, 248, 0.18)",
                          border: `1px solid ${mainColor}`,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: mainColor,
                          fontWeight: 700,
                        }}
                      >
                        {item.budgetItemName} • {isCardPayoffEmergency ? "Ahorro Afectado" : "Inversión / Ahorro"}
                      </span>
                      <span
                        style={{
                          background: isCardPayoffEmergency ? "rgba(245, 158, 11, 0.2)" : "rgba(56, 189, 248, 0.15)",
                          border: isCardPayoffEmergency ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(56, 189, 248, 0.35)",
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.68rem",
                          color: mainColor,
                          fontWeight: 700,
                        }}
                      >
                        {isCardPayoffEmergency ? "⚠️ Salida (Desvío de Ahorro para Tarjeta)" : "📤 Salida (Aporte a Ahorro)"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>📅 {formatMovementDateTime(item).date || "Fecha no especificada"}</span>
                      {formatMovementDateTime(item).time && (
                        <>
                          <span>•</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {formatMovementDateTime(item).time}</span>
                        </>
                      )}
                      <span>•</span>
                      <span style={{ color: isCardPayoffEmergency ? "#f59e0b" : "#c084fc", fontWeight: 600 }}>
                        Descontado de: {item.paymentSource?.targetName || "Nómina Nu"}
                      </span>
                      {isCardPayoffEmergency && (
                        <>
                          <span>•</span>
                          <span style={{ color: "#f59e0b", fontStyle: "italic", fontSize: "0.7rem" }}>
                            (⚠️ Caso de emergencia: cubrió deuda de tarjeta, no es ahorro real)
                          </span>
                        </>
                      )}
                      {item.destinationAccountName && !isCardPayoffEmergency && (
                        <>
                          <span>•</span>
                          <span style={{ color: "#10b981", fontWeight: 600 }}>
                            📍 Cuenta destino: {item.destinationAccountName}
                          </span>
                        </>
                      )}
                      {onReclassifyMovement && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setAssignModalItem(item)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#0ea5e9",
                              fontSize: "0.72rem",
                              cursor: "pointer",
                              padding: 0,
                              textDecoration: "underline",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                            title="Cambiar rubro o reasignar cuenta de destino"
                          >
                            <span>🏷️</span> Cambiar Asignación / Cuenta
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, textAlign: "right" }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: mainColor }}>
                      -{formatMoney(item.amount, currency)}
                    </span>
                    {onEditTransaction && (
                      <button
                        type="button"
                        onClick={() => onEditTransaction(item)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: mainColor,
                          cursor: "pointer",
                          padding: "4px",
                          fontSize: "0.85rem",
                        }}
                        title="Editar este aporte o movimiento"
                      >
                        ✏️
                      </button>
                    )}
                    {onDeleteTransaction && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTransaction(item)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: "4px",
                          fontSize: "0.85rem",
                        }}
                        title="Eliminar este movimiento"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // Normal Expense or Loan Item
            const source = item.paymentSource || {};
            const sourceColor =
              source.type === "credit_card"
                ? "#f43f5e"
                : source.type === "fixed_pocket"
                ? "#38bdf8"
                : "#c084fc";

            const isLoan = Boolean(item.isLoan);
            const isSettled = item.loanStatus === "settled";
            const isIncome = item.itemType === "income";
            const { date: itemDate, time: itemTime } = formatMovementDateTime(item);

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: isLoan
                    ? isSettled
                      ? "rgba(16, 185, 129, 0.06)"
                      : "rgba(245, 158, 11, 0.08)"
                    : isIncome
                    ? "rgba(16, 185, 129, 0.05)"
                    : "var(--bg-card)",
                  border: isLoan
                    ? isSettled
                      ? "1px solid rgba(16, 185, 129, 0.35)"
                      : "1px solid rgba(245, 158, 11, 0.4)"
                    : isIncome
                    ? "1px solid rgba(16, 185, 129, 0.25)"
                    : "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)", wordBreak: "break-word" }}>
                      {item.description}
                    </strong>

                    {isIncome ? (
                      <span
                        style={{
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid #10b981",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: "#10b981",
                          fontWeight: 700,
                        }}
                      >
                        📥 Entrada (Consignación)
                      </span>
                    ) : (
                      <>
                        {!isLoan && (
                          <span
                            style={{
                              background: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "rgba(14, 165, 233, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                              border: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "1px solid rgba(14, 165, 233, 0.3)"
                                : "1px solid rgba(239, 68, 68, 0.25)",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              color: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "#38bdf8"
                                : "#f87171",
                              fontWeight: 700,
                            }}
                          >
                            {item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                              ? "💳 Salida (Imputado a Tarjeta)"
                              : "📤 Salida"}
                          </span>
                        )}
                        {item.budgetItemName && (
                          <span
                            style={{
                              background: "rgba(128, 128, 128, 0.1)",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.72rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {item.budgetItemName}
                          </span>
                        )}
                      </>
                    )}

                    {/* Loan Badges */}
                    {isLoan && !isSettled && (
                      <span
                        style={{
                          background: "rgba(245, 158, 11, 0.2)",
                          border: "1px solid #f59e0b",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: "#fcd34d",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        🤝 Préstamo a: {item.loanRecipient || "Amigo"} ({formatMoney(item.loanAmount || item.amount)})
                      </span>
                    )}

                    {isLoan && isSettled && (
                      <span
                        style={{
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid #10b981",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: "#6ee7b7",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        ✔️ Cobrado • Retornado a: {item.settlementDetails?.targetName || "Cuenta"}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>📅 {itemDate || "Fecha no especificada"}</span>
                    {itemTime && (
                      <>
                        <span>•</span>
                        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {itemTime}</span>
                      </>
                    )}
                    <span>•</span>
                    <span style={{ color: sourceColor, fontWeight: 600 }}>
                      {source.targetName || "Nómina"}
                    </span>

                    {/* Option to toggle as loan if not yet marked */}
                    {!isLoan && onToggleExpenseLoan && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            const recipient = window.prompt("¿A quién le prestaste este monto o parte de él?", "Amigo / Familiar");
                            if (recipient !== null) {
                              onToggleExpenseLoan(item.id, true, recipient.trim() || "Amigo/Familiar", item.amount);
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#f59e0b",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 600,
                          }}
                        >
                          🤝 Marcar como Préstamo
                        </button>
                      </>
                    )}

                    {/* Option to reclassify / assign movement */}
                    {!isLoan && (onReclassifyMovement || onConvertExpenseToCardPayment) && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setAssignModalItem(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#0ea5e9",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                          title="Asignar este movimiento a un rubro de presupuesto, deuda personal o tarjeta de crédito"
                        >
                          <span>🏷️</span> Asignar Movimiento
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, textAlign: "right" }}>
                  {/* Mark as Settled Button */}
                  {isLoan && !isSettled && (
                    <button
                      type="button"
                      onClick={() => setSettlingTransaction(item)}
                      style={{
                        background: "rgba(16, 185, 129, 0.18)",
                        border: "1px solid #10b981",
                        color: "#10b981",
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>✅</span> Cobrado
                    </button>
                  )}

                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: isLoan && !isSettled
                        ? "#f59e0b"
                        : isIncome
                        ? "#10b981"
                        : "#f43f5e",
                    }}
                  >
                    {isIncome ? `+${formatMoney(item.amount, currency)}` : `-${formatMoney(item.amount, currency)}`}
                  </span>

                  {onEditTransaction && (
                    <button
                      type="button"
                      onClick={() => onEditTransaction(item)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#38bdf8",
                        cursor: "pointer",
                        padding: "4px",
                        fontSize: "0.85rem",
                      }}
                      title="Editar este gasto o préstamo"
                    >
                      ✏️
                    </button>
                  )}

                  {onDeleteTransaction && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTransaction(item)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#64748b",
                        cursor: "pointer",
                        padding: "4px",
                        fontSize: "0.85rem",
                      }}
                      title="Eliminar este gasto"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loan Settlement Modal */}
      {settlingTransaction && (
        <LoanSettlementModal
          isOpen={Boolean(settlingTransaction)}
          onClose={() => setSettlingTransaction(null)}
          transaction={settlingTransaction}
          currency={currency}
          fxRate={fxRate}
          payrollAccount={payrollAccount}
          creditCards={creditCards}
          fixedIncomeAccounts={fixedIncomeAccounts}
          onConfirmSettlement={onConfirmSettlement}
        />
      )}

      {/* Modal: Asignar o Imputar Movimiento (Rubro, Deuda o Tarjeta) */}
      {assignModalItem && (
        <AssignMovementModal
          isOpen={Boolean(assignModalItem)}
          onClose={() => setAssignModalItem(null)}
          movement={assignModalItem}
          currency={currency}
          formatMoney={formatMoney}
          creditCards={creditCards}
          debts={debts}
          budgetItems={budgetItems}
          fixedIncomeAccounts={fixedIncomeAccounts}
          expensesLog={periodExpenses}
          activePeriod={activePeriod}
          onSaveTransaction={onSaveTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onReclassify={(payload) => {
            if (onReclassifyMovement) {
              onReclassifyMovement(payload);
            } else if (onConvertExpenseToCardPayment && payload.destinationType === "credit_card") {
              onConvertExpenseToCardPayment(payload.movementId, payload.targetId);
            }
          }}
        />
      )}
    </div>
  );
}
