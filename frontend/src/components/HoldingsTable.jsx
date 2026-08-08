/**
 * HoldingsTable — breakdown of individual holdings.
 * Shows ticker, weight, shares, start/current price, value, return %.
 */
export default function HoldingsTable({ holdings, investment, numSlots }) {
  if (!holdings?.length) return null;

  const slotValue = investment / numSlots;

  return (
    <div>
      <h3 style={{ marginBottom: '12px' }}>Detalle de posiciones</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Ticker', 'Peso', 'Acciones', 'Precio inicio', 'Precio actual', 'Valor actual', 'Retorno'].map((h) => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: h === 'Ticker' ? 'left' : 'right',
                  color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const returnPct = h.return_pct ?? 0;
              const isGain = returnPct >= 0;
              return (
                <tr
                  key={h.ticker}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    transition: 'background var(--duration) var(--ease)',
                    animation: `fadeUp 0.3s ${i * 30}ms both`,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.02em' }}>
                      {h.ticker}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    <span className="mono">{h.weight ? h.weight.toFixed(2) : (1 / numSlots * 100).toFixed(2)}%</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>{h.shares?.toFixed(4)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>
                      {h.start_price !== undefined ? `$${h.start_price.toFixed(2)}` : 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>${h.current_price?.toFixed(2)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>${h.current_value?.toFixed(2)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {h.return_pct !== undefined ? (
                      <span className={`badge ${isGain ? 'gain' : 'loss'}`}>
                        {isGain ? '▲' : '▼'} {Math.abs(returnPct).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(107,114,128,0.15)', color: 'var(--neutral)' }}>N/A</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Cash row for unallocated slot */}
            <tr style={{ borderBottom: '1px solid var(--border)', opacity: 0.45 }}>
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Q (cash reservado)
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>{(1 / numSlots * 100).toFixed(2)}%</span>
              </td>
              <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                <span className="mono">${slotValue.toFixed(2)}</span>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <span className="badge" style={{ background: 'rgba(107,114,128,0.15)', color: 'var(--neutral)' }}>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
