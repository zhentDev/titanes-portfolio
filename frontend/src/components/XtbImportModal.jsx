import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { parseXtbTrades } from '../utils/xtbParser';
import { getMarketOpenTime } from '../utils/marketHours';

export default function XtbImportModal({
  isOpen,
  onClose,
  currentPortfolioId,
  purchasePortfolios = [],
  onImportPurchases,
  onCreatePortfolio,
  onSelectPortfolio,
}) {
  const [targetMode, setTargetMode] = useState('existing'); // 'existing' | 'new'
  const [selectedPortId, setSelectedPortId] = useState(currentPortfolioId || 'hist_default');
  const [newPortfolioName, setNewPortfolioName] = useState('Compras XTB');
  const [defaultDate, setDefaultDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rawText, setRawText] = useState('');
  const [parsedTrades, setParsedTrades] = useState([]);
  const [parseError, setParseError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPortId(currentPortfolioId || 'hist_default');
      setTargetMode('existing');
      setRawText('');
      setParsedTrades([]);
      setParseError('');
      setIsProcessing(false);
    }
  }, [isOpen, currentPortfolioId]);

  // Handle parsing whenever rawText or defaultDate changes
  useEffect(() => {
    if (!rawText.trim()) {
      setParsedTrades([]);
      setParseError('');
      return;
    }

    const res = parseXtbTrades(rawText, defaultDate);
    if (res.success && res.trades.length > 0) {
      setParsedTrades(res.trades);
      setParseError('');
    } else {
      setParsedTrades([]);
      setParseError(res.error || 'No se reconocieron posiciones en el texto.');
    }
  }, [rawText, defaultDate]);

  const totalInvested = useMemo(() => {
    return parsedTrades.reduce((sum, t) => sum + (t.investedAmount || 0), 0);
  }, [parsedTrades]);

  const handleRemoveTrade = (idToRemove) => {
    setParsedTrades(prev => prev.filter(t => t.id !== idToRemove));
  };

  const handleUpdateTrade = (id, field, value) => {
    setParsedTrades(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      if (field === 'shares' || field === 'purchasePrice') {
        const sh = field === 'shares' ? Number(value) : t.shares;
        const pr = field === 'purchasePrice' ? Number(value) : t.purchasePrice;
        if (sh > 0 && pr > 0) {
          updated.investedAmount = Number((sh * pr).toFixed(2));
        }
      }
      return updated;
    }));
  };

  const handleExecuteImport = async () => {
    if (parsedTrades.length === 0) {
      toast.error('No hay compras válidas para importar.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Importando compras desde xStation...');

    try {
      let finalPortId = selectedPortId;

      if (targetMode === 'new') {
        const portName = newPortfolioName.trim() || 'Compras XTB';
        if (onCreatePortfolio) {
          const newPort = await onCreatePortfolio(portName);
          if (newPort && newPort.id) {
            finalPortId = newPort.id;
          }
        }
      }

      // Convert parsed trades to purchase items
      const newPurchases = parsedTrades.map(t => {
        const openTime = t.purchaseTime || getMarketOpenTime(t.ticker);
        return {
          id: `buy_${Date.now()}_${Math.floor(Math.random() * 1000000)}_${t.ticker}`,
          portfolioId: finalPortId,
          ticker: t.ticker.toUpperCase().trim(),
          name: t.name || t.ticker,
          date: t.date || defaultDate,
          purchaseTime: openTime,
          purchasePrice: Number(t.purchasePrice) || 0,
          shares: Number(t.shares) || 0,
          investedAmount: Number(t.investedAmount) || 0,
          manualCurrentPrice: Number(t.currentPrice) || 0,
        };
      });

      if (onImportPurchases) {
        await onImportPurchases(newPurchases);
      }

      if (onSelectPortfolio && finalPortId) {
        onSelectPortfolio(finalPortId);
      }

      toast.success(`🎉 ¡${newPurchases.length} compras importadas exitosamente!`, { id: toastId });
      onClose();
    } catch (err) {
      console.error('Error importing XTB trades:', err);
      toast.error('Error al importar las compras. Revisa los datos.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          background: 'var(--bg-card, #111827)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 229, 255, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>📥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#f1f5f9' }}>
                Importar Compras desde xStation (XTB)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Pega el código HTML de la tabla o el texto copiado de xStation 5 para generar todas tus compras al instante.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '1.2rem', color: 'var(--text-muted, #64748b)', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* DESTINATION PORTFOLIO & DEFAULT DATE */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              background: 'rgba(255, 255, 255, 0.02)',
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.06))',
            }}
          >
            {/* Portfolio Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: 6 }}>
                📁 Portafolio de Destino:
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setTargetMode('existing')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    border: targetMode === 'existing' ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: targetMode === 'existing' ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
                    color: targetMode === 'existing' ? '#00e5ff' : 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Existente
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('new')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    border: targetMode === 'new' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: targetMode === 'new' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    color: targetMode === 'new' ? '#10b981' : 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  + Nuevo Portafolio
                </button>
              </div>

              {targetMode === 'existing' ? (
                <select
                  value={selectedPortId}
                  onChange={(e) => setSelectedPortId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                    color: '#fff',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                >
                  {purchasePortfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      📁 {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  placeholder="Nombre del nuevo portafolio..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid #10b981',
                    color: '#fff',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            {/* Default Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: 6 }}>
                📅 Fecha por defecto:
              </label>
              <input
                type="date"
                value={defaultDate}
                onChange={(e) => setDefaultDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-surface, #1e293b)',
                  border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                  color: '#fff',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                Se asignará a las posiciones que no incluyan fecha de apertura explícita.
              </span>
            </div>
          </div>

          {/* PASTE AREA */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)' }}>
                📋 Pega aquí la tabla de posiciones de xStation 5:
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  Limpiar texto
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Haz clic derecho en la tabla de Posiciones Abiertas de xStation 5 ➔ Inspeccionar ➔ Copiar elemento (o selecciona las celdas y presiona Ctrl+C), y pégalo aquí..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: 'var(--bg-surface, #0f172a)',
                border: parseError ? '1px solid #ef4444' : parsedTrades.length > 0 ? '1px solid #10b981' : '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                color: '#e2e8f0',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
              }}
            />
            {parseError && (
              <div style={{ fontSize: '0.74rem', color: '#f87171', marginTop: 4 }}>
                ⚠️ {parseError}
              </div>
            )}
          </div>

          {/* PREVIEW OF DETECTED TRADES */}
          {parsedTrades.length > 0 && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '0.95rem' }}>
                    ✓ {parsedTrades.length} Posición(es) detectada(s)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                    Total Inversión: <strong style={{ color: '#f1f5f9' }}>${totalInvested.toFixed(2)} USD</strong>
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>
                  Puedes editar valores o eliminar filas antes de importar
                </span>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '280px', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted, #94a3b8)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Ticker</th>
                      <th style={{ padding: '8px 10px' }}>Empresa</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Acciones</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Apertura</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Inversión (USD)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Actual</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTrades.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#00e5ff' }}>
                          <input
                            type="text"
                            value={t.ticker}
                            onChange={(e) => handleUpdateTrade(t.id, 'ticker', e.target.value.toUpperCase())}
                            style={{
                              width: '70px',
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 4,
                              color: '#00e5ff',
                              fontWeight: 700,
                              padding: '2px 4px',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>
                          {t.name}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f1f5f9' }}>
                          {t.shares}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f1f5f9' }}>
                          ${t.purchasePrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                          ${t.investedAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8' }}>
                          ${t.currentPrice ? t.currentPrice.toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveTrade(t.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '0.8rem',
                            }}
                            title="Eliminar posición"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            background: 'rgba(255, 255, 255, 0.01)',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isProcessing}
            style={{ fontSize: '0.85rem' }}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExecuteImport}
            disabled={parsedTrades.length === 0 || isProcessing}
            style={{
              background: parsedTrades.length > 0 ? 'linear-gradient(135deg, #00e5ff 0%, #3b82f6 100%)' : undefined,
              color: '#000',
              fontWeight: 700,
              fontSize: '0.85rem',
              padding: '8px 20px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: parsedTrades.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {isProcessing ? (
              <span>⏳ Importando...</span>
            ) : (
              <span>🚀 Importar {parsedTrades.length} Compras</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
