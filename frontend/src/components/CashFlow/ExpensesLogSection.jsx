import React, { useState, useMemo } from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import LoanSettlementModal from "./LoanSettlementModal";
import "./CashFlow.css";

export default function ExpensesLogSection({
  expensesLog = [],
  creditCardPayments = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  onOpenExpenseModal,
  onEditTransaction,
  onOpenPaymentModal,
  onDeleteTransaction,
  onDeletePayment,
  onConfirmSettlement,
  onToggleExpenseLoan,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [filterSource, setFilterSource] = useState("all");
  const [settlingTransaction, setSettlingTransaction] = useState(null);

  const periodExpenses = useMemo(() => {
    return (expensesLog || [])
      .filter((tx) => !tx.period || tx.period === activePeriod)
      .map((tx) => ({
        ...tx,
        itemType: tx.budgetItemType === "wealth" || tx.budgetItemId?.startsWith("wealth_") ? "wealth_saving" : "expense",
      }));
  }, [expensesLog, activePeriod]);

  const periodPayments = useMemo(() => {
    return (creditCardPayments || [])
      .filter((p) => !p.period || p.period === activePeriod)
      .map((p) => ({
        ...p,
        itemType: "card_payment",
      }));
  }, [creditCardPayments, activePeriod]);

  // Combined sorted activity feed
  const combinedActivities = useMemo(() => {
    const combined = [...periodExpenses, ...periodPayments];
    return combined.sort((a, b) => {
      const dateA = a.date || a.createdAt || "";
      const dateB = b.date || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
  }, [periodExpenses, periodPayments]);

  const pendingLoans = useMemo(() => {
    return periodExpenses.filter((tx) => tx.isLoan && tx.loanStatus !== "settled");
  }, [periodExpenses]);

  const totalPendingLoansAmt = useMemo(() => {
    return pendingLoans.reduce((acc, tx) => acc + (Number(tx.loanAmount) || Number(tx.amount) || 0), 0);
  }, [pendingLoans]);

  const filteredActivities = useMemo(() => {
    if (filterSource === "all") return combinedActivities;
    if (filterSource === "only_loans") return combinedActivities.filter((i) => i.isLoan);
    if (filterSource === "only_expenses") return combinedActivities.filter((i) => i.itemType === "expense" && !i.isLoan);
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

  const totalSpentInPeriod = periodExpenses
    .filter((tx) => tx.itemType === "expense")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalSavedInPeriod = periodExpenses
    .filter((tx) => tx.itemType === "wealth_saving")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalPaidToCards = periodPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  return (
    <div
      style={{
        background: "rgba(17, 24, 41, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "20px",
        padding: "24px 28px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 10px 32px rgba(0, 0, 0, 0.35)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", display: "flex", alignItems: "center", gap: 10 }}>
            <span>📋</span> Historial de Gastos Reales, Ahorro & Abonos ({activePeriod})
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
            Transacciones de nómina: gastos de vida, transferencias a CDTs/cajitas y abonos de deuda de tarjetas.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block" }}>Total Gastado Real</span>
              <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: "#f43f5e" }}>
                {formatMoney(totalSpentInPeriod, currency)}
              </strong>
            </div>

            {totalPendingLoansAmt > 0 && (
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#fcd34d", display: "block" }}>🤝 Préstamos por Cobrar</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: "#f59e0b" }}>
                  {formatMoney(totalPendingLoansAmt, currency)}
                </strong>
              </div>
            )}

            {totalSavedInPeriod > 0 && (
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block" }}>Aporte a CDTs / Ahorro</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: "#38bdf8" }}>
                  {formatMoney(totalSavedInPeriod, currency)}
                </strong>
              </div>
            )}

            {totalPaidToCards > 0 && (
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block" }}>Abonos a Tarjetas</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: "#10b981" }}>
                  {formatMoney(totalPaidToCards, currency)}
                </strong>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
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
          { id: "all", label: "Todos los Movimientos" },
          { id: "only_loans", label: `🤝 Préstamos por Cobrar ${pendingLoans.length > 0 ? `(${pendingLoans.length})` : ""}` },
          { id: "only_expenses", label: "💸 Gastos Reales" },
          { id: "only_wealth", label: "💎 Aportes CDTs/Ahorro" },
          { id: "only_payments", label: "💵 Abonos a Tarjetas" },
          { id: "payroll", label: "🏦 Nómina" },
          { id: "credit_card", label: "💳 Tarjeta de Crédito" },
          { id: "fixed_pocket", label: "📦 Cajitas / Renta Fija" },
          { id: "investment_cash", label: "🚀 Broker" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterSource(f.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: filterSource === f.id ? "1px solid #00e5ff" : "1px solid rgba(255,255,255,0.06)",
              background: filterSource === f.id ? "rgba(0, 229, 255, 0.15)" : "rgba(13, 18, 38, 0.6)",
              color: filterSource === f.id ? "#00e5ff" : "#94a3b8",
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
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1rem" }}>💵</span>
                      <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
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
                    </div>

                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{item.date || "Fecha no especificada"}</span>
                      <span>•</span>
                      <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                        Pagado desde: {item.sourceAccount || "Nómina Nu"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: "#10b981" }}>
                      -{formatMoney(item.amount, currency)}
                    </span>
                    {onDeletePayment && (
                      <button
                        type="button"
                        onClick={() => onDeletePayment(item.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#64748b",
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
              );
            }

            if (isWealth) {
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1rem" }}>💎</span>
                      <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                        {item.description}
                      </strong>
                      <span
                        style={{
                          background: "rgba(56, 189, 248, 0.18)",
                          border: "1px solid #38bdf8",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: "#38bdf8",
                          fontWeight: 700,
                        }}
                      >
                        {item.budgetItemName} • Inversión / Ahorro
                      </span>
                    </div>

                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{item.date || "Fecha no especificada"}</span>
                      <span>•</span>
                      <span style={{ color: "#c084fc", fontWeight: 600 }}>
                        Descontado de: {item.paymentSource?.targetName || "Nómina Nu"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: "#38bdf8" }}>
                      {formatMoney(item.amount, currency)}
                    </span>
                    {onDeleteTransaction && (
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(item.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: "4px",
                          fontSize: "0.85rem",
                        }}
                        title="Eliminar este aporte"
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
                    : "rgba(13, 18, 38, 0.65)",
                  border: isLoan
                    ? isSettled
                      ? "1px solid rgba(16, 185, 129, 0.35)"
                      : "1px solid rgba(245, 158, 11, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                      {item.description}
                    </strong>

                    <span
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        color: "#94a3b8",
                      }}
                    >
                      {item.budgetItemName}
                    </span>

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
                    <span>{item.date || "Fecha no especificada"}</span>
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
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: isLoan && !isSettled ? "#f59e0b" : "#f8fafc" }}>
                    {formatMoney(item.amount, currency)}
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
                      onClick={() => onDeleteTransaction(item.id)}
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
    </div>
  );
}
