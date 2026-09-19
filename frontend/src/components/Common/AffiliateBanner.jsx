import React, { useState } from "react";
import { useTheme } from "../../context/ThemeContext";

export default function AffiliateBanner({ style = {} }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
        padding: "14px 20px",
        margin: "18px 0",
        borderRadius: "var(--radius)",
        background: isLight
          ? "linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)"
          : "linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(16, 185, 129, 0.12) 100%)",
        border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 229, 255, 0.25)"}`,
        boxShadow: isLight
          ? "0 4px 14px rgba(0, 0, 0, 0.04)"
          : "0 4px 20px rgba(0, 229, 255, 0.06)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
        <div
          style={{
            fontSize: "1.8rem",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          🚀
        </div>
        <div>
          <div
            style={{
              fontSize: "0.92rem",
              fontWeight: 700,
              color: isLight ? "#0f172a" : "#f1f5f9",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Invierte en Wall Street sin comisiones</span>
            <span
              style={{
                fontSize: "0.65rem",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(16, 185, 129, 0.2)",
                color: isLight ? "#059669" : "#34d399",
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              0% Comisión
            </span>
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: isLight ? "#475569" : "var(--text-secondary)",
              marginTop: 2,
            }}
          >
            Abre tu cuenta de inversión internacional en Interactive Brokers o XTB y opera ETFs y acciones de Kpital Zhent.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <a
          href="https://www.interactivebrokers.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{
            textDecoration: "none",
            fontSize: "0.8rem",
            padding: "8px 16px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <span>Abrir Cuenta →</span>
        </a>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "none",
            color: isLight ? "#94a3b8" : "#64748b",
            fontSize: "1.1rem",
            cursor: "pointer",
            padding: "4px 8px",
            lineHeight: 1,
          }}
          title="Ocultar anuncio"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
