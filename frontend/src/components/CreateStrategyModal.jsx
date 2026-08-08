import { useState } from 'react';

const COUNTRIES = [
  { code: '🇺🇸', name: 'Estados Unidos (USA)' },
  { code: '🇪🇺', name: 'Europa (EU)' },
  { code: '🇨🇳', name: 'China / Asia' },
  { code: '🇯🇵', name: 'Japón (JP)' },
  { code: '🇬🇧', name: 'Reino Unido (UK)' },
  { code: '🇲🇽', name: 'México / LatAm' },
  { code: '🌎', name: 'Global / Multi-Región' },
];

const BENCHMARKS = [
  'S&P 500 (^GSPC)',
  'NASDAQ 100 (^IXIC)',
  'S&P MidCap 400 (IJH)',
  'Russell 2000 (IWM)',
  'EuroStoxx 50 (FEZ)',
  'MSCI World (URTH)',
];

export default function CreateStrategyModal({ isOpen, onClose, onCreate }) {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [country, setCountry] = useState('🇺🇸');
  const [numSlots, setNumSlots] = useState(20);
  const [capital, setCapital] = useState(1000);
  const [benchmark, setBenchmark] = useState('S&P 500 (^GSPC)');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor ingresa un nombre para la estrategia');
      return;
    }
    onCreate({
      name: name.trim(),
      country,
      numSlots: Number(numSlots) || 20,
      capital: Number(capital) || 1000,
      benchmark,
    });
    setName('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '28px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>✨</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#f1f5f9' }}>
              Crear Nueva Estrategia
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Nombre */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Nombre de la Estrategia:
            </label>
            <input
              type="text"
              placeholder="Ej. Top Dividendos Aristócratas, Small-caps Tech..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* País / Región */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              País o Mercado Objetivo:
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COUNTRIES.map((c) => (
                <button
                  type="button"
                  key={c.code}
                  className={`btn-chip ${country === c.code ? 'active' : ''}`}
                  onClick={() => setCountry(c.code)}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                >
                  <span>{c.code}</span>
                  <span>{c.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad de Posiciones (Slots) & Capital Base */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Cantidad de Slots:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={5}
                  max={50}
                  step={1}
                  value={numSlots}
                  onChange={(e) => setNumSlots(Number(e.target.value) || 20)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--accent-primary)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  ({(100 / numSlots).toFixed(1)}% c/u)
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Capital Base ($):
              </label>
              <input
                type="number"
                min={100}
                step={100}
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value) || 1000)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--accent-primary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          {/* Benchmark de Referencia */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Índice Benchmark de Referencia:
            </label>
            <select
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            >
              {BENCHMARKS.map((b) => (
                <option key={b} value={b} style={{ background: '#0b1120', color: '#fff' }}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.85rem', fontWeight: 700 }}
            >
              🚀 Crear Estrategia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
