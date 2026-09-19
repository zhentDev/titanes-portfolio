import { useEffect, useRef, useState } from "react";
import { FINANCIAL_CONCEPTS } from "../../data/financialConcepts";
import { useTheme } from "../../context/ThemeContext";

/**
 * Componente InfoTooltip
 * Muestra un botón o disparador discreto (ícono ℹ️ o badge / texto subrayado).
 * Al hacer hover (o click), despliega un popover flotante glassmorphism con:
 * - Título del concepto
 * - Tag descriptivo de categoría
 * - Explicación detallada
 * - Regla práctica o cómo interpretarlo
 *
 * Props:
 * - conceptKey: Clave del concepto en FINANCIAL_CONCEPTS (ej: "sharpe_ratio")
 * - customContent: Objeto alternativo { title, tag, tagColor, explanation, rule }
 * - children: Si se pasa contenido, envuelve ese contenido como activador de hover.
 * - position: 'top' | 'bottom' | 'left' | 'right' (default: 'top')
 * - icon: Ícono a mostrar si no hay children (default: "ℹ️")
 * - size: 'sm' | 'md' (default: 'sm')
 */
export default function InfoTooltip({
  conceptKey,
  customContent,
  children,
  position = "top",
  icon = "ℹ️",
  size = "sm",
  style = {},
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const data = customContent || (conceptKey ? FINANCIAL_CONCEPTS[conceptKey] : null);

  if (!data) return children || null;

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

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  // Dynamic calculation to prevent tooltip clipping on screen edges
  const [popoverCoords, setPopoverCoords] = useState(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipWidth = 290;
    const padding = 12;

    // Detect if opening on top would overflow viewport top
    const spaceAbove = rect.top;
    const showOnBottom = position === "bottom" || spaceAbove < 180;

    // Horizontal centering & clamp within viewport
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < padding) left = padding;
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }

    setPopoverCoords({
      top: showOnBottom ? rect.bottom + 8 : undefined,
      bottom: showOnBottom ? undefined : window.innerHeight - rect.top + 8,
      left,
    });
  }, [isOpen, position]);

  return (
    <span
      ref={containerRef}
      className="info-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        cursor: "help",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {children ? (
        <span
          className="info-tooltip-trigger-custom"
          style={{
            borderBottom: isLight ? "1px dashed rgba(0, 0, 0, 0.25)" : "1px dashed rgba(255, 255, 255, 0.35)",
            paddingBottom: "1px",
            transition: "border-color 0.2s ease",
          }}
        >
          {children}
        </span>
      ) : (
        <span
          className="info-tooltip-btn"
          title={data.title}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size === "sm" ? 18 : 22,
            height: size === "sm" ? 18 : 22,
            fontSize: size === "sm" ? "0.68rem" : "0.78rem",
            borderRadius: "50%",
            background: isLight ? "rgba(0, 120, 180, 0.1)" : "rgba(255, 255, 255, 0.08)",
            color: "var(--text-secondary)",
            border: isLight ? "1px solid rgba(0, 120, 180, 0.3)" : "1px solid rgba(255, 255, 255, 0.15)",
            lineHeight: 1,
            userSelect: "none",
            transition: "all 0.2s ease",
            marginLeft: 4,
          }}
        >
          {icon}
        </span>
      )}

      {/* Popover Box */}
      {isOpen && popoverCoords && (
        <div
          className="info-tooltip-popover fade-up"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popoverCoords.top,
            bottom: popoverCoords.bottom,
            left: popoverCoords.left,
            zIndex: 999999,
            width: 290,
            maxWidth: "calc(100vw - 24px)",
            background: isLight ? "rgba(255, 255, 255, 0.98)" : "rgba(10, 15, 29, 0.96)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: isLight ? "1px solid rgba(0, 120, 180, 0.25)" : "1px solid rgba(0, 229, 255, 0.35)",
            borderRadius: "12px",
            padding: "14px 16px",
            boxShadow: isLight
              ? "0 8px 24px rgba(0, 0, 0, 0.12), 0 0 12px rgba(0, 120, 180, 0.08)"
              : "0 12px 36px rgba(0, 0, 0, 0.75), 0 0 20px rgba(0, 229, 255, 0.12)",
            textAlign: "left",
            pointerEvents: "auto",
            fontSize: "0.8rem",
            color: isLight ? "#1e293b" : "#f1f5f9",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              paddingBottom: 6,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: "0.85rem",
                color: isLight ? "#0f172a" : "#fff",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              💡 {data.title}
            </span>
            {data.tag && (
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.06)",
                  color: data.tagColor || "var(--accent-primary)",
                  border: `1px solid ${data.tagColor || "var(--accent-primary)"}44`,
                  whiteSpace: "nowrap",
                }}
              >
                {data.tag}
              </span>
            )}
          </div>

          {/* Explanation */}
          <p
            style={{
              margin: "0 0 10px 0",
              lineHeight: 1.45,
              color: isLight ? "#475569" : "#cbd5e1",
              fontSize: "0.78rem",
            }}
          >
            {data.explanation}
          </p>

          {/* Rule / How to read */}
          {data.rule && (
            <div
              style={{
                background: isLight ? "rgba(0, 120, 180, 0.06)" : "rgba(0, 229, 255, 0.06)",
                borderLeft: "3px solid var(--accent-primary)",
                padding: "6px 10px",
                borderRadius: "0 6px 6px 0",
                fontSize: "0.73rem",
                lineHeight: 1.4,
                color: isLight ? "#64748b" : "#94a3b8",
              }}
            >
              <strong style={{ color: "var(--accent-primary)", display: "block", marginBottom: 2 }}>
                🎯 Interpretación práctica:
              </strong>
              {data.rule}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
