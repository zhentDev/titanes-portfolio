import React, { useState, useEffect } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function DebtModal({
  isOpen,
  onClose,
  debtToEdit = null,
  onSaveDebt,
  fixedIncomeAccounts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

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
      setConcept(debtToEdit.concept || "");
      setCreditor(debtToEdit.creditor || "");
      setTotalAmount(String(debtToEdit.totalAmount || ""));
      setRemainingAmount(String(debtToEdit.remainingAmount !== undefined ? debtToEdit.remainingAmount : debtToEdit.totalAmount || ""));
      setPaymentMethod(debtToEdit.paymentMethod || "Transferencia desde Cajita / Cuenta");
      setPaymentSourceId(debtToEdit.paymentSourceId || "");
      setPaymentFrequency(debtToEdit.paymentFrequency || "monthly");
      setInstallmentAmount(String(debtToEdit.installmentAmount || ""));
      setNextPaymentDate(debtToEdit.nextPaymentDate || "");
      setNotes(debtToEdit.notes || "");
      setStatus(debtToEdit.status || "active");
    } else {
      setConcept("");
      setCreditor("");
      setTotalAmount("");
      setRemainingAmount("");
      setIsRemainingManual(false);
      setPaymentMethod("Transferencia desde Cajita / Cuenta");
      setPaymentSourceId("");
      setPaymentFrequency("monthly");
      setInstallmentAmount("");
      setNextPaymentDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setStatus("active");
    }
  }, [debtToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!concept.trim()) {
      alert("El Concepto de la deuda es obligatorio.");
      return;
    }
    const tot = Math.abs(Number(totalAmount) || 0);
    const rem = remainingAmount !== "" ? Math.abs(Number(remainingAmount)) : tot;

    onSaveDebt({
      ...(debtToEdit || {}),
      concept: concept.trim(),
      creditor: creditor.trim() || "Acreedor / Particular",
      totalAmount: tot,
      remainingAmount: rem,
      paymentMethod,
      paymentSourceId: paymentSourceId || null,
      paymentFrequency,
      installmentAmount: Number(installmentAmount) || 0,
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
          border: isLight ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid rgba(244, 63, 94, 0.45)",
          boxShadow: isLight
            ? "0 20px 40px rgba(244, 63, 94, 0.12)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
          padding: "24px",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>💳</span>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
                {debtToEdit ? "Editar Compromiso / Deuda" : "Registrar Nueva Deuda / Pasivo"}
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                Define claramente el concepto obligatorio y cómo la pagas
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 1. Concepto OBLIGATORIO */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
              Concepto de la Deuda <span style={{ color: "#f43f5e" }}>* (Obligatorio)</span>
            </label>
            <input
              type="text"
              required
              placeholder="ej. Deuda mamá por préstamo de estudios, Crédito de libre inversión..."
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

          {/* 2. Acreedor / Prestamista */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                Acreedor / Prestamista
              </label>
              <input
                type="text"
                placeholder="ej. Mamá, Banco, Amigo..."
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
                <option value="active">🔴 Activa (Por pagar)</option>
                <option value="paid">🟢 Pagada / Liquidada</option>
              </select>
            </div>
          </div>

          {/* 3. Montos: Total & Saldo Restante */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: 5 }}>
                Monto Inicial Total ({currency})
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
                Saldo Pendiente Actual ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="ej. 450000"
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
                  color: "#f43f5e",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              />
            </div>
          </div>

          {/* 4. ¿Cómo la pagas? (Método de Pago & Origen) */}
          <div style={{ background: isLight ? "rgba(244, 63, 94, 0.05)" : "rgba(244, 63, 94, 0.08)", padding: "12px", borderRadius: 10, border: "1px dashed rgba(244, 63, 94, 0.3)" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 800, color: isLight ? "#be123c" : "#fb7185", display: "block", marginBottom: 6 }}>
              🔄 ¿Cómo la pagas? (Forma de Pago)
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
                  <option value="Transferencia desde Cajita / Cuenta">📦 Cajita específica (ej. Deuda mom)</option>
                  <option value="Nómina / Débito directa">💼 Débito de Nómina</option>
                  <option value="Transferencia Bancaria">🏦 Transferencia Bancaria</option>
                  <option value="Efectivo">💵 Efectivo en mano</option>
                  <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito</option>
                </select>
              </div>

              {/* Si es desde Cajita / Cuenta, permitir seleccionar la cuenta SSOT vinculada */}
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
                  <option value="">-- Cuenta / Cajita Origen (Opcional) --</option>
                  {fixedIncomeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${Number(acc.balance || 0).toLocaleString()} {acc.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 5. Cuota y Fechas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                Frecuencia
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
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
                <option value="one_time">Pago único al vencer</option>
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
                Próximo Pago
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
              Notas / Condiciones de Pago (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Acuerdos de cuotas, cuenta de destino de la persona, plazo límite..."
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
                background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                color: "#ffffff",
                fontSize: "0.84rem",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 4px 14px rgba(244, 63, 94, 0.3)",
              }}
            >
              {debtToEdit ? "Guardar Cambios" : "Guardar Deuda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
