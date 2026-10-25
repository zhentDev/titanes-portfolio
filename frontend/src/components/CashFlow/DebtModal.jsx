import React, { useState, useEffect } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function DebtModal({
  isOpen,
  onClose,
  debtToEdit = null,
  defaultDebtType = "payable",
  onSaveDebt,
  fixedIncomeAccounts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [debtType, setDebtType] = useState("payable"); // "payable" | "receivable"
  const [concept, setConcept] = useState("");
  const [creditor, setCreditor] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [remainingAmount, setRemainingAmount] = useState("");
  const [isRemainingManual, setIsRemainingManual] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Transferencia desde Cajita / Cuenta");
  const [paymentSourceId, setPaymentSourceId] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("monthly");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [nextPaymentDate, setNextPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (debtToEdit) {
      setDebtType(debtToEdit.debtType || "payable");
      setConcept(debtToEdit.concept || "");
      setCreditor(debtToEdit.debtor || debtToEdit.creditor || "");
      setTotalAmount(String(debtToEdit.totalAmount || ""));
      setRemainingAmount(String(debtToEdit.remainingAmount !== undefined ? debtToEdit.remainingAmount : debtToEdit.totalAmount || ""));
      setPaymentMethod(debtToEdit.paymentMethod || (debtToEdit.debtType === "receivable" ? "Transferencia a Cuenta / Cajita" : "Transferencia desde Cajita / Cuenta"));
      setPaymentSourceId(debtToEdit.paymentSourceId || "");
      setPaymentFrequency(debtToEdit.paymentFrequency || (debtToEdit.debtType === "receivable" ? "one_time" : "monthly"));
      setInstallmentAmount(String(debtToEdit.installmentAmount || ""));
      setNextPaymentDate(debtToEdit.dueDate || debtToEdit.nextPaymentDate || "");
      setNotes(debtToEdit.notes || "");
      setStatus(debtToEdit.status || "active");
    } else {
      const initType = defaultDebtType || "payable";
      setDebtType(initType);
      setConcept("");
      setCreditor("");
      setTotalAmount("");
      setRemainingAmount("");
      setIsRemainingManual(false);
      setPaymentMethod(initType === "receivable" ? "Transferencia a Cuenta / Cajita" : "Transferencia desde Cajita / Cuenta");
      setPaymentSourceId("");
      setPaymentFrequency(initType === "receivable" ? "one_time" : "monthly");
      setInstallmentAmount("");
      setNextPaymentDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setStatus("active");
    }
  }, [debtToEdit, isOpen, defaultDebtType]);

  if (!isOpen) return null;

  const isReceivable = debtType === "receivable";

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!concept.trim()) {
      alert(`El Concepto ${isReceivable ? "del préstamo" : "de la deuda"} es obligatorio.`);
      return;
    }
    const tot = Math.abs(Number(totalAmount) || 0);
    const rem = remainingAmount !== "" ? Math.abs(Number(remainingAmount)) : tot;

    onSaveDebt({
      ...(debtToEdit || {}),
      debtType,
      concept: concept.trim(),
      creditor: creditor.trim() || (isReceivable ? "Deudor" : "Acreedor / Particular"),
      debtor: creditor.trim() || (isReceivable ? "Deudor" : "Acreedor / Particular"),
      totalAmount: tot,
      remainingAmount: rem,
      paymentMethod,
      paymentSourceId: paymentSourceId || null,
      paymentFrequency,
      installmentAmount: Number(installmentAmount) || 0,
      dueDate: nextPaymentDate || null,
      nextPaymentDate: nextPaymentDate || null,
      notes: notes.trim(),
      status: rem <= 0 ? "paid" : status,
    });

    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "92vh",
          overflowY: "auto",
          border: isReceivable
            ? (isLight ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(16, 185, 129, 0.45)")
            : (isLight ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid rgba(244, 63, 94, 0.45)"),
          boxShadow: isReceivable
            ? (isLight ? "0 20px 40px rgba(16, 185, 129, 0.12)" : "0 25px 50px -12px rgba(0, 0, 0, 0.8)")
            : (isLight ? "0 20px 40px rgba(244, 63, 94, 0.12)" : "0 25px 50px -12px rgba(0, 0, 0, 0.8)"),
          padding: "24px",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>{isReceivable ? "🤝" : "💳"}</span>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
                {debtToEdit
                  ? isReceivable
                    ? "Editar Préstamo por Cobrar"
                    : "Editar Compromiso / Deuda"
                  : isReceivable
                  ? "Registrar Préstamo por Cobrar"
                  : "Registrar Nueva Deuda / Pasivo"}
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                {isReceivable
                  ? "Dinero que un tercero te debe. No cuenta como ingreso hasta que te paguen."
                  : "Define claramente el concepto obligatorio y cómo la pagas."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tipo de Registro (Selector Pasivo vs Activo) */}
        {!debtToEdit && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => {
                setDebtType("payable");
                setPaymentMethod("Transferencia desde Cajita / Cuenta");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: !isReceivable ? "1.5px solid #f43f5e" : "1px solid var(--border)",
                background: !isReceivable
                  ? (isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.2)")
                  : "var(--bg-surface)",
                color: !isReceivable ? (isLight ? "#be123c" : "#fb7185") : "var(--text-muted)",
                fontWeight: !isReceivable ? 800 : 500,
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              🔴 Yo Debo (Pasivo)
            </button>
            <button
              type="button"
              onClick={() => {
                setDebtType("receivable");
                setPaymentMethod("Transferencia a Cuenta / Cajita");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: isReceivable ? "1.5px solid #10b981" : "1px solid var(--border)",
                background: isReceivable
                  ? (isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)")
                  : "var(--bg-surface)",
                color: isReceivable ? (isLight ? "#047857" : "#34d399") : "var(--text-muted)",
                fontWeight: isReceivable ? 800 : 500,
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              🟢 Me Deben (Por Cobrar)
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 1. Concepto OBLIGATORIO */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
              {isReceivable ? "Concepto del Préstamo / Motivo" : "Concepto de la Deuda"}{" "}
              <span style={{ color: isReceivable ? "#10b981" : "#f43f5e" }}>* (Obligatorio)</span>
            </label>
            <input
              type="text"
              required
              placeholder={
                isReceivable
                  ? "ej. Préstamo personal para estudios, Venta de equipo a cuotas..."
                  : "ej. Deuda mamá por préstamo de estudios, Crédito de libre inversión..."
              }
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                padding: "9px 12px",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
          </div>

          {/* 2. Deudor / Acreedor */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                {isReceivable ? "👤 ¿Quién te debe? (Deudor)" : "👤 Acreedor / Prestamista"}
              </label>
              <input
                type="text"
                placeholder={isReceivable ? "ej. Carlos Gómez, Mi hermano..." : "ej. Mamá, Banco, Mike..."}
                value={creditor}
                onChange={(e) => setCreditor(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontSize: "0.82rem",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                Estado
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontSize: "0.82rem",
                }}
              >
                <option value="active">
                  {isReceivable ? "🟢 Pendiente de Cobro" : "🔴 Activa (Por pagar)"}
                </option>
                <option value="paid">
                  {isReceivable ? "🏁 Totalmente Cobrada" : "🟢 Pagada / Liquidada"}
                </option>
              </select>
            </div>
          </div>

          {/* 3. Montos: Total & Saldo Restante */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                {isReceivable ? "Monto Prestado Total" : "Monto Inicial Total"} ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="ej. 500000"
                value={totalAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setTotalAmount(val);
                  if (!debtToEdit && !isRemainingManual) {
                    setRemainingAmount(val);
                  }
                }}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                {isReceivable ? "Saldo Pendiente por Cobrar" : "Saldo Pendiente Actual"} ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="ej. 500000"
                value={remainingAmount}
                onChange={(e) => {
                  setIsRemainingManual(true);
                  setRemainingAmount(e.target.value);
                }}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: isReceivable ? "#10b981" : "#f43f5e",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              />
            </div>
          </div>

          {/* 4. ¿Cómo se paga o dónde entra? */}
          <div
            style={{
              background: isReceivable
                ? (isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)")
                : (isLight ? "rgba(244, 63, 94, 0.05)" : "rgba(244, 63, 94, 0.08)"),
              padding: "12px",
              borderRadius: 10,
              border: isReceivable
                ? "1px dashed rgba(16, 185, 129, 0.35)"
                : "1px dashed rgba(244, 63, 94, 0.3)",
            }}
          >
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 800,
                color: isReceivable ? (isLight ? "#047857" : "#34d399") : (isLight ? "#be123c" : "#fb7185"),
                display: "block",
                marginBottom: 6,
              }}
            >
              {isReceivable ? "📥 ¿Dónde esperas recibir el dinero?" : "🔄 ¿Cómo la pagas? (Forma de Pago)"}
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                  }}
                >
                  {isReceivable ? (
                    <>
                      <option value="Transferencia a Cajita / Cuenta">📦 A Cajita / Cuenta de Ahorro</option>
                      <option value="Nómina / Débito directa">💼 A Cuenta de Nómina</option>
                      <option value="Transferencia Bancaria">🏦 Transferencia Bancaria</option>
                      <option value="Efectivo">💵 En Efectivo</option>
                    </>
                  ) : (
                    <>
                      <option value="Transferencia desde Cajita / Cuenta">📦 Cajita específica (ej. Deuda mom)</option>
                      <option value="Nómina / Débito directa">💼 Débito de Nómina</option>
                      <option value="Transferencia Bancaria">🏦 Transferencia Bancaria</option>
                      <option value="Efectivo">💵 Efectivo en mano</option>
                      <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <select
                  value={paymentSourceId}
                  onChange={(e) => setPaymentSourceId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                  }}
                >
                  <option value="">-- Cuenta / Cajita Vinculada (Opcional) --</option>
                  {fixedIncomeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${Number(acc.balance || 0).toLocaleString()} {acc.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 5. Cuota y Fecha Prometida */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                Modalidad
              </label>
              <select
                value={paymentFrequency}
                onChange={(e) => setPaymentFrequency(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 8px",
                  color: "var(--text-primary)",
                  fontSize: "0.78rem",
                }}
              >
                <option value="one_time">Pago único al vencer</option>
                <option value="monthly">Cuotas Mensuales</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                Valor Cuota ({currency})
              </label>
              <input
                type="number"
                step="any"
                placeholder="ej. 50000"
                value={installmentAmount}
                onChange={(e) => setInstallmentAmount(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 8px",
                  color: "var(--text-primary)",
                  fontSize: "0.8rem",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                {isReceivable ? "🗓️ Quedó de pagar" : "🗓️ Próximo Pago"}
              </label>
              <input
                type="date"
                value={nextPaymentDate}
                onChange={(e) => setNextPaymentDate(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 8px",
                  color: "var(--text-primary)",
                  fontSize: "0.78rem",
                }}
              />
            </div>
          </div>

          {/* 6. Observaciones */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text-muted)" }}>
              Notas / Acuerdos (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder={
                isReceivable
                  ? "ej. Quedó de transferirme el 15 tras recibir prima; número de Nequi o cuenta acordada..."
                  : "Acuerdos de cuotas, cuenta de destino de la persona, plazo límite..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
                resize: "none",
              }}
            />
          </div>

          {/* Botones */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                background: isReceivable
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                color: "#ffffff",
                fontSize: "0.84rem",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: isReceivable
                  ? "0 4px 14px rgba(16, 185, 129, 0.3)"
                  : "0 4px 14px rgba(244, 63, 94, 0.3)",
              }}
            >
              {debtToEdit
                ? "Guardar Cambios"
                : isReceivable
                ? "+ Guardar Préstamo por Cobrar"
                : "+ Guardar Deuda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
