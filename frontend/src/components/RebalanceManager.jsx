import { useState, useEffect, useRef } from 'react';
import { fetchRebalances, createRebalance, deleteRebalance, searchTicker } from '../api/client';
import { usePortfolioStore } from '../store/portfolioStore';

export default function RebalanceManager({ onRefresh }) {
  const { numSlots, investment, setInvestment } = usePortfolioStore();
  const [rebalances, setRebalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTickers, setFormTickers] = useState([]);
  
  // Search State
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const inputRef = useRef(null);

  const loadRebalances = async () => {
    setLoading(true);
    try {
      const data = await fetchRebalances();
      setRebalances(data);
      if (data.length > 0) {
        // Pre-fill form with the last rebalance tickers
        setFormTickers([...data[data.length - 1].tickers]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRebalances();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError('');
    try {
      const result = await searchTicker(query.trim());
      if (result.valid) {
        setSearchResult(result);
      } else {
        setSearchError(`"${query.toUpperCase()}" no encontrado en Yahoo Finance`);
      }
    } catch {
      setSearchError('Error de conexión');
    } finally {
      setSearching(false);
    }
  };

  const handleAddTicker = () => {
    if (!searchResult) return;
    if (formTickers.length >= numSlots) {
      setSearchError(`Máximo ${numSlots} empresas permitidas`);
      return;
    }
    if (!formTickers.includes(searchResult.ticker)) {
      setFormTickers([...formTickers, searchResult.ticker]);
    }
    setQuery('');
    setSearchResult(null);
  };

  const handleRemoveTicker = (ticker) => {
    setFormTickers(formTickers.filter((t) => t !== ticker));
  };

  const handleSubmit = async () => {
    try {
      await createRebalance({
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers
      });
      await loadRebalances();
      onRefresh?.();
    } catch (e) {
      alert("Error guardando el rebalanceo: " + e.message);
    }
  };

  const handleDelete = async (delDate) => {
    if (!confirm(`¿Eliminar rebalanceo del ${delDate}?`)) return;
    try {
      await deleteRebalance(delDate);
      await loadRebalances();
      onRefresh?.();
    } catch (e) {
      alert("Error eliminando: " + e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* GLOBAL SETTINGS */}
      <div>
        <h3 style={{ marginBottom: '10px' }}>Capital Invertido (Base)</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>$</span>
          <input
            type="number"
            value={investment}
            min={1}
            step={100}
            onChange={(e) => { setInvestment(e.target.value); onRefresh?.(); }}
            style={{ maxWidth: '140px', textAlign: 'right' }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            = ${(investment / numSlots).toFixed(2)} / slot
          </span>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
      
      {/* HISTORY SECTION */}
      <div>
        <h3 style={{ marginBottom: '12px' }}>Historial de Rebalanceos</h3>
        {loading ? (
          <div className="spinner" />
        ) : error ? (
          <div style={{ color: 'var(--loss)' }}>{error}</div>
        ) : rebalances.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No hay rebalanceos. Agrega el primero.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rebalances.map(r => (
              <div key={r.date} style={{
                background: 'var(--bg-surface)', padding: '12px',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <strong style={{ color: 'var(--accent-primary)' }}>{r.date}</strong>
                  <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {r.tickers.join(', ')}
                  </div>
                </div>
                <button className="btn btn-danger" onClick={() => handleDelete(r.date)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* NEW REBALANCE FORM */}
      <div>
        <h3 style={{ marginBottom: '16px' }}>Nuevo Rebalanceo Mensual (ProPicks)</h3>
        
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Fecha de Rebalanceo</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {/* Ticker Search */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Agregar Empresa (Saldrán/Entrarán al portafolio automáticamente)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ticker (ej: MSFT)"
              value={query}
              onChange={(e) => { setQuery(e.target.value.toUpperCase()); setSearchResult(null); setSearchError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ maxWidth: '160px', textTransform: 'uppercase' }}
            />
            <button className="btn btn-ghost" onClick={handleSearch} disabled={searching || !query}>
              {searching ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> : '🔍 Buscar'}
            </button>
          </div>
          {searchError && <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--loss)' }}>{searchError}</div>}
          
          {searchResult && (
            <div style={{
              marginTop: 10, padding: '12px 16px',
              background: 'rgba(0, 229, 255, 0.04)', borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              animation: 'fadeUp 0.2s ease',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>{searchResult.ticker}</strong>
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                    {searchResult.exchange}
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,229,255,0.1)', color: 'var(--accent-primary)' }}>
                    {searchResult.sector}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {searchResult.name}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: 2, color: 'var(--text-muted)' }}>
                  Precio de mercado: <strong style={{ color: '#fff' }}>${searchResult.price}</strong>
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }} onClick={handleAddTicker}>
                + Agregar a este mes
              </button>
            </div>
          )}
        </div>

        {/* Selected Tickers */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Empresas para este mes: {formTickers.length}/{numSlots} slots
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {formTickers.map(ticker => (
              <div key={ticker} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                display: 'flex', gap: '6px', alignItems: 'center'
              }}>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{ticker}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer' }} onClick={() => handleRemoveTicker(ticker)}>✕</button>
              </div>
            ))}
            {Array.from({ length: numSlots - formTickers.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                border: '1px dashed var(--border)', padding: '4px 8px',
                borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', opacity: 0.5
              }}>
                Slot libre (Cash)
              </div>
            ))}
          </div>
        </div>

        <button 
          className="btn btn-primary" 
          style={{ marginTop: '24px', width: '100%', padding: '12px' }}
          onClick={handleSubmit}
        >
          Guardar Rebalanceo
        </button>

      </div>
    </div>
  );
}
