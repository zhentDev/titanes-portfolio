import React, { useState } from "react";
import toast from "react-hot-toast";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function PillarBreakdownCard({
  type = "inflow", // 'inflow' | 'needs' | 'wants' | 'wealth'
  title,
  icon = "💼",
  items = [],
  expensesLog = [], // Array of real transactions for active period
  totalInflow = 0,
  targetRatio = 0,
  currency = "COP",
  fxRate = 4150,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteTransaction,
  onEditTransaction,
  onSettleTransaction,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [expandedItemId, setExpandedItemId] = useState(null);

  const totalAmount = items.reduce((acc, curr) => {
    const val = type === "wealth" ? curr.monthlyContribution : curr.amount;
    return acc + (Number(val) || 0);
  }, 0);

  const actualPctOfIncome = totalInflow > 0 ? ((totalAmount / totalInflow) * 100).toFixed(1) : "0.0";
  const targetStrategyAmt = (totalInflow * (targetRatio || 0)) / 100;
  const strategyQuotaDiff = targetStrategyAmt - totalAmount;

  const getPillarColor = () => {
    switch (type) {
      case "inflow":
        return "#10b981";
      case "needs":
        return "#f43f5e";
      case "wants":
        return "#a855f7";
      case "wealth":
        return "#38bdf8";
      default:
        return "#00e5ff";
    }
  };

  const color = getPillarColor();

  const handleAutoSyncedClick = (item) => {
    const moduleName =
      item.linkedModule === "fixed_income" || item.category === "passive_fixed"
        ? "Renta Fija (Cajitas & CDTs)"
        : "Renta Variable / Portafolio ETF";

    toast(
      `💡 Este rendimiento pasivo se calcula automáticamente a partir de tus saldos y tasas en la pestaña de ${moduleName}. Para modificarlo, actualiza tus cuentas allí.`,
      {
        icon: "🔗",
        duration: 4000,
        style: {
          background: "#0f172a",
          color: "#f8fafc",
          border: "1px solid rgba(0, 229, 255, 0.3)",
          fontSize: "0.85rem",
        },
      }
    );
  };

  const toggleExpand = (itemId) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  return (
    <div className={`cashflow-pillar-card ${type}`}>
      {/* Pillar Header */}
      <div className="cashflow-pillar-header">
        <h4 className="cashflow-pillar-title">
          <span>{icon}</span> {title}
        </h4>
        <span className="cashflow-pillar-total" style={{ color }}>
          {formatMoney(totalAmount, currency)}
        </span>
      </div>

      {/* Progress Track vs Income & Strategy Quota */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 6 }}>
          <span style={{ color: "#94a3b8" }}>
            {type === "inflow" ? "Ingresos Activos + Pasivos" : `Asignado del Ingreso`}
          </span>
          <span style={{ fontWeight: 700, color: type === "inflow" ? "#10b981" : color }}>
            {actualPctOfIncome}% {targetRatio > 0 && `(Meta: ${targetRatio}%)`}
          </span>
        </div>
        <div className="cashflow-pillar-progress-track">
          <div
            className="cashflow-pillar-progress-fill"
            style={{
              width: `${Math.min(100, Number(actualPctOfIncome))}%`,
              background: color,
              boxShadow: `0 0 10px ${color}88`,
            }}
          />
        </div>

        {/* Strategy Quota Helper Pill */}
        {targetRatio > 0 && type !== "inflow" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.74rem",
              marginTop: 6,
              background: "rgba(13, 18, 38, 0.6)",
              padding: "4px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <span style={{ color: "#94a3b8" }}>Tope Estrategia: <strong>{formatMoney(targetStrategyAmt, currency)}</strong></span>
            {type === "wealth" ? (
              <span style={{ color: strategyQuotaDiff <= 0 ? "#10b981" : "#fbbf24", fontWeight: 700 }}>
                {strategyQuotaDiff <= 0 ? `🔥 Superávit: +${formatMoney(Math.abs(strategyQuotaDiff), currency)}` : `Faltan: ${formatMoney(strategyQuotaDiff, currency)}`}
              </span>
            ) : (
              <span style={{ color: strategyQuotaDiff >= 0 ? "#10b981" : "#f43f5e", fontWeight: 700 }}>
                {strategyQuotaDiff >= 0 ? `🟢 Cupo Libre: ${formatMoney(strategyQuotaDiff, currency)}` : `⚠️ Excedido por: ${formatMoney(Math.abs(strategyQuotaDiff), currency)}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="cashflow-items-list">
        {items.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
            No hay ítems registrados en este pilar para este mes.
          </div>
        ) : (
          items.map((item) => {
            const itemAmt = type === "wealth" ? item.monthlyContribution : item.amount;
            const itemPctOfPillar = totalAmount > 0 ? ((itemAmt / totalAmount) * 100).toFixed(0) : 0;
            const isZero = Number(itemAmt) === 0;
            const isOneTime = item.isOneTime || item.frequency === "one_time";
            const isAutoSynced = Boolean(
              type === "inflow" &&
              (item.isAutoSynced ||
                item.linkedModule === "fixed_income" ||
                item.linkedModule === "variable_income" ||
                item.category === "passive_fixed" ||
                item.category === "passive_equity")
            );

            // Filter real transactions belonging to this budget envelope
            const itemTransactions = (expensesLog || []).filter(
              (tx) => tx.budgetItemId === item.id || tx.budgetItemName === item.name
            );
            const totalGrossAmount = itemTransactions.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
            const totalLentAmount = itemTransactions.reduce((acc, tx) => {
              if (tx.isLoan) {
                return acc + (Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount));
              }
              return acc;
            }, 0);
            // Gasto Personal Real Imputable al Sobre Presupuestal
            const spentAmount = Math.max(0, totalGrossAmount - totalLentAmount);
            const isOverBudget = type !== "inflow" && spentAmount > Number(itemAmt) && Number(itemAmt) > 0;
            const overspendDelta = spentAmount - Number(itemAmt);
            const remainingBudget = Math.max(0, Number(itemAmt) - spentAmount);
            const budgetUsedPct = Number(itemAmt) > 0 ? ((spentAmount / Number(itemAmt)) * 100).toFixed(0) : 0;

            const isExpanded = expandedItemId === item.id;

            const source = item.paymentSource || {};
            const sourceIcon =
              source.type === "credit_card"
                ? "💳"
                : source.type === "fixed_pocket"
                ? "📦"
                : source.type === "investment_cash"
                ? "🚀"
                : "🏦";

            return (
              <div
                key={item.id}
                style={{
                  background: isOverBudget ? "rgba(244, 63, 94, 0.1)" : "rgba(13, 18, 38, 0.7)",
                  border: isOverBudget ? "1px solid rgba(244, 63, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "14px",
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.2s ease",
                }}
              >
                {/* Main Item Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                  <div className="cashflow-item-left">
                    <span className="cashflow-item-icon">{item.icon || icon}</span>
                    <div className="cashflow-item-name-box">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="cashflow-item-name">
                          {item.name}
                        </span>
                        {isOverBudget && (
                          <span
                            style={{
                              background: "rgba(244, 63, 94, 0.25)",
                              border: "1px solid #f43f5e",
                              color: "#ff6b81",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            ⚠️ Te pasaste por {formatMoney(overspendDelta, currency)}
                          </span>
                        )}
                      </div>

                      <span className="cashflow-item-sub">
                        {isOneTime ? (
                          <span style={{ color: "#00e5ff", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span>⚡ Único ({item.targetPeriod || "Mes"})</span>
                            {item.paymentStatus === "pending" ? (
                              <span style={{ color: "#fbbf24" }}>• ⏳ Pendiente</span>
                            ) : (
                              <span style={{ color: "#10b981" }}>• ✅ Cobrado</span>
                            )}
                          </span>
                        ) : isAutoSynced ? (
                          <span
                            style={{
                              color: "#38bdf8",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              cursor: "pointer",
                            }}
                            onClick={() => handleAutoSyncedClick(item)}
                            title="Clic para más información sobre este cálculo automático"
                          >
                            <span>🔗</span>
                            <span>
                              {item.category === "passive_fixed" || item.linkedModule === "fixed_income"
                                ? "⚡ Renta Fija (Cajitas & CDTs)"
                                : "⚡ Dividendos Titanes Tech ETF"}
                            </span>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {source.targetName && (
                              <span style={{ color: source.type === "credit_card" ? "#f43f5e" : source.type === "fixed_pocket" ? "#38bdf8" : "#94a3b8", fontWeight: 600 }}>
                                {sourceIcon} {source.targetName}
                              </span>
                            )}
                            {item.dueDate ? ` • Vence: ${item.dueDate}` : ""}
                            {item.targetAmount ? ` • Meta: ${formatMoney(item.targetAmount, currency)}` : ""}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="cashflow-item-right">
                    <div style={{ textAlign: "right" }}>
                      <div className="cashflow-item-amount" style={{ color: isZero ? "#64748b" : "#f8fafc" }}>
                        {formatMoney(itemAmt, currency)}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {isZero ? "($0 / Inactivo)" : `${itemPctOfPillar}% del pilar`}
                      </div>
                    </div>

                    {/* If Auto-Synced: Show Protected Link Pill */}
                    {isAutoSynced ? (
                      <button
                        type="button"
                        onClick={() => handleAutoSyncedClick(item)}
                        title="Calculado automáticamente desde tus cuentas en Renta Fija / Portafolio"
                        style={{
                          background: "rgba(56, 189, 248, 0.12)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          borderRadius: "8px",
                          color: "#38bdf8",
                          cursor: "pointer",
                          padding: "4px 8px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>🔗</span>
                        <span>Auto</span>
                      </button>
                    ) : (
                      <>
                        {/* Edit Button */}
                        {onEditItem && (
                          <button
                            type="button"
                            className="cashflow-item-action-btn edit"
                            onClick={() => onEditItem(item, type)}
                            title="Editar tope presupuestado o concepto"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#38bdf8",
                              cursor: "pointer",
                              padding: "5px",
                              fontSize: "0.9rem",
                              borderRadius: "6px",
                            }}
                          >
                            ✏️
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          type="button"
                          className="cashflow-item-delete-btn"
                          onClick={() => onDeleteItem(item.id)}
                          title="Eliminar este ítem"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Real Spending vs. Budget Envelope Track (For Needs & Wants) */}
                {type !== "inflow" && (
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#94a3b8", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
                      <span>
                        Gastado Personal: <strong style={{ color: isOverBudget ? "#f43f5e" : "#f1f5f9" }}>{formatMoney(spentAmount, currency)}</strong>
                      </span>
                      <span>
                        {isOverBudget ? (
                          <strong style={{ color: "#f43f5e" }}>Tope excedido ({budgetUsedPct}%)</strong>
                        ) : (
                          <span style={{ color: "#10b981" }}>Disponible: <strong>{formatMoney(remainingBudget, currency)}</strong> ({100 - budgetUsedPct}%)</span>
                        )}
                      </span>
                    </div>

                    {totalLentAmount > 0 && (
                      <div style={{ fontSize: "0.7rem", color: "#fcd34d", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>🤝</span>
                        <span>
                          <strong>{formatMoney(totalLentAmount, currency)}</strong> en préstamos/deudas por cobrar (no consumen tu cupo personal)
                        </span>
                      </div>
                    )}

                    {/* Progress Bar of Budget Used */}
                    <div className="cashflow-pillar-progress-track" style={{ height: "5px" }}>
                      <div
                        className="cashflow-pillar-progress-fill"
                        style={{
                          width: `${Math.min(100, Number(budgetUsedPct))}%`,
                          background: isOverBudget ? "#f43f5e" : Number(budgetUsedPct) > 80 ? "#fbbf24" : color,
                          boxShadow: isOverBudget ? "0 0 8px rgba(244, 63, 94, 0.8)" : `0 0 6px ${color}66`,
                        }}
                      />
                    </div>

                    {/* Expand/Collapse Transactions Toggle */}
                    {itemTransactions.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            fontSize: "0.74rem",
                            cursor: "pointer",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <span>{isExpanded ? "▲ Ocultar transacciones" : `▼ Ver ${itemTransactions.length} gasto(s) registrado(s)`}</span>
                        </button>

                        {/* List of Transactions */}
                        {isExpanded && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, background: "rgba(0,0,0,0.35)", padding: "8px 10px", borderRadius: "10px" }}>
                            {itemTransactions.map((tx) => {
                              const isLoan = Boolean(tx.isLoan);
                              const loanAmt = isLoan ? (Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount)) : 0;
                              const personalCost = Math.max(0, (Number(tx.amount) || 0) - loanAmt);
                              const isSettled = tx.loanStatus === "settled";

                              return (
                                <div
                                  key={tx.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "0.75rem",
                                    color: "#f8fafc",
                                    background: isLoan
                                      ? isSettled
                                        ? "rgba(16, 185, 129, 0.08)"
                                        : "rgba(245, 158, 11, 0.08)"
                                      : "transparent",
                                    padding: isLoan ? "6px 8px" : "3px 0",
                                    borderRadius: isLoan ? "6px" : "0",
                                    border: isLoan
                                      ? isSettled
                                        ? "1px solid rgba(16, 185, 129, 0.25)"
                                        : "1px solid rgba(245, 158, 11, 0.3)"
                                      : "none",
                                  }}
                                >
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontWeight: 600 }}>{tx.description}</span>
                                      {isLoan && (
                                        <span
                                          style={{
                                            fontSize: "0.68rem",
                                            background: isSettled ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                                            color: isSettled ? "#6ee7b7" : "#fcd34d",
                                            padding: "1px 6px",
                                            borderRadius: "4px",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {isSettled
                                            ? "✔️ Cobrado"
                                            : `🤝 Préstamo: ${formatMoney(loanAmt, currency)} (${tx.loanRecipient || "Amigo"})`}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: 2 }}>
                                      {tx.date || "Fecha"} • {tx.paymentSource?.targetName || "Nómina"}
                                      {isLoan && personalCost > 0 && (
                                        <span style={{ color: "#38bdf8", marginLeft: 6 }}>
                                          • Tu consumo real: <strong>{formatMoney(personalCost, currency)}</strong>
                                        </span>
                                      )}
                                      {isLoan && personalCost === 0 && (
                                        <span style={{ color: "#10b981", marginLeft: 6 }}>
                                          • 100% Préstamo (no afecta tu tope)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <strong style={{ fontFamily: "JetBrains Mono, monospace", color: isLoan && !isSettled ? "#f59e0b" : "#f8fafc" }}>
                                      {formatMoney(tx.amount, currency)}
                                    </strong>

                                    {isLoan && !isSettled && onSettleTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => onSettleTransaction(tx)}
                                        style={{
                                          background: "rgba(16,185,129,0.15)",
                                          border: "1px solid #10b981",
                                          color: "#10b981",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                          fontWeight: 700,
                                        }}
                                        title="Registrar cobro / abono de este préstamo"
                                      >
                                        ✅ Cobrar
                                      </button>
                                    )}

                                    {onEditTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => onEditTransaction(tx)}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#38bdf8",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          padding: "2px",
                                        }}
                                        title="Editar este gasto o préstamo"
                                      >
                                        ✏️
                                      </button>
                                    )}

                                    {onDeleteTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteTransaction(tx.id)}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#64748b",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          padding: "2px",
                                        }}
                                        title="Eliminar este gasto"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add New Item Button */}
      <button
        type="button"
        className="cashflow-add-btn"
        onClick={() => onAddItem(type)}
      >
        <span>+</span> Agregar a {title}
      </button>
    </div>
  );
}
