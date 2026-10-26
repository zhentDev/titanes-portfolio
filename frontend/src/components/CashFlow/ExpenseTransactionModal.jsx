import React, { useState, useEffect } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CascadingCategorySelector from "../Common/CascadingCategorySelector";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { useTheme } from "../../context/ThemeContext";
import { getCurrentPeriod } from "../../utils/periodUtils";
import "./CashFlow.css";

function formatMoney(val, currency = "COP") {
  const num = Number(val) || 0;
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

const INCOME_CATEGORIES = [
  { id: "salary", label: "💼 Salario / Nómina", defaultDesc: "Consignación Nómina" },
  { id: "transfer", label: "📥 Transferencia Recibida (Rappi, Nu, Nequi...)", defaultDesc: "Transferencia recibida" },
  { id: "freelance", label: "💻 Honorarios / Freelance / Servicios", defaultDesc: "Pago de servicios" },
  { id: "yield", label: "📈 Rendimientos / Intereses / Dividendos", defaultDesc: "Rendimientos financieros" },
  { id: "refund", label: "🎁 Devolución / Reembolso / Otro", defaultDesc: "Abono / Reembolso" },
];

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
  const { theme } = useTheme();
  const isLight = theme === "light";
  const currentPeriod = activePeriod || getCurrentPeriod();

  // Mode: "expense" (salida) vs "income" (entrada)
  const [movementNature, setMovementNature] = useState("expense");

  // Income Fields
  const [incomeCategory, setIncomeCategory] = useState("transfer");
  const [incomeTargetAccountId, setIncomeTargetAccountId] = useState(
    fixedIncomeAccounts[0]?.id || "payroll"
  );

  // Common Fields
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState(budgetItems[0]?.id || "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState(
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );

  // Loan / Receivable State (Expenses only)
  const [isLoan, setIsLoan] = useState(false);
  const [loanRecipient, setLoanRecipient] = useState("");
  const [loanAmount, setLoanAmount] = useState(0);
  const [loanDueDate, setLoanDueDate] = useState("");

  // Payment Source (Expenses only)
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
        const isTxIncome =
          editTransaction.type === "credit" ||
          editTransaction.budgetItemType === "income";

        setMovementNature(isTxIncome ? "income" : "expense");
        setSelectedBudgetItemId(editTransaction.budgetItemId || budgetItems[0]?.id || "");
        setDescription(editTransaction.description || "");
        setAmount(Number(editTransaction.amount) || 0);
        setDate(editTransaction.date || new Date().toISOString().split("T")[0]);
        setTime(
          editTransaction.time ||
          (editTransaction.createdAt ? editTransaction.createdAt.slice(11, 16) : new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))
        );
        setIsLoan(Boolean(editTransaction.isLoan));
        setLoanRecipient(editTransaction.loanRecipient || "");
        setLoanAmount(
          editTransaction.loanAmount !== undefined && editTransaction.loanAmount !== null
            ? Number(editTransaction.loanAmount)
            : Number(editTransaction.amount) || 0
        );
        setLoanDueDate(editTransaction.loanDueDate || "");

        if (isTxIncome) {
          const matchedTarget =
            editTransaction.paymentSource?.targetId ||
            editTransaction.destinationAccountId ||
            "payroll";
          setIncomeTargetAccountId(matchedTarget);
        } else if (editTransaction.paymentSource) {
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
      } else {
        setMovementNature("expense");
        setIncomeCategory("transfer");
        setIncomeTargetAccountId(
          fixedIncomeAccounts.find((a) => a.id === "acc_rappi_principal")?.id ||
          fixedIncomeAccounts[0]?.id ||
          "payroll"
        );
        setIsLoan(false);
        setLoanRecipient("");
        setLoanAmount(0);
        setLoanDueDate("");
        if (budgetItems.length > 0) {
          const firstItem = budgetItems.find((b) => b.id === selectedBudgetItemId) || budgetItems[0];
          if (firstItem) {
            setSelectedBudgetItemId(firstItem.id);
            setAmount(Number(firstItem.amount) || 0);
            setDescription(firstItem.name || "");
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
    }
  }, [isOpen, editTransaction]);

  const selectedBudgetItem = budgetItems.find((b) => b.id === selectedBudgetItemId) || budgetItems[0];
  const isWealthItem = selectedBudgetItem?.pillarType === "wealth";

  const userPersonalCost = Math.max(
    0,
    (Number(amount) || 0) - (isLoan ? Number(loanAmount) || 0 : 0)
  );

  const buildPaymentSource = () => {
    if (sourceType === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
      return {
        type: "credit_card",
        targetId: card?.id,
        targetName: card
          ? `${card.name} (${cardInstallments} ${cardInstallments === 1 ? "cuota 0%" : "cuotas 0% MSI"})`
          : "Tarjeta de Crédito",
        installments: cardInstallments,
      };
    }
    if (sourceType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((a) => a.id === selectedPocketId) || fixedIncomeAccounts[0];
      return {
        type: "fixed_pocket",
        targetId: pocket?.id,
        targetName: pocket ? `${pocket.name}` : "Cuenta de Ahorro",
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

  const handleIncomeCategoryChange = (catId) => {
    setIncomeCategory(catId);
    const catObj = INCOME_CATEGORIES.find((c) => c.id === catId);
    if (catObj && (!description || INCOME_CATEGORIES.some((c) => c.defaultDesc === description))) {
      setDescription(catObj.defaultDesc);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim() || Number(amount) <= 0) return;

    if (movementNature === "income") {
      // 📥 INCOMING MONEY (Income / Abono)
      const isTargetPayroll = incomeTargetAccountId === "payroll";
      const targetAcc = isTargetPayroll
        ? { id: "acc_nu_debito", name: payrollAccount.name || "Nu Colombia (Cuenta Nu Débito)" }
        : fixedIncomeAccounts.find((a) => a.id === incomeTargetAccountId) || {
            id: incomeTargetAccountId,
            name: "Cuenta de Ahorro",
          };

      const selectedCatObj = INCOME_CATEGORIES.find((c) => c.id === incomeCategory);

      const incomePayload = {
        ...(editTransaction || {}),
        id: editTransaction ? editTransaction.id : `cf_tx_in_${Date.now()}`,
        period: editTransaction?.period || currentPeriod,
        budgetItemId: null,
        budgetItemName: `Ingreso: ${selectedCatObj?.label?.split(" ")[1] || "Transferencia"}`,
        budgetItemType: "income",
        description: description.trim(),
        amount: Number(amount),
        currency,
        date,
        time: time ? (time.length === 5 ? `${time}:00` : time) : null,
        type: "credit",
        paymentSource: {
          type: isTargetPayroll ? "payroll" : "fixed_pocket",
          targetId: targetAcc.id,
          targetName: targetAcc.name,
        },
        destinationAccountId: targetAcc.id,
        destinationAccountName: targetAcc.name,
        createdAt: editTransaction?.createdAt || new Date().toISOString(),
      };

      if (editTransaction && onUpdateExpenseTransaction) {
        onUpdateExpenseTransaction(incomePayload);
      } else if (onSaveExpenseTransaction) {
        onSaveExpenseTransaction(incomePayload);
      }
    } else {
      // 💸 OUTGOING EXPENSE (Gasto Real)
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
        time: time ? (time.length === 5 ? `${time}:00` : time) : null,
        type: "debit",
        paymentSource: buildPaymentSource(),
        isLoan: Boolean(isLoan),
        loanRecipient: isLoan ? loanRecipient.trim() : null,
        loanAmount: isLoan ? (Number(loanAmount) > 0 ? Number(loanAmount) : Number(amount)) : null,
        loanDueDate: isLoan && loanDueDate ? loanDueDate : null,
        loanStatus: isLoan ? editTransaction?.loanStatus || "pending" : null,
        createdAt: editTransaction?.createdAt || new Date().toISOString(),
      };

      if (editTransaction && onUpdateExpenseTransaction) {
        onUpdateExpenseTransaction(txPayload);
      } else if (onSaveExpenseTransaction) {
        onSaveExpenseTransaction(txPayload);
      }
    }

    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={560}>
      <div style={{ padding: "20px 24px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 10 }}>
          <h3 className="cashflow-modal-title">
            <span>
              {movementNature === "income"
                ? "📥"
                : editTransaction
                ? "✏️"
                : isWealthItem
                ? "💎"
                : "💸"}
            </span>{" "}
            {movementNature === "income"
              ? editTransaction
                ? "Editar Ingreso / Transferencia"
                : "Registrar Ingreso / Abono de Dinero"
              : editTransaction
              ? "Editar Gasto / Préstamo"
              : isWealthItem
              ? "Registrar Aporte a Ahorro / CDT / Inversión"
              : "Registrar Gasto Real Ejecutado"}
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Dual Mode Toggle (Gasto vs Ingreso) */}
        {!editTransaction && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 6,
              marginBottom: 12,
              padding: 4,
              borderRadius: "12px",
              background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMovementNature("expense");
                if (budgetItems.length > 0) {
                  setDescription(budgetItems[0]?.name || "");
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: "9px",
                fontSize: "0.82rem",
                fontWeight: movementNature === "expense" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                background:
                  movementNature === "expense"
                    ? isLight
                      ? "#ffffff"
                      : "rgba(239, 68, 68, 0.22)"
                    : "transparent",
                border:
                  movementNature === "expense"
                    ? isLight
                      ? "1px solid rgba(239, 68, 68, 0.4)"
                      : "1px solid rgba(239, 68, 68, 0.5)"
                    : "none",
                color:
                  movementNature === "expense"
                    ? isLight
                      ? "#dc2626"
                      : "#fca5a5"
                    : isLight
                    ? "#64748b"
                    : "#94a3b8",
                boxShadow:
                  movementNature === "expense" && isLight
                    ? "0 2px 6px rgba(239, 68, 68, 0.12)"
                    : "none",
              }}
            >
              <span>💸</span> Gasto / Salida
            </button>

            <button
              type="button"
              onClick={() => {
                setMovementNature("income");
                const cat = INCOME_CATEGORIES.find((c) => c.id === incomeCategory);
                setDescription(cat?.defaultDesc || "Transferencia recibida");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: "9px",
                fontSize: "0.82rem",
                fontWeight: movementNature === "income" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                background:
                  movementNature === "income"
                    ? isLight
                      ? "#ffffff"
                      : "rgba(16, 185, 129, 0.22)"
                    : "transparent",
                border:
                  movementNature === "income"
                    ? isLight
                      ? "1px solid rgba(16, 185, 129, 0.4)"
                      : "1px solid rgba(16, 185, 129, 0.5)"
                    : "none",
                color:
                  movementNature === "income"
                    ? isLight
                      ? "#059669"
                      : "#6ee7b7"
                    : isLight
                    ? "#64748b"
                    : "#94a3b8",
                boxShadow:
                  movementNature === "income" && isLight
                    ? "0 2px 6px rgba(16, 185, 129, 0.12)"
                    : "none",
              }}
            >
              <span>📥</span> Ingreso / Entrada
            </button>
          </div>
        )}

        <p style={{ fontSize: "0.78rem", color: isLight ? "#475569" : "#94a3b8", marginTop: 2, marginBottom: 12 }}>
          {movementNature === "income"
            ? "Registra dinero que entró a una de tus cuentas (RappiCuenta, Nu, Nequi, etc.) y actualiza su saldo en Renta Fija en tiempo real."
            : isWealthItem
            ? "Indica de qué cuenta salió la plata para tu CDT, cuenta de ahorro o inversión (ej. Nómina Nu) para descontarla de tu saldo líquido disponible."
            : "Carga un gasto real consumido a tu sobre presupuestal y elige de qué cuenta o tarjeta salió el dinero."}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* INCOME MODE FORM FIELDS */}
          {movementNature === "income" ? (
            <>
              {/* Category Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Categoría del Ingreso
                </label>
                <select
                  value={incomeCategory}
                  onChange={(e) => handleIncomeCategoryChange(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                    border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "0.85rem",
                  }}
                >
                  {INCOME_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Account */}
              <div
                style={{
                  background: isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: isLight ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(16, 185, 129, 0.25)",
                }}
              >
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#047857" : "#6ee7b7", marginBottom: 6, fontWeight: 700 }}>
                  🏦 ¿A qué cuenta entró el dinero? (Cuenta Destino)
                </label>
                <select
                  value={incomeTargetAccountId}
                  onChange={(e) => setIncomeTargetAccountId(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.5)",
                    border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="payroll">
                    ⭐ {payrollAccount.name || "Cuenta Nu Débito (Nómina)"}
                  </option>
                  {fixedIncomeAccounts
                    .filter((acc) => acc.id !== "acc_nu_debito")
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (${Math.round(acc.balance || 0).toLocaleString("es-CO")} COP)
                      </option>
                    ))}
                </select>
              </div>
            </>
          ) : (
            /* EXPENSE MODE FORM FIELDS */
            <>
              {/* Target Budget Envelope */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Destino / Sobre Presupuestal a Cargar
                </label>
                <CascadingCategorySelector
                  budgetItems={budgetItems}
                  value={selectedBudgetItemId}
                  onChange={(val) => handleSelectBudgetItem(val)}
                  currency={currency}
                />
              </div>
            </>
          )}

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              {movementNature === "income"
                ? "Detalle / Concepto del Ingreso"
                : isWealthItem
                ? "Detalle / Nombre de la Inversión o Aporte"
                : "Detalle / Comercio del Gasto Real"}
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: isLight ? "#0f172a" : "#f8fafc",
                fontSize: "0.85rem",
                boxShadow: isLight ? "inset 0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                movementNature === "income"
                  ? "ej. Transferencia recibida RappiPay, Pago cliente..."
                  : isWealthItem
                  ? "ej. CDT Bancolombia 180 días, Ahorro Vacaciones, Acciones..."
                  : "ej. Almuerzo Crepes & Waffles, Compra Éxito, Cine..."
              }
              required
              autoFocus
            />
          </div>

          {/* Amount, Date & Time */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                {movementNature === "income"
                  ? `Monto (${currency})`
                  : isWealthItem
                  ? `Monto (${currency})`
                  : `Monto (${currency})`}
              </label>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Fecha
              </label>
              <DynamicDatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Seleccionar fecha..."
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Hora
              </label>
              <input
                type="time"
                step="1"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontSize: "0.85rem",
                  height: "38px",
                }}
              />
            </div>
          </div>

          {/* Loan / Receivable Option (Only in Expense mode) */}
          {movementNature === "expense" && !isWealthItem && (
            <div
              style={{
                background: isLoan
                  ? isLight
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(245, 158, 11, 0.1)"
                  : isLight
                  ? "rgba(0, 0, 0, 0.02)"
                  : "rgba(255, 255, 255, 0.025)",
                border: isLoan
                  ? "1px solid rgba(245, 158, 11, 0.4)"
                  : isLight
                  ? "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "10px 14px",
                transition: "all 0.15s ease",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: isLoan
                    ? isLight
                      ? "#d97706"
                      : "#fcd34d"
                    : isLight
                    ? "#334155"
                    : "#cbd5e1",
                }}
              >
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
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(245, 158, 11, 0.2)",
                  }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#fcd34d", marginBottom: 4, fontWeight: 600 }}>
                      ¿A quién le prestaste? (Deudor)
                    </label>
                    <input
                      type="text"
                      value={loanRecipient}
                      onChange={(e) => setLoanRecipient(e.target.value)}
                      placeholder="ej. Camilo, Mamá, Compañero..."
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.8)",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        color: isLight ? "#0f172a" : "#f8fafc",
                        fontSize: "0.82rem",
                      }}
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
                  <span style={{ color: "#cbd5e1" }}>💰 Tu Consumo Personal Real:</span>
                  <strong
                    style={{
                      color: userPersonalCost > 0 ? "#38bdf8" : "#10b981",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {formatMoney(userPersonalCost, currency)}
                    {userPersonalCost === 0
                      ? " (100% Préstamo - No afecta tu sobre)"
                      : " (Se descuenta de tu sobre)"}
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* Payment Source (Only in Expense mode) */}
          {movementNature === "expense" && (
            <div
              style={{
                background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(13, 18, 38, 0.6)",
                padding: "12px 14px",
                borderRadius: "12px",
                border: isLight
                  ? "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "0.76rem",
                  color: isLight ? "#1e293b" : "#94a3b8",
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                🏦 ¿De dónde salió la plata? (Cuenta Origen)
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSourceType("payroll")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "payroll"
                        ? isLight
                          ? "rgba(130, 10, 209, 0.12)"
                          : "rgba(130, 10, 209, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "payroll"
                        ? "1px solid #820ad1"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "payroll"
                        ? isLight
                          ? "#7e22ce"
                          : "#c084fc"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
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
                    background:
                      sourceType === "credit_card"
                        ? isLight
                          ? "rgba(244, 63, 94, 0.12)"
                          : "rgba(244, 63, 94, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "credit_card"
                        ? "1px solid #f43f5e"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "credit_card"
                        ? isLight
                          ? "#e11d48"
                          : "#f43f5e"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
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
                    background:
                      sourceType === "fixed_pocket"
                        ? isLight
                          ? "rgba(14, 165, 233, 0.12)"
                          : "rgba(56, 189, 248, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "fixed_pocket"
                        ? "1px solid #0284c7"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "fixed_pocket"
                        ? isLight
                          ? "#0284c7"
                          : "#38bdf8"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  📦 Cuenta de Ahorro / Renta Fija
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("investment_cash")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "investment_cash"
                        ? isLight
                          ? "rgba(168, 85, 247, 0.12)"
                          : "rgba(168, 85, 247, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "investment_cash"
                        ? "1px solid #9333ea"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "investment_cash"
                        ? isLight
                          ? "#9333ea"
                          : "#a855f7"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
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
                    <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                      Seleccionar Tarjeta:
                    </label>
                    <select
                      value={selectedCardId}
                      onChange={(e) => setSelectedCardId(e.target.value)}
                      style={{
                        width: "100%",
                        background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                        border: isLight
                          ? "1px solid rgba(0,0,0,0.15)"
                          : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        color: isLight ? "#0f172a" : "#fff",
                        fontSize: "0.78rem",
                      }}
                    >
                      {creditCards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Cupo: {formatMoney(c.totalLimit, currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                      Cuotas (Sin Interés / MSI):
                    </label>
                    <select
                      value={cardInstallments}
                      onChange={(e) => setCardInstallments(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                        border: isLight
                          ? "1px solid rgba(0,0,0,0.15)"
                          : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        color: isLight ? "#0f172a" : "#fff",
                        fontSize: "0.78rem",
                      }}
                    >
                      <option value={1}>1 Cuota (0% Sin Interés)</option>
                      <option value={2}>2 Cuotas Sin Interés (0% MSI)</option>
                      <option value={3}>3 Cuotas Sin Interés (0% MSI)</option>
                      <option value={4}>4 Cuotas Sin Interés (0% MSI)</option>
                      <option value={5}>5 Cuotas Sin Interés (0% MSI)</option>
                      <option value={6}>6 Cuotas Sin Interés (0% MSI)</option>
                      <option value={8}>8 Cuotas Sin Interés (0% MSI)</option>
                      <option value={9}>9 Cuotas Sin Interés (0% MSI)</option>
                      <option value={10}>10 Cuotas Sin Interés (0% MSI)</option>
                      <option value={12}>12 Cuotas Sin Interés (0% MSI)</option>
                      <option value={18}>18 Cuotas Sin Interés (0% MSI)</option>
                      <option value={24}>24 Cuotas Sin Interés (0% MSI)</option>
                      <option value={36}>36 Cuotas Sin Interés (0% MSI)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Sub-selector for Pockets */}
              {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                    Cuenta de Ahorro / Bolsillo:
                  </label>
                  <select
                    value={selectedPocketId}
                    onChange={(e) => setSelectedPocketId(e.target.value)}
                    style={{
                      width: "100%",
                      background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                      border: isLight
                        ? "1px solid rgba(0,0,0,0.15)"
                        : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      padding: "6px 8px",
                      color: isLight ? "#0f172a" : "#fff",
                      fontSize: "0.78rem",
                    }}
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
          )}

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 10 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={!description.trim() || Number(amount) <= 0}
              style={{
                background:
                  movementNature === "income"
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : undefined,
                boxShadow:
                  movementNature === "income"
                    ? "0 4px 14px rgba(16, 185, 129, 0.35)"
                    : undefined,
              }}
            >
              {movementNature === "income"
                ? `✓ Registrar Ingreso (+${formatMoney(amount, currency)})`
                : isWealthItem
                ? "✓ Registrar Aporte / Inversión"
                : "✓ Registrar Gasto Real"}
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
