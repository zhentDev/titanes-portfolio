import { useState, useEffect } from 'react';
import { searchTicker } from '../api/client';

export default function DynamicStrategyView({ strategy, onDelete, onBack }) {
  if (!strategy) return null;

  const storageKey = `titanes_strat_${strategy.id}_rebalances`;
  const capitalKey = `titanes_strat_${strategy.id}_capital`;

  // Rebalance history for this specific custom strategy
  const [rebalances, setRebalances] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return [
      {
        rebalance_date: new Date().toISOString().split('T')[0],
        cash_added: 0,
        tickers: [],
      },
    ];
  });

  const [simulatedCapital, setSimulatedCapital] = useState(() => {
    try {
      const saved = localStorage.getItem(capitalKey);
      return saved ? Number(saved) : (strategy.capital || 1000);
    } catch {
      return strategy.capital || 1000;
    }
  });

  const numSlots = strategy.numSlots || 20;
  const [unit, setUnit] = useState('pct');

  // Form state to add new dated rebalance
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTickers, setFormTickers] = useState(() => {
    return rebalances.length > 0 ? [...(rebalances[rebalances.length - 1].tickers || [])] : [];
  });

  // Search & Batch paste input
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [batchInput, setBatchInput] = useState('');

  // Persist rebalances and capital
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(rebalances));
  }, [rebalances, storageKey]);

  useEffect(() => {
    localStorage.setItem(capitalKey, String(simulatedCapital));
  }, [simulatedCapital, capitalKey]);

  // Latest active rebalance
  const activeRebalance = rebalances[rebalances.length - 1] || { tickers: [], rebalance_date: date };
  const activeTickers = activeRebalance.tickers || [];
  const slotValue = simulatedCapital / numSlots;
  const activeInvested = activeTickers.length * slotValue;
  const cashBuffer = simulatedCapital - activeInvested;
  const weightPerSlot = (100 / numSlots).toFixed(1);

  const handleSearchAndAdd = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    const ticker = query.trim().toUpperCase();
    if (formTickers.includes(ticker)) {
      setSearchError(`${ticker} ya está en la lista`);
      return;
    }
    if (formTickers.length >= numSlots) {
      setSearchError(`Límite máximo de ${numSlots} slots alcanzado`);
      return;
    }

    setSearching(true);
    setSearchError('');
    try {
      const res = await searchTicker(ticker);
      if (res.valid) {
        setFormTickers((prev) => [...prev, res.ticker]);
        setQuery('');
      } else {
        setFormTickers((prev) => [...prev, ticker]);
        setQuery('');
      }
    } catch {
      setFormTickers((prev) => [...prev, ticker]);
      setQuery('');
    } finally {
      setSearching(false);
    }
  };

  const handleBatchAdd = () => {
    if (!batchInput.trim()) return;
    const extracted = batchInput
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && /^[A-Z0-9.-]+$/.test(t));

    const uniqueNew = extracted.filter((t) => !formTickers.includes(t));
    const combined = [...formTickers, ...uniqueNew].slice(0, numSlots);
    setFormTickers(combined);
    setBatchInput('');
  };

  const handleRemoveTicker = (ticker) => {
    setFormTickers((prev) => prev.filter((t) => t !== ticker));
  };

  const handleSaveRebalance = () => {
    if (!date) {
      alert('Por favor selecciona una fecha válida');
      return;
    }
    if (formTickers.length === 0) {
      alert('Debes agregar al menos 1 posición al rebalanceo');
      return;
    }

    const updated = [
      ...rebalances.filter((r) => r.rebalance_date !== date),
      {
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers,
      },
    ].sort((a, b) => (a.rebalance_date > b.rebalance_date ? 1 : -1));

    setRebalances(updated);
    alert(`Rebalanceo del ${date} guardado con éxito (${formTickers.length} posiciones)`);
  };

  const handleDeleteRebalance = (delDate) => {
    if (!confirm(`¿Eliminar el rebalanceo de la fecha ${delDate}?`)) return;
    setRebalances((prev) => prev.filter((r) => r.rebalance_date !== delDate));
  };

  const handleDeleteStrategy = () => {
    if (strategy.isSystem) {
      alert('Esta es una estrategia base del sistema y no puede eliminarse.');
      return;
    }
    if (confirm(`¿Estás seguro de eliminar por completo la estrategia "${strategy.name}"?`)) {
      onDelete(strategy.id);
    }
  };

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Strategy Header ──────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.5rem' }}>{strategy.country || '🌎'}</span>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#f1f5f9' }}>
              {strategy.name}
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(0, 229, 255, 0.2)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
              }}
            >
              {numSlots} SLOTS
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
              Benchmark: {strategy.benchmark || 'S&P 500'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
            Estrategia personalizada con {numSlots} posiciones equiponderadas ({weightPerSlot}% por slot).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Capital Simulado:</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>$</span>
            <input
              type="number"
              min={100}
              step={100}
              value={simulatedCapital}
              onChange={(e) => setSimulatedCapital(Number(e.target.value) || 1000)}
              style={{
                width: 90,
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 8px',
                color: 'var(--accent-primary)',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.9rem',
                textAlign: 'right',
              }}
            />
          </div>

          <div className="unit-toggle" onClick={() => setUnit((u) => (u === 'pct' ? 'usd' : 'pct'))}>
            <button className={`unit-btn ${unit === 'pct' ? 'active' : ''}`}>%</button>
            <button className={`unit-btn ${unit === 'usd' ? 'active' : ''}`}>$</button>
          </div>

          {!strategy.isSystem && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleDeleteStrategy}
              style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700 }}
              title="Eliminar esta estrategia personalizada"
            >
              🗑️ Eliminar Estrategia
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Strip ────────────────────────────── */}
      <div className="summary-strip fade-up">
        <div className="summary-item">
          <div className="summary-label">Capital Total Simulado</div>
          <div className="summary-value large mono" style={{ color: 'var(--accent-primary)', fontWeight: 800 }}>
            ${simulatedCapital.toFixed(2)}
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Capital Activo ({activeTickers.length}/{numSlots} Slots)</div>
          <div className="summary-value mono large" style={{ color: 'var(--gain)', fontWeight: 800 }}>
            ${activeInvested.toFixed(2)}
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Cash Reservado Q ({numSlots - activeTickers.length} Slots)</div>
          <div className="summary-value mono muted">
            ${cashBuffer.toFixed(2)}
          </div>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <div className="summary-label">Regla de Asignación</div>
          <div className="summary-value mono" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
            {weightPerSlot}% / slot (${slotValue.toFixed(2)})
          </div>
        </div>
      </div>

      {/* ── Constellation Grid Visualizer (Slots) ────── */}
      <div className="card fade-up" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🧩 Matriz de Asignación de {numSlots} Slots</span>
              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                1 / {numSlots} = {weightPerSlot}% Equiponderado
              </span>
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Cada posición ocupa exactamente 1 slot (${slotValue.toFixed(2)} / {weightPerSlot}%). Los slots vacíos se preservan en liquidez (Cash Q).
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {activeTickers.length} Asignados · {numSlots - activeTickers.length} en Cash
          </div>
        </div>

        {/* N-Slots Box Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '10px',
          }}
        >
          {Array.from({ length: numSlots }).map((_, i) => {
            const ticker = activeTickers[i];
            const isOccupied = !!ticker;
            return (
              <div
                key={i}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: isOccupied
                    ? '1px solid rgba(0, 229, 255, 0.4)'
                    : '1px dashed rgba(255, 255, 255, 0.1)',
                  background: isOccupied
                    ? 'linear-gradient(135deg, rgba(0, 229, 255, 0.12) 0%, rgba(0,0,0,0.3) 100%)'
                    : 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Slot {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: isOccupied ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      color: isOccupied ? 'var(--accent-primary)' : 'var(--text-muted)',
                      fontWeight: 700,
                    }}
                  >
                    {isOccupied ? `${weightPerSlot}%` : 'Cash Q'}
                  </span>
                </div>

                {isOccupied ? (
                  <>
                    <strong className="mono" style={{ fontSize: '1.05rem', color: 'var(--accent-primary)' }}>
                      {ticker}
                    </strong>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      ${slotValue.toFixed(2)} asignados
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Disponible
                    </span>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      ${slotValue.toFixed(2)} en reserva
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Rebalance Manager Grid ────────────────────── */}
      <div className="bottom-grid">
        {/* Formulario para agregar rebalanceo con fecha específica */}
        <div className="card fade-up" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📅</span>
            <span>Registrar Nuevo Rebalanceo Fechado</span>
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Define la fecha de entrada en vigor y la lista exacta de posiciones para {strategy.name}.
          </p>

          {/* Fecha del Rebalanceo */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Fecha del Rebalanceo / Compra:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Búsqueda y Adición Individual */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Buscar y agregar ticker ({formTickers.length}/{numSlots} slots):
            </label>
            <form onSubmit={handleSearchAndAdd} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Ej. AAPL, NVDA, MSFT..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.85rem',
                }}
              />
              <button type="submit" className="btn btn-ghost" disabled={searching}>
                {searching ? 'Buscando…' : '+ Agregar'}
              </button>
            </form>
            {searchError && (
              <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4, display: 'block' }}>
                {searchError}
              </span>
            )}
          </div>

          {/* Pegar Grupo de Tickers en Bloque */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              O pegar grupo de tickers separados por comas:
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="AAPL, NVDA, MSFT, GOOGL, AMZN..."
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.78rem',
                }}
              />
              <button type="button" className="btn btn-ghost" onClick={handleBatchAdd} style={{ fontSize: '0.75rem' }}>
                Cargar Grupo
              </button>
            </div>
          </div>

          {/* Chips de Tickers en este Rebalanceo */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Posiciones asignadas ({formTickers.length}):
              </span>
              {formTickers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFormTickers([])}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer' }}
                >
                  Limpiar todo
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {formTickers.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No hay posiciones agregadas para esta fecha.</span>
              ) : (
                formTickers.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 16,
                      background: 'rgba(0, 229, 255, 0.15)',
                      border: '1px solid rgba(0, 229, 255, 0.35)',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTicker(t)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                      title="Eliminar posición"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveRebalance}
            style={{ width: '100%', padding: '12px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            💾 Guardar Rebalanceo ({date})
          </button>
        </div>

        {/* Historial de Rebalanceos Fechados */}
        <div className="card fade-up" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📜</span>
            <span>Historial de Rebalanceos ({rebalances.length})</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520, overflowY: 'auto' }}>
            {rebalances.map((reb, idx) => {
              const isCurrent = idx === rebalances.length - 1;
              return (
                <div
                  key={reb.rebalance_date}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius)',
                    background: isCurrent ? 'rgba(0, 229, 255, 0.06)' : 'var(--bg-surface)',
                    border: `1px solid ${isCurrent ? 'rgba(0, 229, 255, 0.3)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ fontWeight: 800, fontSize: '0.9rem', color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {reb.rebalance_date}
                      </span>
                      {isCurrent && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(0, 229, 255, 0.2)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                          VIGENTE
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRebalance(reb.rebalance_date)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer' }}
                      title="Eliminar este evento"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {reb.tickers?.length || 0} acciones asignadas (${(((reb.tickers?.length || 0) / numSlots) * simulatedCapital).toFixed(2)} simulado)
                  </div>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {reb.tickers?.map((t) => (
                      <span
                        key={t}
                        className="mono"
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#cbd5e1',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
