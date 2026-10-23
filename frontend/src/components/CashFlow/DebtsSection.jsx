import React, { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function DebtsSection({
  debts = [],
  onOpenDebtModal,
  onOpenPaymentModal,
  onDeleteDebt,
  fixedIncomeAccounts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [expandedDebtIds, setExpandedDebtIds] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState("active"); // 'active' | 'all' | 'paid'

  const toggleExpand = (id) => {
    setExpandedDebtIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredDebts = debts.filter((d) => {
    if (filterStatus === "active") return d.status !== "paid" && (d.remainingAmount || 0) > 0;
    if (filterStatus === "paid") return d.status === "paid" || (d.remainingAmount || 0) <= 0;
    return true;
  });

  const totalInitial = debts.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
  const totalRemaining = debts.reduce((sum, d) => sum + (Number(d.remainingAmount !== undefined ? d.remainingAmount : d.totalAmount) || 0), 0);
  const totalPaid = Math.max(0, totalInitial - totalRemaining);
  const overallProgress = totalInitial > 0 ? ((totalPaid / totalInitial) * 100).toFixed(0) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI Summary Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: isLight ? "1px solid rgba(244, 63, 94, 0.25)" : "1px solid rgba(244, 63, 94, 0.3)",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            Saldo Pendiente por Pagar
          </span>
          <span className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: totalRemaining > 0 ? "#f43f5e" : "#10b981" }}>
            ${totalRemaining.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            {debts.filter(d => (d.remainingAmount || 0) > 0).length} deuda(s) activa(s)
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: isLight ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            Total Pagado / Amortizado
          </span>
          <span className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10b981" }}>
            +${totalPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "#10b981", marginTop: 2, fontWeight: 600 }}>
            {overallProgress}% del capital total amortizado
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            Monto Total Inicial de Deudas
          </span>
          <span className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
            ${totalInitial.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            Total histórico registrado
          </div>
        </div>
      </div>

      {/* Filter and Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setFilterStatus("active")}
            style={{
              background: filterStatus === "active" ? (isLight ? "rgba(244, 63, 94, 0.15)" : "rgba(244, 63, 94, 0.25)") : "var(--bg-surface)",
              border: filterStatus === "active" ? "1.5px solid #f43f5e" : "1px solid var(--border)",
              color: filterStatus === "active" ? (isLight ? "#be123c" : "#fb7185") : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🔴 Activas ({debts.filter(d => (d.remainingAmount || 0) > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            style={{
              background: filterStatus === "all" ? (isLight ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.25)") : "var(--bg-surface)",
              border: filterStatus === "all" ? "1.5px solid #3b82f6" : "1px solid var(--border)",
              color: filterStatus === "all" ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Todas ({debts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("paid")}
            style={{
              background: filterStatus === "paid" ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)") : "var(--bg-surface)",
              border: filterStatus === "paid" ? "1.5px solid #10b981" : "1px solid var(--border)",
              color: filterStatus === "paid" ? (isLight ? "#047857" : "#34d399") : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🟢 Liquidadas ({debts.filter(d => (d.remainingAmount || 0) <= 0).length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenDebtModal(null)}
          style={{
            background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: "0.8rem",
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(244, 63, 94, 0.25)",
          }}
        >
          <span>+</span>
          <span>Nueva Deuda / Compromiso</span>
        </button>
      </div>

      {/* Debts List */}
      {filteredDebts.length === 0 ? (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}>🎉</span>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1rem" }}>
            {filterStatus === "active" ? "¡No tienes deudas activas pendientes!" : "No hay deudas en esta vista"}
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 440, margin: "6px auto 14px" }}>
            Registra préstamos personales (ej. con mamá o familiares), créditos o compromisos especificando obligatoriamente su concepto y cómo los pagas.
          </p>
          <button
            type="button"
            onClick={() => onOpenDebtModal(null)}
            style={{
              background: "rgba(244, 63, 94, 0.15)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              color: isLight ? "#be123c" : "#fb7185",
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Registrar mi primera deuda
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredDebts.map((debt) => {
            const isExpanded = expandedDebtIds.has(debt.id);
            const initialAmt = Number(debt.totalAmount || 0);
            const remainingAmt = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);
            const paidAmt = Math.max(0, initialAmt - remainingAmt);
            const progress = initialAmt > 0 ? Math.min(100, Math.round((paidAmt / initialAmt) * 100)) : 100;
            const isPaid = remainingAmt <= 0;

            const matchedSource = fixedIncomeAccounts.find((a) => a.id === debt.paymentSourceId);

            return (
              <div
                key={debt.id}
                style={{
                  background: "var(--bg-surface)",
                  borderRadius: 12,
                  border: isPaid
                    ? (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.25)")
                    : (isLight ? "1px solid rgba(244, 63, 94, 0.25)" : "1px solid rgba(244, 63, 94, 0.3)"),
                  overflow: "hidden",
                  transition: "all 0.18s ease",
                }}
              >
                {/* Main Card Row */}
                <div
                  style={{
                    padding: "14px 18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 14,
                  }}
                >
                  {/* Left: Concept + Creditor + Payment Method */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, flex: "1 1 280px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        {debt.concept}
                      </span>
                      {isPaid ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            padding: "2px 7px",
                            borderRadius: 6,
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                          }}
                        >
                          🟢 PAGADA
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            background: "rgba(244, 63, 94, 0.15)",
                            color: isLight ? "#be123c" : "#fb7185",
                            padding: "2px 7px",
                            borderRadius: 6,
                            border: "1px solid rgba(244, 63, 94, 0.35)",
                          }}
                        >
                          🔴 ACTIVA
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      <span>
                        👤 Acreedor: <strong>{debt.creditor}</strong>
                      </span>
                      <span>•</span>
                      <span
                        style={{
                          background: isLight ? "rgba(244, 63, 94, 0.08)" : "rgba(244, 63, 94, 0.15)",
                          color: isLight ? "#be123c" : "#fb7185",
                          padding: "2px 6px",
                          borderRadius: 5,
                          fontWeight: 700,
                          fontSize: "0.7rem",
                          border: `1px solid ${isLight ? "rgba(244, 63, 94, 0.2)" : "rgba(244, 63, 94, 0.3)"}`,
                        }}
                        title="Cómo se paga esta deuda"
                      >
                        🔄 {debt.paymentMethod} {matchedSource ? `(${matchedSource.name})` : ""}
                      </span>
                      {debt.installmentAmount > 0 && (
                        <>
                          <span>•</span>
                          <span>Cuota: <strong>${Number(debt.installmentAmount).toLocaleString()} {currency}</strong> ({debt.paymentFrequency === "monthly" ? "Mensual" : debt.paymentFrequency})</span>
                        </>
                      )}
                      {debt.nextPaymentDate && !isPaid && (
                        <>
                          <span>•</span>
                          <span style={{ color: isLight ? "#b45309" : "#fbbf24", fontWeight: 700 }}>
                            🗓️ Próx. {debt.nextPaymentDate}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: 4, maxWidth: 380 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 2 }}>
                        <span>Amortizado: ${paidAmt.toLocaleString()} ({progress}%)</span>
                        <span>Total: ${initialAmt.toLocaleString()}</span>
                      </div>
                      <div style={{ width: "100%", height: 6, background: "var(--bg-card)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div
                          style={{
                            width: `${progress}%`,
                            height: "100%",
                            background: isPaid ? "#10b981" : "linear-gradient(90deg, #f43f5e, #fb7185)",
                            borderRadius: 3,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: Balances & Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        Saldo Pendiente
                      </span>
                      <span className="mono" style={{ fontSize: "1.15rem", fontWeight: 800, color: isPaid ? "#10b981" : "#f43f5e" }}>
                        ${remainingAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{currency}</span>
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => onOpenPaymentModal(debt)}
                          style={{
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.45)",
                            color: "#10b981",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                          title="Registrar un abono o pago total a esta deuda"
                        >
                          <span>💰</span>
                          <span>Abonar</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(debt.id)}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          padding: "6px 9px",
                          borderRadius: 8,
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="Ver historial de abonos y notas"
                      >
                        {isExpanded ? "▲" : "▼"} {debt.paymentsLog?.length > 0 ? `(${debt.paymentsLog.length})` : ""}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenDebtModal(debt)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          padding: "4px",
                        }}
                        title="Editar Deuda"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Seguro que deseas eliminar la deuda "${debt.concept}"?`)) {
                            onDeleteDebt(debt.id);
                          }
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          padding: "4px",
                        }}
                        title="Eliminar Deuda"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Section: Payments Log & Notes */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      padding: "12px 18px",
                      background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.015)",
                    }}
                  >
                    {debt.notes && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 10, fontStyle: "italic" }}>
                        💬 Notas: {debt.notes}
                      </div>
                    )}

                    <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                      Historial de Abonos Realizados:
                    </div>

                    {!debt.paymentsLog || debt.paymentsLog.length === 0 ? (
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        No se han registrado abonos todavía para esta deuda.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {debt.paymentsLog.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "var(--bg-surface)",
                              padding: "6px 12px",
                              borderRadius: 6,
                              fontSize: "0.74rem",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#10b981", fontWeight: 700 }}>+{formatCashFlowMoney(p.amount, currency, fxRate)}</span>
                              <span style={{ color: "var(--text-muted)" }}>• {p.date}</span>
                              <span style={{ color: "var(--text-secondary)" }}>({p.paymentMethod || "Abono"})</span>
                              {p.note && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>"{p.note}"</span>}
                            </div>
                            <span style={{ color: "#10b981", fontSize: "0.68rem", fontWeight: 700 }}>✓ Aplicado</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
