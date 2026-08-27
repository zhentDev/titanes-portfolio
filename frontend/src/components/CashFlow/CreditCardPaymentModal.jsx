import React, { useState } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { getCurrentPeriod } from "../../utils/periodUtils";
import "./CashFlow.css";

function formatMoney(val, currency = "COP") {
  const num = Number(val) || 0;
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

export default function CreditCardPaymentModal({
  isOpen,
  onClose,
  activePeriod,
  currency = "COP",
  creditCards = [],
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  fixedIncomeAccounts = [],
  onSavePayment,
}) {
  const currentPeriod = activePeriod || getCurrentPeriod();
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [amount, setAmount] = useState(0);
  const [sourceType, setSourceType] = useState("payroll");
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("Pago mensual factura tarjeta");

  const selectedCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
  const usedLimit = Number(selectedCard?.usedLimit) || 0;
  const newUsedLimit = Math.max(0, usedLimit - Number(amount));
  const newAvailable = Math.max(0, (Number(selectedCard?.totalLimit) || 0) - newUsedLimit);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedCard || Number(amount) <= 0) return;

    let sourceName = payrollAccount.name || "Cuenta Nu Débito";
    if (sourceType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((a) => a.id === selectedPocketId);
      sourceName = pocket ? pocket.name : "Cajita de Ahorro";
    }

    const paymentData = {
      id: `pay_${Date.now()}`,
      cardId: selectedCard.id,
      cardName: selectedCard.name,
      amount: Number(amount),
      currency,
      date,
      period: currentPeriod,
      sourceType,
      sourceAccount: sourceName,
      description: description.trim(),
      createdAt: new Date().toISOString(),
    };

    onSavePayment(paymentData);
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={540}>
      <div style={{ padding: "22px 26px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 14 }}>
          <h3 className="cashflow-modal-title">
            <span>💵</span> Pagar / Abonar a Tarjeta de Crédito
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: 6, marginBottom: 16 }}>
          Registra el pago de tu factura o un abono a capital. El monto pagado liberará cupo disponible inmediatamente.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Select Target Credit Card */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
              Tarjeta de Crédito a Pagar
            </label>
            <select
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              style={{ width: "100%", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "10px 14px", color: "#f8fafc", fontSize: "0.9rem", fontWeight: 600 }}
            >
              {creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} (Cupo Usado Actual: {formatMoney(card.usedLimit || 0, currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Monto a Pagar / Abonar ({currency})
              </label>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Fecha del Pago
              </label>
              <DynamicDatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Seleccionar fecha..."
              />
            </div>
          </div>

          {/* Funding Source */}
          <div style={{ background: "rgba(13, 18, 38, 0.65)", padding: "12px 16px", borderRadius: "14px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 8, fontWeight: 700 }}>
              🏦 Cuenta de Origen del Pago
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setSourceType("payroll")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: sourceType === "payroll" ? "rgba(130, 10, 209, 0.2)" : "rgba(255,255,255,0.04)",
                  border: sourceType === "payroll" ? "1px solid #820ad1" : "1px solid rgba(255,255,255,0.08)",
                  color: sourceType === "payroll" ? "#c084fc" : "#94a3b8",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🏦 {payrollAccount.name || "Nómina Nu"}
              </button>

              {fixedIncomeAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSourceType("fixed_pocket")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: sourceType === "fixed_pocket" ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.04)",
                    border: sourceType === "fixed_pocket" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                    color: sourceType === "fixed_pocket" ? "#38bdf8" : "#94a3b8",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  📦 Cajita de Ahorro / Renta Fija
                </button>
              )}
            </div>

            {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <select
                  value={selectedPocketId}
                  onChange={(e) => setSelectedPocketId(e.target.value)}
                  style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 10px", color: "#fff", fontSize: "0.82rem" }}
                >
                  {fixedIncomeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${Math.round(acc.balance || 0).toLocaleString("es-CO")} COP)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
              Nota / Concepto
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.85rem" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej. Pago total del mes, abono a capital..."
            />
          </div>

          {/* Live Preview of Quota Liberation */}
          {Number(amount) > 0 && selectedCard && (
            <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "12px", padding: "12px 16px" }}>
              <div style={{ fontSize: "0.76rem", color: "#10b981", fontWeight: 700, marginBottom: 4 }}>
                ✨ Impacto del Pago en tu Cupo:
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#f1f5f9" }}>
                <span>Cupo Usado: <strong style={{ color: "#f43f5e" }}>{formatMoney(usedLimit, currency)}</strong> ➔ <strong style={{ color: "#10b981" }}>{formatMoney(newUsedLimit, currency)}</strong></span>
                <span>Cupo Libre: <strong style={{ color: "#10b981" }}>{formatMoney(newAvailable, currency)}</strong></span>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 8 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={Number(amount) <= 0}
            >
              ✓ Registrar Pago & Liberar Cupo
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
