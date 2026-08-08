import { useState } from 'react';

const MM20_STOCKS = [
  { ticker: 'ARLP', name: 'Alliance Resource Partners', sector: 'Energía / Carbón', pe: '12.0x', weight: 5.0, return_pct: 18.4, shares: 2.15, price: 23.25 },
  { ticker: 'ACLS', name: 'Axcelis Technologies', sector: 'Semiconductores', pe: '46.7x', weight: 5.0, return_pct: 34.2, shares: 0.62, price: 80.50 },
  { ticker: 'BHC', name: 'Bausch Health', sector: 'Salud / Farmacéutica', pe: '-2.1x', weight: 5.0, return_pct: -6.4, shares: 6.85, price: 7.30 },
  { ticker: 'DIOD', name: 'Diodes Inc', sector: 'Semiconductores', pe: '56.3x', weight: 5.0, return_pct: 12.8, shares: 0.74, price: 67.40 },
  { ticker: 'HAE', name: 'Haemonetics Corp', sector: 'Dispositivos Médicos', pe: '41.5x', weight: 5.0, return_pct: 8.5, shares: 0.65, price: 76.80 },
  { ticker: 'NSIT', name: 'Insight Enterprises', sector: 'Soluciones IT & Cloud', pe: '21.4x', weight: 5.0, return_pct: 22.1, shares: 0.28, price: 178.50 },
  { ticker: 'POWI', name: 'Power Integrations', sector: 'Semiconductores de Potencia', pe: '143.6x', weight: 5.0, return_pct: 14.6, shares: 0.78, price: 64.10 },
  { ticker: 'VECO', name: 'Veeco Instruments', sector: 'Equipamiento de Semiconductores', pe: '138.8x', weight: 5.0, return_pct: 42.1, shares: 1.25, price: 40.20 },
  { ticker: 'OSK', name: 'Oshkosh Corp', sector: 'Maquinaria Industrial', pe: '17.2x', weight: 5.0, return_pct: 19.3, shares: 0.42, price: 119.00 },
  { ticker: 'SM', name: 'SM Energy', sector: 'Petróleo & Gas', pe: '6.9x', weight: 5.0, return_pct: 11.2, shares: 1.15, price: 43.50 },
];

