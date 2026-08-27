import React, { useState, useEffect } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function LoanSettlementModal({
  isOpen,
  onClose,
  transaction,
  currency = "COP",
  fxRate = 4150,
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  onConfirmSettlement,
}) {
  if (!transaction) return null;

  const formatMoney = (val) => formatCashFlowMoney(val, currency, fxRate);

  const baseLoanAmount = Number(transaction.loanAmount) > 0 ? Number(transaction.loanAmount) : Number(transaction.amount) || 0;
  const previousSettlements = Array.isArray(transaction.settlements) ? transaction.settlements : [];
  const alreadySettledTotal = previousSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const currentPendingBalance = Math.max(0, baseLoanAmount - alreadySettledTotal);

  const [settlementAmount, setSettlementAmount] = useState(currentPendingBalance);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split("T")[0]);

  // Destination account for the returned money
  const defaultDestination = transaction.paymentSource?.type === "credit_card" ? "credit_card" : "payroll";
  const [targetType, setTargetType] = useState(defaultDestination);
  const [selectedCardId, setSelectedCardId] = useState(
    transaction.paymentSource?.type === "credit_card" && transaction.paymentSource?.targetId
      ? transaction.paymentSource.targetId
      : creditCards[0]?.id || ""
  );
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (transaction) {
      const base = Number(transaction.loanAmount) > 0 ? Number(transaction.loanAmount) : Number(transaction.amount) || 0;
      const prev = Array.isArray(transaction.settlements) ? transaction.settlements : [];
      const settled = prev.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
      setSettlementAmount(Math.max(0, base - settled));
    }
  }, [transaction]);

  const remainingAfterThis = Math.max(0, currentPendingBalance - (Number(settlementAmount) || 0));
  const isFullSettlement = Number(settlementAmount) >= currentPendingBalance;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (Number(settlementAmount) <= 0) return;

    let targetId = null;
    let targetName = payrollAccount.name || "Cuenta de Nómina";

    if (targetType === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
      targetId = card?.id;
      targetName = card ? card.name : "Tarjeta de Crédito";
    } else if (targetType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((p) => p.id === selectedPocketId) || fixedIncomeAccounts[0];
      targetId = pocket?.id;
      targetName = pocket ? pocket.name : "Cajita de Ahorro";
    } else if (targetType === "investment_cash") {
      targetName = "Portafolio de Inversión / Broker";
    }

    onConfirmSettlement(transaction.id, {
      amount: Number(settlementAmount),
      date: settlementDate,
      targetType,
      targetId,
      targetName,
      recipient: transaction.loanRecipient || "Amigo/Familiar",
      description: transaction.description || "Préstamo",
      note: note.trim(),
      currency,
    });

    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={540}>
      <div style={{ padding: "22px 26px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 14 }}>
          <h3 className="cashflow-modal-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>🎉</span> Registrar Cobro / Abono de Préstamo
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Loan summary card */}
        <div
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "12px",
            padding: "14px 16px",
            marginTop: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fcd34d" }}>
              🤝 Deudor: {transaction.loanRecipient || "Persona / Amigo"}
            </span>
            <span style={{ fontSize: "0.74rem", background: isFullSettlement ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)", color: isFullSettlement ? "#6ee7b7" : "#fcd34d", padding: "2px 8px", borderRadius: "6px", fontWeight: 700 }}>
              {isFullSettlement ? "Liquidación Total" : "Abono / Liquidación Parcial"}
            </span>
          </div>

          <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
            Concepto: <strong>{transaction.description}</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(245, 158, 11, 0.18)", fontSize: "0.76rem" }}>
            <div>
              <span style={{ color: "#94a3b8" }}>Total prestado original: </span>
              <strong style={{ color: "#f8fafc" }}>{formatMoney(baseLoanAmount)}</strong>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>Saldo pendiente actual: </span>
              <strong style={{ color: "#fcd34d" }}>{formatMoney(currentPendingBalance)}</strong>
            </div>
          </div>

          {previousSettlements.length > 0 && (
            <div style={{ marginTop: 8, fontSize: "0.72rem", color: "#6ee7b7" }}>
              ✓ Ya se han recibido {previousSettlements.length} abono(s) por un total de {formatMoney(alreadySettledTotal)}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Amount and Date */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Monto Recibido en este Abono ({currency})
              </label>
              <CurrencyInput
                value={settlementAmount}
                onChange={(val) => setSettlementAmount(val)}
                currency={currency}
                placeholder="Monto a cobrar"
                autoFocus
              />
              {!isFullSettlement && Number(settlementAmount) > 0 && (
                <span style={{ display: "block", fontSize: "0.7rem", color: "#fcd34d", marginTop: 4 }}>
                  ⏳ Quedará un saldo restante por cobrar de: <strong>{formatMoney(remainingAfterThis)}</strong>
                </span>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Fecha en que te pagaron
              </label>
              <DynamicDatePicker
                value={settlementDate}
                onChange={(d) => setSettlementDate(d)}
                placeholder="Fecha de recepción..."
              />
            </div>
          </div>

          {/* Destination Selector: Where did the money return to? */}
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#f8fafc", marginBottom: 8, fontWeight: 700 }}>
              ¿A qué cuenta retornó este dinero?
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* Option 1: Nómina */}
              <div
                onClick={() => setTargetType("payroll")}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: targetType === "payroll" ? "rgba(130, 10, 209, 0.25)" : "rgba(255, 255, 255, 0.03)",
                  border: targetType === "payroll" ? "1.5px solid #a855f7" : "1px solid rgba(255, 255, 255, 0.08)",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.82rem", color: targetType === "payroll" ? "#d8b4fe" : "#e2e8f0" }}>
                  <span>💼</span> Cuenta de Nómina
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 4 }}>
                  {payrollAccount.name?.split(" ")[0] || "Nu"} • Vuelve a tu liquidez libre
                </div>
              </div>

              {/* Option 2: Tarjeta de Crédito */}
              <div
                onClick={() => setTargetType("credit_card")}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: targetType === "credit_card" ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.03)",
                  border: targetType === "credit_card" ? "1.5px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.82rem", color: targetType === "credit_card" ? "#6ee7b7" : "#e2e8f0" }}>
                  <span>💳</span> Abono a Tarjeta
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 4 }}>
                  Paga deuda y libera cupo
                </div>
              </div>

              {/* Option 3: Cajitas de Ahorro / CDTs */}
              <div
                onClick={() => setTargetType("fixed_pocket")}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: targetType === "fixed_pocket" ? "rgba(0, 229, 255, 0.22)" : "rgba(255, 255, 255, 0.03)",
                  border: targetType === "fixed_pocket" ? "1.5px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.08)",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.82rem", color: targetType === "fixed_pocket" ? "#00e5ff" : "#e2e8f0" }}>
                  <span>🏦</span> Ahorro / CDT / Cajita
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 4 }}>
                  Depositar en fondo de ahorro
                </div>
              </div>

              {/* Option 4: Inversiones */}
              <div
                onClick={() => setTargetType("investment_cash")}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: targetType === "investment_cash" ? "rgba(234, 179, 8, 0.22)" : "rgba(255, 255, 255, 0.03)",
                  border: targetType === "investment_cash" ? "1.5px solid #eab308" : "1px solid rgba(255, 255, 255, 0.08)",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.82rem", color: targetType === "investment_cash" ? "#fde047" : "#e2e8f0" }}>
                  <span>📈</span> Inversiones / Bolsa
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 4 }}>
                  Portafolio Titanes / Broker
                </div>
              </div>
            </div>
          </div>

          {/* Sub-select for Credit Card */}
          {targetType === "credit_card" && (
            <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px", padding: "10px 14px" }}>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#6ee7b7", marginBottom: 5, fontWeight: 700 }}>
                Selecciona la Tarjeta a la que entra el abono (Reduce deuda & libera cupo):
              </label>
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                style={{ width: "100%", background: "rgba(13, 18, 38, 0.8)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.84rem" }}
              >
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Cupo Usado: {formatMoney(c.usedLimit || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sub-select for Fixed Pocket */}
          {targetType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
            <div style={{ background: "rgba(0, 229, 255, 0.08)", border: "1px solid rgba(0, 229, 255, 0.25)", borderRadius: "8px", padding: "10px 14px" }}>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#00e5ff", marginBottom: 5, fontWeight: 700 }}>
                Selecciona la Cajita / Cuenta de Ahorro destino:
              </label>
              <select
                value={selectedPocketId}
                onChange={(e) => setSelectedPocketId(e.target.value)}
                style={{ width: "100%", background: "rgba(13, 18, 38, 0.8)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.84rem" }}
              >
                {fixedIncomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.entityName || "Renta Fija"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Note */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
              Nota / Detalle adicional (Opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ej. Abono de $200k por Nequi / Transferencia..."
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.82rem" }}
            />
          </div>

          {/* Modal Actions */}
          <div className="cashflow-modal-actions" style={{ marginTop: 6 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                border: "none",
                fontWeight: 700,
                color: "#ffffff",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)",
              }}
            >
              <span>✅</span> Confirmar Retorno de Fondos ({formatMoney(settlementAmount)})
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
