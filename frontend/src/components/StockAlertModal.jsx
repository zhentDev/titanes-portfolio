import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function StockAlertModal({
  isOpen,
  onClose,
  initialAlert = null,
  ticker = "",
  alertKey = "", // e.g. "IPLT.L" (parent) or "IPLT.L::lot_123" (individual lot)
  lotLabel = null, // e.g. "Lote Individual (2026-01-29 • 2.6464 uds)" or "Posición Consolidada (4 Lotes)"
  isParentGroup = false,
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

  const curRet = Number(currentReturnPct) || 0;
  const curP = Number(currentPrice) || 0;
  const entP = Number(entryPrice) || 0;

  // Smart default values for each mode based on current return
  const defaultProfitTarget = useMemo(() => {
    if (curRet < -15) return -20.0; // Recovery target when deep in drawdown
    if (curRet < 0) return 5.0;
    return Math.ceil((curRet + 10) / 5) * 5;
  }, [curRet]);

  const defaultStopLoss = useMemo(() => {
    if (curRet < 0) {
      // Position is already negative (e.g. -40.03%): default Stop Loss is 5% further down (e.g. -45%)
      return Math.floor(curRet - 5);
    }
    return -10.0;
  }, [curRet]);

  const [alertType, setAlertType] = useState("PROFIT_TARGET");
  const [targetValue, setTargetValue] = useState(15.0);
  const [isActive, setIsActive] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyApp, setNotifyApp] = useState(true);
  const [customEmail, setCustomEmail] = useState(userEmail || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAlert) {
      const savedType = initialAlert.alert_type || "PROFIT_TARGET";
      const savedVal = Number(
        initialAlert.target_value ?? (savedType === "STOP_LOSS" ? defaultStopLoss : defaultProfitTarget)
      );
      setAlertType(savedType);
      setTargetValue(savedVal);
      setIsActive(initialAlert.is_active !== false);
      setNotifyEmail(initialAlert.notify_email !== false);
      setNotifyApp(initialAlert.notify_app !== false);
      setCustomEmail(initialAlert.user_email || userEmail || "");
    } else {
      setAlertType("PROFIT_TARGET");
      setTargetValue(defaultProfitTarget);
      setIsActive(true);
      setNotifyEmail(true);
      setNotifyApp(true);
      setCustomEmail(userEmail || "");
    }
  }, [initialAlert, isOpen, userEmail, defaultProfitTarget, defaultStopLoss]);

  if (!isOpen) return null;

  const numTarget = Number(targetValue) || 0;
  const calculatedTriggerPrice = entP > 0 ? entP * (1 + numTarget / 100) : 0;
  const spotDeltaPct = curP > 0 && calculatedTriggerPrice > 0 ? ((calculatedTriggerPrice - curP) / curP) * 100 : 0;
  const spotDeltaUsd = calculatedTriggerPrice - curP;

  // Dynamic presets depending on selected mode (PROFIT_TARGET vs STOP_LOSS) and currentReturnPct
  const activePresets = useMemo(() => {
    if (alertType === "PROFIT_TARGET") {
      if (curRet < -25) return [-30, -25, -20, -15, -10, 0, 10];
      if (curRet < -5) return [-10, -5, 0, 5, 10, 15, 20];
      return [5, 10, 15, 20, 25, 35, 50];
    } else {
      // STOP_LOSS mode: presets must be below currentReturnPct so they represent a downward stop!
      if (curRet < -5) {
        const base = Math.floor(curRet);
        return [base - 3, base - 5, base - 8, base - 10, base - 15, base - 20];
      }
      return [-5, -8, -10, -15, -20, -25];
    }
  }, [alertType, curRet]);

  const handleSelectProfitTarget = () => {
    setAlertType("PROFIT_TARGET");
    // If current targetValue is below or equal to currentReturnPct, switch to a sensible recovery/profit target above curRet
    if (Number(targetValue) <= curRet) {
      setTargetValue(defaultProfitTarget);
    }
  };

  const handleSelectStopLoss = () => {
    setAlertType("STOP_LOSS");
    // If current targetValue is above or equal to currentReturnPct, switch to a sensible stop-loss below curRet
    if (Number(targetValue) >= curRet) {
      setTargetValue(defaultStopLoss);
    }
  };

  const isInvalidDirection =
    (alertType === "PROFIT_TARGET" && numTarget <= curRet) ||
    (alertType === "STOP_LOSS" && numTarget >= curRet);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        id: initialAlert?.id || undefined,
        scope,
        target_id: targetId,
        ticker: alertKey || ticker,
        alert_type: alertType,
        target_value: Number(targetValue),
        is_active: isActive,
        notify_email: notifyEmail,
        notify_app: notifyApp,
        user_email: customEmail.trim() || undefined,
        isParentGroup,
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
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "14px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflowY: "auto",
          background: isLight ? "#ffffff" : "var(--bg-surface)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "var(--border)"}`,
          borderRadius: 16,
          boxShadow: isLight ? "0 10px 30px rgba(0,0,0,0.15)" : "0 12px 35px rgba(0,0,0,0.55)",
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "var(--border)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: isLight ? "rgba(2, 132, 199, 0.04)" : "rgba(0, 229, 255, 0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: "1.35rem", lineHeight: 1.1 }}>🔔</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800, letterSpacing: "0.02em" }}>
                  ORDEN CONDICIONAL DE ALERTA • {ticker}
                </h3>
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 800,
                    padding: "2px 7px",
                    borderRadius: 5,
                    background: isParentGroup
                      ? isLight ? "rgba(245, 158, 11, 0.14)" : "rgba(245, 158, 11, 0.2)"
                      : isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.15)",
                    color: isParentGroup
                      ? isLight ? "#b45309" : "#fbbf24"
                      : isLight ? "#0369a1" : "#00e5ff",
                    border: `1px solid ${isParentGroup ? "rgba(245, 158, 11, 0.35)" : "rgba(2, 132, 199, 0.3)"}`,
                  }}
                >
                  {isParentGroup ? "🌐 POSICIÓN GLOBAL (REPLICA A TODOS LOS LOTES)" : "🎯 LOTE INDIVIDUAL AISLADO"}
                </span>
              </div>
              <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 3 }}>
                {lotLabel || companyName || ticker}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.15rem",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Technical Position Telemetry Strip */}
        <div
          style={{
            padding: "14px 20px",
            background: isLight ? "rgba(15, 23, 42, 0.025)" : "rgba(255, 255, 255, 0.02)",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "var(--border)"}`,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: isLight ? "#ffffff" : "rgba(0,0,0,0.2)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {isParentGroup ? "Costo Promedio (WAP)" : "Precio Apertura (P₀)"}
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              ${entP.toFixed(2)}
            </div>
            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
              Base de cálculo Cost Basis
            </div>
          </div>

          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: isLight ? "#ffffff" : "rgba(0,0,0,0.2)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Cotización Spot (P_actual)
            </div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--accent-primary)",
                marginTop: 2,
              }}
            >
              ${curP.toFixed(2)}
            </div>
            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
              Precio Mark-to-Market
            </div>
          </div>

          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: isLight ? "#ffffff" : "rgba(0,0,0,0.2)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Retorno Latente (ROI)
            </div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: curRet >= 0 ? "#10b981" : "#f43f5e",
                marginTop: 2,
              }}
            >
              {curRet >= 0 ? "+" : ""}{curRet.toFixed(2)}%
            </div>
            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
              {curRet >= 0 ? "Plusvalía Abierta" : "Drawdown Actual"}
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 15 }}>
          {/* Active Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: isActive
                ? isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)"
                : isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isActive
                ? "rgba(16, 185, 129, 0.35)"
                : isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1rem" }}>{isActive ? "⚡" : "⏸️"}</span>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                  {isActive ? "Centinela Activo (Polling Intradía 60s)" : "Centinela en Pausa"}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                  {isParentGroup
                    ? "Al guardar aquí, este disparador se asignará a todos los lotes de este activo"
                    : "Este disparador evalúa únicamente este lote de compra sin alterar los demás"}
                </div>
              </div>
            </div>

            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", flexShrink: 0 }}>
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

          {/* Alert Type: Profit Target / Recovery vs Stop Loss */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>
                1. Tipo de Disparador (Condición Lógica de Cruce)
              </label>
              <span style={{ fontSize: "0.66rem", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                {alertType === "PROFIT_TARGET" ? "Condición: ROI_actual ≥ ROI_obj" : "Condición: ROI_actual ≤ ROI_obj"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={handleSelectProfitTarget}
                style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  border: alertType === "PROFIT_TARGET"
                    ? "1.5px solid #10b981"
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "PROFIT_TARGET"
                    ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "PROFIT_TARGET" ? (isLight ? "#047857" : "#34d399") : "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: "0.8rem" }}>
                  <span>🎯</span>
                  <span>{curRet < 0 ? "Recuperación / Take Profit" : "Take Profit (Ganancia)"}</span>
                </div>
                <span style={{ fontSize: "0.64rem", opacity: 0.85, fontWeight: 500 }}>
                  Dispara cuando el precio SUBA desde ${curP.toFixed(2)} (Cruce Alcista ↑)
                </span>
              </button>

              <button
                type="button"
                onClick={handleSelectStopLoss}
                style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  border: alertType === "STOP_LOSS"
                    ? "1.5px solid #ef4444"
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "STOP_LOSS"
                    ? isLight ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "STOP_LOSS" ? (isLight ? "#b91c1c" : "#f87171") : "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: "0.8rem" }}>
                  <span>🛑</span>
                  <span>Stop Loss (Protección Caída)</span>
                </div>
                <span style={{ fontSize: "0.64rem", opacity: 0.85, fontWeight: 500 }}>
                  Dispara si el precio CAE aún más desde ${curP.toFixed(2)} (Cruce Bajista ↓)
                </span>
              </button>
            </div>
          </div>

          {/* Target Value Input + Technical Trigger Metrics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>
                2. Umbral de Rentabilidad Objetivo (ROI_obj sobre P₀)
              </label>
              {calculatedTriggerPrice > 0 && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: alertType === "PROFIT_TARGET" ? "#10b981" : "#ef4444",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Precio Gatillo (P_trigger): ${calculatedTriggerPrice.toFixed(2)}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                border: `1.5px solid ${
                  isInvalidDirection
                    ? "#f59e0b"
                    : alertType === "PROFIT_TARGET"
                      ? "rgba(16, 185, 129, 0.45)"
                      : "rgba(239, 68, 68, 0.45)"
                }`,
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
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  marginLeft: 8,
                }}
              >
                Δ Spot: {spotDeltaPct >= 0 ? "+" : ""}{spotDeltaPct.toFixed(2)}% ({spotDeltaUsd >= 0 ? "+" : ""}${spotDeltaUsd.toFixed(2)})
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: 600 }}>
                {alertType === "PROFIT_TARGET" ? "Niveles de Subida:" : "Niveles de Corte (Stop):"}
              </span>
              {activePresets.map((preset) => (
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
                    border: `1px solid ${
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? "#10b981"
                          : "#ef4444"
                        : isLight
                          ? "rgba(0,0,0,0.1)"
                          : "rgba(255,255,255,0.08)"
                    }`,
                    background:
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? "rgba(16, 185, 129, 0.16)"
                          : "rgba(239, 68, 68, 0.16)"
                        : "transparent",
                    color:
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? isLight ? "#047857" : "#34d399"
                          : isLight ? "#b91c1c" : "#f87171"
                        : "var(--text-secondary)",
                  }}
                >
                  {preset > 0 ? `+${preset}%` : `${preset}%`}
                </button>
              ))}
            </div>

            {/* Technical Diagnostic & Execution Logic Box */}
            <div
              style={{
                marginTop: 4,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: "0.73rem",
                lineHeight: 1.45,
                background: isInvalidDirection
                  ? isLight ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.12)"
                  : alertType === "PROFIT_TARGET"
                    ? isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.1)"
                    : isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${
                  isInvalidDirection
                    ? "rgba(245, 158, 11, 0.4)"
                    : alertType === "PROFIT_TARGET"
                      ? "rgba(16, 185, 129, 0.3)"
                      : "rgba(239, 68, 68, 0.3)"
                }`,
                color: "var(--text-secondary)",
              }}
            >
              {alertType === "PROFIT_TARGET" ? (
                numTarget <= curRet ? (
                  <>
                    ⚠️ <strong>Atención Técnica (Umbral ya superado):</strong> El objetivo{" "}
                    <strong>{numTarget}%</strong> es menor o igual a tu retorno actual (<strong>{curRet.toFixed(2)}%</strong>).
                    Para que actúe como alerta de subida/recuperación, elige un porcentaje <strong>mayor a {curRet.toFixed(2)}%</strong> (ej. <strong>{defaultProfitTarget}%</strong>).
                  </>
                ) : (
                  <>
                    <div>
                      📈 <strong>Modo Recuperación / Take Profit (Cruce Alcista):</strong> Se activará cuando la cotización Spot suba un{" "}
                      <strong>+{spotDeltaPct.toFixed(2)}%</strong> adicional desde <strong>${curP.toFixed(2)}</strong> hasta tocar{" "}
                      <strong>${calculatedTriggerPrice.toFixed(2)}</strong>.
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Fórmula: P_trigger = P₀ (${entP.toFixed(2)}) × [1 + ({numTarget}% / 100)] = ${calculatedTriggerPrice.toFixed(2)} • Dispara si ROI ≥ {numTarget}%
                    </div>
                  </>
                )
              ) : numTarget >= curRet ? (
                <>
                  ⚠️ <strong>Atención Técnica (Stop Loss por encima del precio actual):</strong> Tu retorno actual ya es{" "}
                  <strong>{curRet.toFixed(2)}%</strong> (${curP.toFixed(2)}), por lo que un Stop Loss en{" "}
                  <strong>{numTarget}%</strong> (${calculatedTriggerPrice.toFixed(2)}) se dispararía de inmediato.
                  Si quieres protegerte de una caída mayor, usa un nivel <strong>menor a {curRet.toFixed(2)}%</strong> (ej.{" "}
                  <strong
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                    onClick={() => setTargetValue(defaultStopLoss)}
                  >
                    {defaultStopLoss}%
                  </strong>
                  ). Si buscas que te avise cuando suba a {numTarget}%, selecciona <strong>🎯 Recuperación / Take Profit</strong>.
                </>
              ) : (
                <>
                  <div>
                    🛑 <strong>Modo Stop Loss / Control de Drawdown (Cruce Bajista):</strong> Se activará si la cotización Spot cae un{" "}
                    <strong>{spotDeltaPct.toFixed(2)}%</strong> adicional desde <strong>${curP.toFixed(2)}</strong> hasta tocar{" "}
                    <strong>${calculatedTriggerPrice.toFixed(2)}</strong> o menos.
                  </div>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                    Fórmula: P_trigger = P₀ (${entP.toFixed(2)}) × [1 + ({numTarget}% / 100)] = ${calculatedTriggerPrice.toFixed(2)} • Dispara si ROI ≤ {numTarget}%
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notification Channels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
            <label style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>
              3. Canales de Despacho (Webhook In-App & SMTP)
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.8rem" }}>
                <input
                  type="checkbox"
                  checked={notifyApp}
                  onChange={(e) => setNotifyApp(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Notificación emergente en terminal (In-App Toast Banner)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.8rem" }}>
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Despacho de reporte técnico al correo electrónico (SMTP)</span>
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
                    fontSize: "0.8rem",
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
              marginTop: 6,
              gap: 12,
            }}
          >
            {initialAlert?.id && (
              <button
                type="button"
                onClick={async () => {
                  if (onDelete) {
                    await onDelete(initialAlert.id, isParentGroup ? ticker : null);
                    onClose();
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "8px 10px",
                }}
              >
                🗑️ Eliminar {isParentGroup ? "Todas" : "Alerta"}
              </button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "0.8rem" }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSaving || isInvalidDirection}
                className="btn btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: isInvalidDirection ? 0.5 : 1,
                  cursor: isInvalidDirection ? "not-allowed" : "pointer",
                }}
              >
                {isSaving
                  ? "Guardando..."
                  : isParentGroup
                    ? "Guardar en Todos los Lotes"
                    : "Guardar en Este Lote"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

