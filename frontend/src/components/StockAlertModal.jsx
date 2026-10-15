import React, { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function StockAlertModal({
  isOpen,
  onClose,
  initialAlert = null,
  ticker = "",
  companyName = "",
  currentPrice = 0,
  entryPrice = 0,
  currentReturnPct = 0,
  scope = "strategy", // 'strategy' or 'purchase'
  targetId = "historical",
  userEmail = "",
  onSave,
  onDelete,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [alertType, setAlertType] = useState("PROFIT_TARGET");
  const [targetValue, setTargetValue] = useState(15.0);
  const [isActive, setIsActive] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyApp, setNotifyApp] = useState(true);
  const [customEmail, setCustomEmail] = useState(userEmail || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialAlert) {
      setAlertType(initialAlert.alert_type || "PROFIT_TARGET");
      setTargetValue(initialAlert.target_value ?? (initialAlert.alert_type === "STOP_LOSS" ? -10.0 : 15.0));
      setIsActive(initialAlert.is_active !== false);
      setNotifyEmail(initialAlert.notify_email !== false);
      setNotifyApp(initialAlert.notify_app !== false);
      setCustomEmail(initialAlert.user_email || userEmail || "");
    } else {
      setAlertType("PROFIT_TARGET");
      setTargetValue(15.0);
      setIsActive(true);
      setNotifyEmail(true);
      setNotifyApp(true);
      setCustomEmail(userEmail || "");
    }
  }, [initialAlert, isOpen, userEmail]);

  if (!isOpen) return null;

  const calculatedTriggerPrice = entryPrice > 0 ? entryPrice * (1 + targetValue / 100) : 0;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        id: initialAlert?.id || undefined,
        scope,
        target_id: targetId,
        ticker,
        alert_type: alertType,
        target_value: Number(targetValue),
        is_active: isActive,
        notify_email: notifyEmail,
        notify_app: notifyApp,
        user_email: customEmail.trim() || undefined,
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error("Error saving alert:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          background: isLight ? "#ffffff" : "var(--bg-surface)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "var(--border)"}`,
          borderRadius: 16,
          boxShadow: isLight ? "0 10px 30px rgba(0,0,0,0.15)" : "0 12px 35px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "var(--border)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: isLight ? "rgba(2, 132, 199, 0.04)" : "rgba(0, 229, 255, 0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>🔔</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
                Alerta de Venta • {ticker}
              </h3>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {companyName || ticker}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.2rem",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Position Context */}
        <div
          style={{
            padding: "14px 22px",
            background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "var(--border)"}`,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            fontSize: "0.78rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)" }}>Precio Entrada: </span>
            <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              ${Number(entryPrice).toFixed(2)}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Precio Actual: </span>
            <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--accent-primary)" }}>
              ${Number(currentPrice).toFixed(2)}
            </span>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <span style={{ color: "var(--text-muted)" }}>Rentabilidad Acumulada: </span>
            <span
              style={{
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: currentReturnPct >= 0 ? "#10b981" : "#f43f5e",
              }}
            >
              {currentReturnPct >= 0 ? "+" : ""}{Number(currentReturnPct).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Active Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: isActive
                ? isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.12)"
                : isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isActive
                ? isLight ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.3)"
                : isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1rem" }}>{isActive ? "⚡" : "⏸️"}</span>
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  {isActive ? "Alerta Activada" : "Alerta Pausada"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {isActive ? "Monitoreando cotizaciones continuamente" : "No emitirá avisos mientras esté pausada"}
                </div>
              </div>
            </div>

            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: isActive ? "#10b981" : "#64748b",
                  borderRadius: 24,
                  transition: "all 0.2s ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: isActive ? 22 : 2,
                    top: 2,
                    width: 20,
                    height: 20,
                    backgroundColor: "#ffffff",
                    borderRadius: "50%",
                    transition: "all 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </span>
            </label>
          </div>

          {/* Alert Type: Profit Target vs Stop Loss */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Tipo de Disparador
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setAlertType("PROFIT_TARGET");
                  if (targetValue < 0) setTargetValue(Math.abs(targetValue) || 15.0);
                }}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: alertType === "PROFIT_TARGET"
                    ? `1px solid #10b981`
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "PROFIT_TARGET"
                    ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "PROFIT_TARGET" ? (isLight ? "#047857" : "#34d399") : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🎯</span>
                <span>Objetivo Ganancia</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAlertType("STOP_LOSS");
                  if (targetValue > 0) setTargetValue(-Math.abs(targetValue) || -10.0);
                }}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: alertType === "STOP_LOSS"
                    ? `1px solid #ef4444`
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "STOP_LOSS"
                    ? isLight ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "STOP_LOSS" ? (isLight ? "#b91c1c" : "#f87171") : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🛑</span>
                <span>Stop Loss (Riesgo)</span>
              </button>
            </div>
          </div>

          {/* Target Value Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Rentabilidad Disparadora (%)
              </label>
              {calculatedTriggerPrice > 0 && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                  Dispara a ~${calculatedTriggerPrice.toFixed(2)}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 8,
                padding: "8px 14px",
              }}
            >
              <span style={{ fontWeight: 800, color: "var(--text-muted)", marginRight: 6 }}>%</span>
              <input
                type="number"
                step="0.5"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                required
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {(alertType === "PROFIT_TARGET" ? [5, 10, 15, 20, 30] : [-5, -8, -10, -15, -20]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetValue(preset)}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 6,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${targetValue === preset ? "var(--accent-primary)" : isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`,
                    background: targetValue === preset
                      ? isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.15)"
                      : "transparent",
                    color: targetValue === preset
                      ? isLight ? "#0284c7" : "var(--accent-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {preset > 0 ? `+${preset}%` : `${preset}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Notification Channels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Canales de Notificación
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* App Toast / Notification Banner */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  checked={notifyApp}
                  onChange={(e) => setNotifyApp(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Notificación estética en la aplicación (In-App Banner)</span>
              </label>

              {/* Email Notification */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Enviar aviso al correo electrónico registrado</span>
              </label>

              {notifyEmail && (
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  style={{
                    marginLeft: 26,
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}`,
                    background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.5)",
                    color: "var(--text-primary)",
                    fontSize: "0.82rem",
                  }}
                />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: initialAlert?.id ? "space-between" : "flex-end",
              alignItems: "center",
              marginTop: 10,
              gap: 12,
            }}
          >
            {initialAlert?.id && (
              <button
                type="button"
                onClick={async () => {
                  if (onDelete) {
                    await onDelete(initialAlert.id);
                    onClose();
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "8px 12px",
                }}
              >
                Eliminar Alerta
              </button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "0.82rem" }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-primary"
                style={{
                  padding: "8px 20px",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isSaving ? "Guardando..." : "Guardar Alerta"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