export default function MidCapsStrategy({ onBack }) {
  const [holdings, setHoldings] = useState(
    MM20_STOCKS.map((s) => ({ ...s, selected: true }))
  );
  const [simulatedCapital, setSimulatedCapital] = useState(1000);
  const [unit, setUnit] = useState('pct');
  const [newTickerInput, setNewTickerInput] = useState('');

  const numSlots = 20;
  const activeCount = holdings.filter((h) => h.selected).length;
  const slotValue = simulatedCapital / numSlots;
  const activeInvested = activeCount * slotValue;
  const cashBuffer = simulatedCapital - activeInvested;

  const toggleTicker = (ticker) => {
    setHoldings((prev) =>
      prev.map((h) => (h.ticker === ticker ? { ...h, selected: !h.selected } : h))
    );
  };

  const addCustomStock = (e) => {
    e.preventDefault();
    if (!newTickerInput.trim()) return;
    const t = newTickerInput.trim().toUpperCase();
    if (holdings.some((h) => h.ticker === t)) return;
    setHoldings((prev) => [
      ...prev,
      {
        ticker: t,
        name: `${t} Holding`,
        sector: 'Mid-Cap Tech / Growth',
        pe: '25.0x',
        weight: 5.0,
        return_pct: 5.0,
        shares: 1.0,
        price: 50.0,
        selected: true,
      },
    ]);
    setNewTickerInput('');
  };

  // Average return of selected stocks
  const activeStocks = holdings.filter((h) => h.selected);
  const avgReturnPct =
    activeStocks.length > 0
      ? activeStocks.reduce((sum, h) => sum + h.return_pct, 0) / activeStocks.length
      : 0;

  const returnUsd = (avgReturnPct / 100) * activeInvested;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Strategy Header ──────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.4rem' }}>🇺🇸</span>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>
              Oportunidades en Mid-caps
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              MM20 PRO
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
              }}
            >
              👁️ Modo Vigilancia (Sin capital real)
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
            Estrategia de 20 posiciones equiponderadas frente al índice de referencia <strong>S&P MidCap 400</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', padding: '6px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Simulado en:</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>${simulatedCapital}</span>
          </div>

          <div className="unit-toggle" onClick={() => setUnit((u) => (u === 'pct' ? 'usd' : 'pct'))}>
            <button className={`unit-btn ${unit === 'pct' ? 'active' : ''}`}>%</button>
            <button className={`unit-btn ${unit === 'usd' ? 'active' : ''}`}>$</button>
          </div>
        </div>
      </div>

      {/* ── Summary Strip for Mid-caps ───────────────── */}
      <div className="summary-strip fade-up">
        <div className="summary-item">
          <div className="summary-label">Backtesting Histórico</div>
          <div className="summary-value large mono" style={{ color: 'var(--gain)', fontWeight: 800 }}>
            +1,062.6%
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">S&P MidCap 400 (Benchmark)</div>
          <div className="summary-value mono" style={{ color: '#fbbf24', fontWeight: 700 }}>
            +280.8%
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Alfa Histórico vs Benchmark</div>
          <div className="summary-value mono">
            <span className="badge gain" style={{ fontSize: '0.9rem', padding: '3px 8px' }}>
              +781.8%
            </span>
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Rendimiento Simulado Actual</div>
          <div className="summary-value mono">
            <span className="badge gain" style={{ fontSize: '0.9rem', padding: '3px 8px' }}>
              ▲ {unit === 'pct' ? `+${avgReturnPct.toFixed(2)}%` : `+$${returnUsd.toFixed(2)}`}
            </span>
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Slots Asignados</div>
          <div className="summary-value mono">
            {activeCount}/{numSlots} ({((activeCount / numSlots) * 100).toFixed(0)}%)
          </div>
        </div>
      </div>

      {/* ── Mid-caps Constituent Holdings & Position Simulator ── */}
      <div className="card fade-up" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Acciones Actuales en MM20 ({activeCount} activas)
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Haz clic en cualquier acción para simular incluirla o excluirla de la cesta
            </span>
          </div>

          {/* Quick simulator input */}
          <form onSubmit={addCustomStock} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Añadir ticker (ej. SM)..."
              value={newTickerInput}
              onChange={(e) => setNewTickerInput(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 10px',
                color: '#fff',
                fontSize: '0.75rem',
                fontFamily: "'JetBrains Mono', monospace",
                width: 170,
              }}
            />
            <button type="submit" className="btn btn-sm btn-ghost" style={{ fontSize: '0.75rem' }}>
              + Simular
            </button>
          </form>
        </div>

        {/* Ticker chips bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '16px' }}>
          {holdings.map((h) => {
            const isGain = h.return_pct >= 0;
            return (
              <button
                key={h.ticker}
                className={`ticker-chip ${h.selected ? 'active' : 'inactive'}`}
                onClick={() => toggleTicker(h.ticker)}
                style={{
                  background: h.selected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
                  borderColor: h.selected ? 'rgba(16, 185, 129, 0.4)' : 'var(--border)',
                  color: h.selected ? 'var(--gain)' : 'var(--text-muted)',
                }}
              >
                <span>{h.selected ? '✓' : '＋'}</span>
                <strong>{h.ticker}</strong>
                <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>
                  {isGain ? '+' : ''}{h.return_pct}%
                </span>
              </button>
            );
          })}
        </div>

        {/* Table of constituents */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Simulación', 'Empresa / Ticker', 'Sector', 'Ratio P/E', 'Peso %', 'Precio', 'Retorno Estimado'].map((head) => (
                  <th
                    key={head}
                    style={{
                      padding: '10px 12px',
                      textAlign: head === 'Simulación' || head.startsWith('Empresa') || head === 'Sector' ? 'left' : 'right',
                      color: 'var(--text-muted)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const isGain = h.return_pct >= 0;
                return (
                  <tr
                    key={h.ticker}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      opacity: h.selected ? 1 : 0.4,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleTicker(h.ticker)}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={h.selected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', accentColor: 'var(--gain)' }}
                        />
                        <span style={{ fontSize: '0.7rem', color: h.selected ? 'var(--gain)' : 'var(--text-muted)' }}>
                          {h.selected ? 'Vigilada' : 'Pausada'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: h.selected ? 'var(--gain)' : 'var(--text-muted)' }}>{h.ticker}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.05)',
                          color: '#cbd5e1',
                        }}
                      >
                        {h.sector}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="mono" style={{ color: '#fbbf24', fontWeight: 600 }}>{h.pe}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="mono">{h.selected ? `${h.weight.toFixed(1)}%` : '0.0%'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="mono">${h.price.toFixed(2)}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className={`badge ${isGain ? 'gain' : 'loss'}`}>
                        {isGain ? '▲ +' : '▼ '}{Math.abs(h.return_pct).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
