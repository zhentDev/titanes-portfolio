import { useEffect, useRef, useState } from "react";
import { getMarketSchedule } from "../../utils/marketHours";

/**
 * Componente MarketScheduleBadge
 * Muestra el estado del mercado (Abierto / Cerrado / Receso) para cualquier acción o ETF,
 * y al pasar el mouse (o tocar en móvil) despliega una ventana flotante con:
 * - Nombre de la Bolsa y bandera
 * - Horario local de la bolsa y horario equivalente en Colombia (UTC-5)
 * - Hora actual de la bolsa vs hora de Colombia
 * - Explicación detallada y nota aclaratoria para brokers como XTB
 */
export default function MarketScheduleBadge({
  ticker = "",
  exchange = "",
  showText = true,
  size = "sm",
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const sched = getMarketSchedule(ticker, exchange);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsOpen(true), 120);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isOpen]);

  const dotColor = sched.isOpen ? "#22c55e" : sched.isLunch ? "#f59e0b" : "#ef4444";
  const badgeBg = sched.isOpen
    ? "rgba(34, 197, 94, 0.12)"
    : sched.isLunch
      ? "rgba(245, 158, 11, 0.12)"
      : "rgba(239, 68, 68, 0.12)";
  const badgeBorder = sched.isOpen
    ? "rgba(34, 197, 94, 0.3)"
    : sched.isLunch
      ? "rgba(245, 158, 11, 0.3)"
      : "rgba(239, 68, 68, 0.3)";
  const textColor = sched.isOpen ? "#4ade80" : sched.isLunch ? "#fbbf24" : "#f87171";

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        ...style,
      }}
    >
      {/* Trigger Badge */}
      <span
        style={{
          fontSize: size === "xs" ? "0.62rem" : "0.68rem",
          padding: size === "xs" ? "1px 5px" : "2px 7px",
          borderRadius: 4,
          background: badgeBg,
          border: `1px solid ${badgeBorder}`,
          fontWeight: 700,
          color: textColor,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          transition: "all 0.15s ease",
          userSelect: "none",
        }}
        title="Clic o pasar cursor para ver horarios del mercado"
      >
        <span
          style={{
            width: size === "xs" ? 5 : 6,
            height: size === "xs" ? 5 : 6,
            borderRadius: "50%",
            background: dotColor,
            boxShadow: sched.isOpen ? "0 0 6px #22c55e" : "none",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        {showText && <span>{sched.statusText}</span>}
      </span>

      {/* Floating Popover Modal */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 9999,
            width: "320px",
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(26, 35, 60, 0.98) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            boxShadow: "0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 229, 255, 0.12)",
            borderRadius: "10px",
            padding: "14px 16px",
            backdropFilter: "blur(16px)",
            pointerEvents: "auto",
            animation: "fadeInUp 0.18s ease-out forwards",
            color: "#f1f5f9",
            fontSize: "0.78rem",
            lineHeight: 1.45,
            textAlign: "left",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: "0.85rem" }}>
              <span>{sched.flag}</span>
              <span style={{ color: "#f8fafc" }}>{sched.name}</span>
            </div>
            <span
              style={{
                fontSize: "0.62rem",
                padding: "2px 6px",
                borderRadius: 4,
                background: badgeBg,
                color: textColor,
                border: `1px solid ${badgeBorder}`,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {sched.statusText}
            </span>
          </div>

          {/* Horarios Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
            {/* Horario Colombia */}
            <div style={{ background: "rgba(0, 229, 255, 0.06)", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(0, 229, 255, 0.2)" }}>
              <div style={{ fontSize: "0.68rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                🇨🇴 Horario Colombia (Tu Zona)
              </div>
              <div className="mono" style={{ fontSize: "0.8rem", color: "#f1f5f9", fontWeight: 600 }}>
                {sched.colombiaHours}
              </div>
            </div>

            {/* Horario Local Bolsa */}
            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                🏛️ Horario Local de la Bolsa
              </div>
              <div className="mono" style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                {sched.localHours} ({sched.currentLocalTime} local)
              </div>
            </div>
          </div>

          {/* Notas para Brokers como XTB */}
          {sched.brokerNotes && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: "0.7rem",
                color: "#fde68a",
                lineHeight: 1.35,
              }}
            >
              <strong style={{ color: "#fbbf24" }}>ℹ️ Nota XTB / Brokers: </strong>
              {sched.brokerNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
