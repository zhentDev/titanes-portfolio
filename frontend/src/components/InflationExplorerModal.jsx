import { useEffect, useMemo, useState } from "react";
import { fetchColInflationHistory } from "../api/client";

export default function InflationExplorerModal({ isOpen, onClose, inflationData }) {
  const [filterYear, setFilterYear] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [internalData, setInternalData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      isOpen &&
      (!inflationData || !inflationData.monthly_rates || inflationData.monthly_rates.length === 0)
    ) {
      if (!internalData) {
        setLoading(true);
        fetchColInflationHistory()
          .then((res) => setInternalData(res))
          .catch(console.error)
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, inflationData, internalData]);

  const activeData = (inflationData?.monthly_rates?.length ? inflationData : internalData) || {};
  const monthlyRates = activeData?.monthly_rates || [];
  const latest = activeData?.latest || {};

  const years = useMemo(() => {
    const ySet = new Set();
    monthlyRates.forEach((r) => {
      if (r.date) ySet.add(r.date.slice(0, 4));
    });
    return ["ALL", ...Array.from(ySet).sort().reverse()];
  }, [monthlyRates]);

  const filteredRates = useMemo(() => {
    return monthlyRates.filter((r) => {
      const matchYear = filterYear === "ALL" || r.date.startsWith(filterYear);
      const matchSearch = !searchTerm || r.date.includes(searchTerm);
      return matchYear && matchSearch;
    });
  }, [monthlyRates, filterYear, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 20,
      }}
    >
      <div
        className="card fade-up"
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "#131b2e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 0,
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: "#f1f5f9",
                fontSize: "1.2rem",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🇨🇴 Historial de Inflación e IPC de Colombia
            </h3>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Fuente oficial: DANE / Reserva Federal (FRED Series: COLCPALTT01IXOBM)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              color: "#94a3b8",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Latest KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: "16px 24px",
            background: "rgba(0,0,0,0.25)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Inflación Interanual (12M)
            </div>
            <div
              className="mono"
              style={{ fontSize: "1.35rem", fontWeight: 800, color: "#f59e0b", marginTop: 4 }}
            >
              {latest.yoy != null ? `${latest.yoy}%` : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
              Tasa Anualizada Último Mes
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Variación Mensual (MoM)
            </div>
            <div
              className="mono"
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: (latest.mom ?? 0) >= 0 ? "#38bdf8" : "#4ade80",
                marginTop: 4,
              }}
            >
              {latest.mom != null ? `${latest.mom > 0 ? "+" : ""}${latest.mom}%` : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
              Mes contra mes anterior
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Último Índice IPC
            </div>
            <div
              className="mono"
              style={{ fontSize: "1.35rem", fontWeight: 800, color: "#f1f5f9", marginTop: 4 }}
            >
              {latest.cpi != null ? Number(latest.cpi).toFixed(2) : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
              Período: {latest.date || "Reciente"}
            </div>
          </div>
        </div>

        {/* Filters and Navigation */}
        <div
          style={{
            padding: "12px 24px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Filtrar Año:</span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="input"
              style={{ padding: "4px 10px", fontSize: "0.82rem", height: 32 }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y === "ALL" ? "Todos los Años" : y}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="Buscar fecha (ej. 2024-05)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ flex: 1, padding: "4px 12px", fontSize: "0.82rem", height: 32 }}
          />

          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {filteredRates.length} meses listados
          </span>
        </div>

        {/* Explanation & Formula Banner */}
        <div
          style={{
            padding: "10px 24px",
            background: "rgba(245, 158, 11, 0.05)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.15)",
            fontSize: "0.78rem",
            color: "#fde68a",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>📐</span>
          <div>
            <strong>Fórmula de Descuento:</strong>{" "}
            <code
              style={{
                color: "#fff",
                background: "rgba(0,0,0,0.3)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Factor = IPC_Actual ÷ IPC_Compra
            </code>{" "}
            ➔{" "}
            <code
              style={{
                color: "#fff",
                background: "rgba(0,0,0,0.3)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Ganancia Real = (Valor COP ÷ Factor) - Inversión COP
            </code>
            .
          </div>
        </div>

        {/* Scrollable Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px 24px", minHeight: 260 }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 260,
                gap: 12,
                color: "var(--text-muted)",
              }}
            >
              <div className="spinner" />
              <span>Cargando serie histórica de inflación (FRED/DANE)...</span>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
                textAlign: "left",
                marginTop: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    color: "var(--text-muted)",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <th style={{ padding: "8px 12px" }}>Período (Mes)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Índice IPC</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Var. Mensual (MoM)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Var. Anual (YoY)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((r, idx) => (
                  <tr
                    key={r.date}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    }}
                  >
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#f1f5f9" }}>
                      📅 {r.date}
                    </td>
                    <td
                      className="mono"
                      style={{ padding: "8px 12px", textAlign: "right", color: "#94a3b8" }}
                    >
                      {r.cpi.toFixed(2)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: r.mom >= 0 ? "#38bdf8" : "#4ade80",
                      }}
                    >
                      {r.mom > 0 ? "+" : ""}
                      {r.mom}%
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: r.yoy > 0 ? "#f59e0b" : "#94a3b8",
                      }}
                    >
                      {r.yoy > 0 ? "+" : ""}
                      {r.yoy}%
                    </td>
                  </tr>
                ))}
                {filteredRates.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}
                    >
                      No se encontraron registros para el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            💡 Este índice se cruza automáticamente con la fecha de tus lotes para descontar la
            pérdida de poder adquisitivo.
          </span>
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: "6px 18px", fontSize: "0.82rem" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
