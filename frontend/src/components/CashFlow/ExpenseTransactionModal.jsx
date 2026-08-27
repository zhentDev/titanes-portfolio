import React, { useState, useEffect } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CascadingCategorySelector from "../Common/CascadingCategorySelector";
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

export default function ExpenseTransactionModal({
  isOpen,
  onClose,
  activePeriod,
  currency = "COP",
  budgetItems = [], // Array of needs + wants + wealth budget envelopes
  payrollAccount = { name: "Nu Colombia (Cuenta Nu Débito)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  editTransaction = null,
  onSaveExpenseTransaction,
  onUpdateExpenseTransaction,
}) {
  const currentPeriod = activePeriod || getCurrentPeriod();
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState(budgetItems[0]?.id || "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Loan / Receivable State
  const [isLoan, setIsLoan] = useState(false);
  const [loanRecipient, setLoanRecipient] = useState("");
  const [loanAmount, setLoanAmount] = useState(0);
  const [loanDueDate, setLoanDueDate] = useState("");

  // Payment Source
  const [sourceType, setSourceType] = useState("payroll");
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [cardInstallments, setCardInstallments] = useState(1);
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");

  // Auto-populate default amount and source whenever envelope changes or modal opens
  const handleSelectBudgetItem = (itemId) => {
    setSelectedBudgetItemId(itemId);
    const item = budgetItems.find((b) => b.id === itemId);
    if (item && !editTransaction) {
      setAmount(Number(item.amount) || 0);
      setDescription(item.name || "");

      if (item.paymentSource) {
        setSourceType(item.paymentSource.type || "payroll");
        if (item.paymentSource.targetId) {
          if (item.paymentSource.type === "credit_card") {
            setSelectedCardId(item.paymentSource.targetId);
            if (item.paymentSource.installments) {
              setCardInstallments(item.paymentSource.installments);
            }
          } else if (item.paymentSource.type === "fixed_pocket") {
            setSelectedPocketId(item.paymentSource.targetId);
          }
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (editTransaction) {
        setSelectedBudgetItemId(editTransaction.budgetItemId || budgetItems[0]?.id || "");
        setDescription(editTransaction.description || "");
        setAmount(Number(editTransaction.amount) || 0);
        setDate(editTransaction.date || new Date().toISOString().split("T")[0]);
        setIsLoan(Boolean(editTransaction.isLoan));
        setLoanRecipient(editTransaction.loanRecipient || "");
        setLoanAmount(editTransaction.loanAmount !== undefined && editTransaction.loanAmount !== null ? Number(editTransaction.loanAmount) : Number(editTransaction.amount) || 0);
        setLoanDueDate(editTransaction.loanDueDate || "");

        if (editTransaction.paymentSource) {
          setSourceType(editTransaction.paymentSource.type || "payroll");
          if (editTransaction.paymentSource.targetId) {
            if (editTransaction.paymentSource.type === "credit_card") {
              setSelectedCardId(editTransaction.paymentSource.targetId);
              setCardInstallments(editTransaction.paymentSource.installments || 1);
            } else if (editTransaction.paymentSource.type === "fixed_pocket") {
              setSelectedPocketId(editTransaction.paymentSource.targetId);
            }
          }
        }
      } else if (budgetItems.length > 0) {
        const firstItem = budgetItems.find((b) => b.id === selectedBudgetItemId) || budgetItems[0];
        if (firstItem) {
          setSelectedBudgetItemId(firstItem.id);
          setAmount(Number(firstItem.amount) || 0);
          setDescription(firstItem.name || "");
          setIsLoan(false);
          setLoanRecipient("");
          setLoanAmount(0);
          setLoanDueDate("");
          if (firstItem.paymentSource) {
            setSourceType(firstItem.paymentSource.type || "payroll");
            if (firstItem.paymentSource.targetId) {
              if (firstItem.paymentSource.type === "credit_card") {
                setSelectedCardId(firstItem.paymentSource.targetId);
                if (firstItem.paymentSource.installments) {
                  setCardInstallments(firstItem.paymentSource.installments);
                }
              } else if (firstItem.paymentSource.type === "fixed_pocket") {
                setSelectedPocketId(firstItem.paymentSource.targetId);
              }
            }
          }
        }
      }
    }
  }, [isOpen, editTransaction]);

  const selectedBudgetItem = budgetItems.find((b) => b.id === selectedBudgetItemId) || budgetItems[0];
  const isWealthItem = selectedBudgetItem?.pillarType === "wealth";

  const userPersonalCost = Math.max(0, (Number(amount) || 0) - (isLoan ? (Number(loanAmount) || 0) : 0));

  const buildPaymentSource = () => {
    if (sourceType === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
      return {
        type: "credit_card",
        targetId: card?.id,
        targetName: card ? `${card.name} (${cardInstallments} ${cardInstallments === 1 ? "cuota 0%" : "cuotas"})` : "Tarjeta de Crédito",
        installments: cardInstallments,
      };
    }
    if (sourceType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((a) => a.id === selectedPocketId) || fixedIncomeAccounts[0];
      return {
        type: "fixed_pocket",
        targetId: pocket?.id,
        targetName: pocket ? `${pocket.name}` : "Cajita de Ahorro",
      };
    }
    if (sourceType === "investment_cash") {
      return {
        type: "investment_cash",
        targetName: "Portafolio / Broker",
      };
    }
    return {
      type: "payroll",
      targetName: payrollAccount.name || "Cuenta Nu Débito",
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim() || Number(amount) <= 0) return;

    const txPayload = {
      ...(editTransaction || {}),
      id: editTransaction ? editTransaction.id : `tx_${Date.now()}`,
      period: editTransaction?.period || currentPeriod,
      budgetItemId: selectedBudgetItem?.id,
      budgetItemName: selectedBudgetItem?.name || "Movimiento",
      budgetItemType: selectedBudgetItem?.pillarType || "needs",
      description: description.trim(),
      amount: Number(amount),
      currency,
      date,
      paymentSource: buildPaymentSource(),
      isLoan: Boolean(isLoan),
      loanRecipient: isLoan ? loanRecipient.trim() : null,
      loanAmount: isLoan ? (Number(loanAmount) > 0 ? Number(loanAmount) : Number(amount)) : null,
      loanDueDate: isLoan && loanDueDate ? loanDueDate : null,
      loanStatus: isLoan ? (editTransaction?.loanStatus || "pending") : null,
      createdAt: editTransaction?.createdAt || new Date().toISOString(),
    };

    if (editTransaction && onUpdateExpenseTransaction) {
      onUpdateExpenseTransaction(txPayload);
    } else if (onSaveExpenseTransaction) {
      onSaveExpenseTransaction(txPayload);
    }
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={560}>
      <div style={{ padding: "20px 24px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <h3 className="cashflow-modal-title">
            <span>{editTransaction ? "✏️" : isWealthItem ? "💎" : "💸"}</span>{" "}
            {editTransaction
              ? "Editar Gasto / Préstamo"
              : isWealthItem
              ? "Registrar Aporte a Ahorro / CDT / Inversión"
              : "Registrar Gasto Real Ejecutado"}
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 4, marginBottom: 14 }}>
          {isWealthItem
            ? "Indica de qué cuenta salió la plata para tu CDT, Cajita o inversión (ej. Nómina Nu) para descontarla de tu saldo líquido disponible."
            : "Carga un gasto real consumido a tu sobre presupuestal y elige de qué cuenta o tarjeta salió el dinero."}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Target Budget Envelope */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              Destino / Sobre Presupuestal a Cargar
            </label>
            <CascadingCategorySelector
              budgetItems={budgetItems}
              value={selectedBudgetItemId}
              onChange={(val) => handleSelectBudgetItem(val)}
              currency={currency}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              {isWealthItem ? "Detalle / Nombre de la Inversión o Aporte" : "Detalle / Comercio del Gasto Real"}
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.85rem" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isWealthItem ? "ej. CDT Bancolombia 180 días, Cajita Nu Vacaciones, Acciones..." : "ej. Almuerzo Crepes & Waffles, Compra Éxito, Cine..."}
              required
              autoFocus
            />
          </div>

          {/* Amount & Date */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                {isWealthItem ? `Monto Invertido / Transferido (${currency})` : `Monto Gastado (${currency})`}
              </label>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Fecha del Movimiento
              </label>
              <DynamicDatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Seleccionar fecha..."
              />
            </div>
          </div>

          {/* Loan / Receivable Option */}
          {!isWealthItem && (
            <div
              style={{
                background: isLoan ? "rgba(245, 158, 11, 0.1)" : "rgba(255, 255, 255, 0.025)",
                border: isLoan ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "10px 14px",
                transition: "all 0.15s ease",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: isLoan ? "#fcd34d" : "#cbd5e1" }}>
                <input
                  type="checkbox"
                  checked={isLoan}
                  onChange={(e) => {
                    setIsLoan(e.target.checked);
                    if (e.target.checked && (!loanAmount || loanAmount === 0)) {
                      setLoanAmount(amount);
                    }
                  }}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#f59e0b" }}
                />
                <span>🤝 ¿Es un préstamo o gasto por cobrar (amigos / familia / terceros)?</span>
              </label>

              {isLoan && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(245, 158, 11, 0.2)" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#fcd34d", marginBottom: 4, fontWeight: 600 }}>
                      ¿A quién le prestaste? (Deudor)
                    </label>
                    <input
                      type="text"
                      value={loanRecipient}
                      onChange={(e) => setLoanRecipient(e.target.value)}
                      placeholder="ej. Camilo, Mamá, Compañero..."
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.8)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", padding: "6px 10px", color: "#f8fafc", fontSize: "0.82rem" }}
                      required={isLoan}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#fcd34d", marginBottom: 4, fontWeight: 600 }}>
                      Monto a Cobrar / Prestado ({currency})
                    </label>
                    <CurrencyInput
                      value={loanAmount}
                      onChange={(val) => setLoanAmount(val)}
                      currency={currency}
                      placeholder="Monto prestado"
                    />
                  </div>
                </div>
              )}

              {isLoan && (
                <div
                  style={{
                    marginTop: 10,
                    background: "rgba(0, 0, 0, 0.35)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.76rem",
                  }}
                >
                  <span style={{ color: "#cbd5e1" }}>
                    💰 Tu Consumo Personal Real:
                  </span>
                  <strong style={{ color: userPersonalCost > 0 ? "#38bdf8" : "#10b981", fontFamily: "JetBrains Mono, monospace" }}>
                    {formatMoney(userPersonalCost, currency)}
                    {userPersonalCost === 0 ? " (100% Préstamo - No afecta tu sobre)" : " (Se descuenta de tu sobre)"}
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* Payment Source */}
          <div style={{ background: "rgba(13, 18, 38, 0.6)", padding: "12px 14px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
              🏦 ¿De dónde salió la plata? (Cuenta Origen)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setSourceType("payroll")}
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: sourceType === "payroll" ? "rgba(130, 10, 209, 0.2)" : "rgba(255,255,255,0.04)",
                  border: sourceType === "payroll" ? "1px solid #820ad1" : "1px solid rgba(255,255,255,0.06)",
                  color: sourceType === "payroll" ? "#c084fc" : "#94a3b8",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                🏦 Nómina ({payrollAccount.name?.split(" ")[0] || "Nu"})
              </button>

              <button
                type="button"
                onClick={() => setSourceType("credit_card")}
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: sourceType === "credit_card" ? "rgba(244, 63, 94, 0.2)" : "rgba(255,255,255,0.04)",
                  border: sourceType === "credit_card" ? "1px solid #f43f5e" : "1px solid rgba(255,255,255,0.06)",
                  color: sourceType === "credit_card" ? "#f43f5e" : "#94a3b8",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                💳 Tarjeta de Crédito
              </button>

              <button
                type="button"
                onClick={() => setSourceType("fixed_pocket")}
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: sourceType === "fixed_pocket" ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.04)",
                  border: sourceType === "fixed_pocket" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.06)",
                  color: sourceType === "fixed_pocket" ? "#38bdf8" : "#94a3b8",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                📦 Cajita / Renta Fija
              </button>

              <button
                type="button"
                onClick={() => setSourceType("investment_cash")}
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: sourceType === "investment_cash" ? "rgba(168, 85, 247, 0.2)" : "rgba(255,255,255,0.04)",
                  border: sourceType === "investment_cash" ? "1px solid #a855f7" : "1px solid rgba(255,255,255,0.06)",
                  color: sourceType === "investment_cash" ? "#a855f7" : "#94a3b8",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                🚀 Inversión / Broker
              </button>
            </div>

            {/* Sub-selector for Credit Card */}
            {sourceType === "credit_card" && (
              <div className="cashflow-form-row" style={{ marginTop: 8 }}>
                <div>
                  <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Seleccionar Tarjeta:</label>
                  <select
                    value={selectedCardId}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 8px", color: "#fff", fontSize: "0.78rem" }}
                  >
                    {creditCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Cupo: {formatMoney(c.totalLimit, currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Cuotas:</label>
                  <select
                    value={cardInstallments}
                    onChange={(e) => setCardInstallments(Number(e.target.value))}
                    style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 8px", color: "#fff", fontSize: "0.78rem" }}
                  >
                    <option value={1}>1 Cuota (0% Interés Corriente)</option>
                    <option value={3}>3 Cuotas (MSI / Interés)</option>
                    <option value={6}>6 Cuotas (MSI / Interés)</option>
                    <option value={12}>12 Cuotas (MSI / Interés)</option>
                    <option value={24}>24 Cuotas</option>
                  </select>
                </div>
              </div>
            )}

            {/* Sub-selector for Pockets */}
            {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Cajita / Cuenta de Ahorro:</label>
                <select
                  value={selectedPocketId}
                  onChange={(e) => setSelectedPocketId(e.target.value)}
                  style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 8px", color: "#fff", fontSize: "0.78rem" }}
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

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 10 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={!description.trim() || Number(amount) <= 0}
            >
              {isWealthItem ? "✓ Registrar Aporte / Inversión" : "✓ Registrar Gasto Real"}
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
