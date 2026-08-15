export default function HoldingsTable({
  holdings,
  investment,
  numSlots,
  onToggleTicker,
  unit = "pct",
  onToggleUnit,
}) {
  if (!holdings?.length) return null;

  const slotValue = investment / numSlots;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
          Detalle de Posiciones Activas
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Unidad:</span>
          <div
            className="unit-toggle"
            onClick={onToggleUnit}
            title="Alternar entre Porcentaje y Dólares"
          >
            <button className={`unit-btn ${unit === "pct" ? "active" : ""}`}>%</button>
            <button className={`unit-btn ${unit === "usd" ? "active" : ""}`}>$</button>
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                "Simulación",
                "Empresa / Ticker",
                "Sector",
                "Peso",
                "Acciones",
                "Precio inicio",
                "Precio actual",
                "Valor actual",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign:
                      h === "Simulación" || h.startsWith("Empresa") || h === "Sector"
                        ? "left"
                        : "right",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  color: "var(--accent-primary)",
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
                onClick={onToggleUnit}
                title="Haz clic para alternar entre % y $"
              >
                Retorno ({unit === "pct" ? "%" : "$"}) ⇄
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const isSelected = h.selected !== false;
              const returnPct = h.return_pct ?? 0;
              const returnUsd = h.return_usd ?? (h.current_price - h.start_price) * (h.shares || 0);
              const isGain = (unit === "pct" ? returnPct : returnUsd) >= 0;
              return (
                <tr
                  key={h.ticker}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    transition: "all var(--duration) var(--ease)",
                    animation: `fadeUp 0.3s ${i * 25}ms both`,
                    cursor: "pointer",
                    opacity: isSelected ? 1 : 0.45,
                    background: isSelected ? "transparent" : "rgba(255,255,255,0.01)",
                  }}
                  onClick={() => onToggleTicker && onToggleTicker(h.ticker)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = isSelected
                      ? "transparent"
                      : "rgba(255,255,255,0.01)")
                  }
                >
                  {/* Simulation Checkbox Toggle */}
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{
                          cursor: "pointer",
                          accentColor: "var(--accent-primary)",
                          width: 15,
                          height: 15,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: isSelected ? "var(--gain)" : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {isSelected ? "Activa" : "Excluida"}
                      </span>
                    </div>
                  </td>

                  {/* Ticker + Company Name */}
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: isSelected ? "var(--accent-primary)" : "var(--text-muted)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {h.ticker}
                        </span>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "rgba(255,255,255,0.06)",
                            color: "#94a3b8",
                          }}
                        >
                          {h.exchange || "US"}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "180px",
                        }}
                      >
                        {h.name || h.ticker}
                      </span>
                    </div>
                  </td>

                  {/* Sector */}
                  <td style={{ padding: "10px 12px", color: "#94a3b8", fontSize: "0.75rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: "12px",
                        background: "rgba(0, 229, 255, 0.05)",
                        border: "1px solid rgba(0, 229, 255, 0.12)",
                        color: "var(--accent-primary)",
                        fontSize: "0.7rem",
                      }}
                    >
                      {h.sector || "Tecnología"}
                    </span>
                  </td>

                  {/* Weight */}
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span className="mono">
                      {isSelected
                        ? h.weight
                          ? h.weight.toFixed(2)
                          : ((1 / numSlots) * 100).toFixed(2)
                        : "0.00"}
                      %
                    </span>
                  </td>

                  {/* Shares */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span className="mono" style={{ color: "var(--text-secondary)" }}>
                      {isSelected ? h.shares?.toFixed(4) : "—"}
                    </span>
                  </td>

                  {/* Start Price */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span className="mono" style={{ color: "var(--text-muted)" }}>
                      {h.start_price !== undefined ? `$${h.start_price.toFixed(2)}` : "N/A"}
                    </span>
                  </td>

                  {/* Current Price */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span
                      className="mono"
                      style={{ color: "var(--text-primary)", fontWeight: 600 }}
                    >
                      ${h.current_price?.toFixed(2)}
                    </span>
                  </td>

                  {/* Current Value */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      ${isSelected ? h.current_value?.toFixed(2) : "0.00"}
                    </span>
                  </td>

                  {/* Return % or $ */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {isSelected ? (
                      <span
                        className={`badge ${isGain ? "gain" : "loss"}`}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleUnit && onToggleUnit();
                        }}
                      >
                        {isGain ? "▲" : "▼"}{" "}
                        {unit === "pct"
                          ? `${Math.abs(returnPct).toFixed(2)}%`
                          : `$${Math.abs(returnUsd).toFixed(2)}`}
                      </span>
                    ) : (
                      <span
                        className="badge"
                        style={{ background: "rgba(107,114,128,0.15)", color: "var(--neutral)" }}
                      >
                        Excluida
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Cash row for unallocated slots */}
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "rgba(255,255,255,0.015)",
              }}
            >
              <td style={{ padding: "10px 12px" }}>
                <span
                  className="badge"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
                >
                  Liquidez
                </span>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                    Q (Cash Reservado)
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    Slots vacíos pendientes de asignar
                  </span>
                </div>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Flat Cash</span>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                <span className="mono" style={{ color: "var(--text-muted)" }}>
                  {(((numSlots - holdings.length) / numSlots) * 100).toFixed(2)}%
                </span>
              </td>
              <td
                colSpan={4}
                style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}
              >
                <span className="mono" style={{ fontWeight: 600 }}>
                  ${(slotValue * (numSlots - holdings.length)).toFixed(2)}
                </span>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                <span
                  className="badge"
                  style={{ background: "rgba(107,114,128,0.15)", color: "var(--neutral)" }}
                >
                  {unit === "pct" ? "0.00%" : "$0.00"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
