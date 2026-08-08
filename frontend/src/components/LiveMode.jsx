import { useState, useEffect, useCallback } from 'react';
import { fetchLiveQuotes, fetchIntraday } from '../api/client';
import NavChart from './NavChart';

const POLL_INTERVAL = 60_000;

export default function LiveMode({ navData, investment }) {
  const [quotes, setQuotes] = useState([]);
  const [intradayChart, setIntradayChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!navData || !navData.holdings) return;
    
    try {
      setError(null);
      const activeTickers = navData.holdings.map(h => h.ticker);
      if (activeTickers.length === 0) {
        setLoading(false);
        return;
      }
      
      // Fetch live quotes
      const quotesData = await fetchLiveQuotes(activeTickers);
      setQuotes(quotesData);
      setMarketOpen(quotesData[0]?.market_open ?? false);
      setLastUpdate(new Date());

      // Fetch intraday for chart
      const intradayPromises = activeTickers.map(t => fetchIntraday(t));
      const intradayResults = await Promise.all(intradayPromises);
      
      // Aggregate into portfolio intraday NAV with forward-fill
      const allTimes = new Set();
      intradayResults.forEach(series => series.forEach(p => allTimes.add(p.time)));
      const sortedTimes = Array.from(allTimes).sort((a,b) => a - b);
      
      const lastPrice = {};
      const chartSeries = [];
      const cashReserved = navData.summary?.cash_reserved ?? 0;
      
      for (const t of sortedTimes) {
        let stockValue = 0;
        intradayResults.forEach((series, i) => {
          const ticker = activeTickers[i];
          const holding = navData.holdings.find(h => h.ticker === ticker);
          const shares = holding ? holding.shares : 0;
          
          const point = series.find(p => p.time === t);
          if (point && !isNaN(point.value)) {
            lastPrice[ticker] = point.value;
          }
          const price = lastPrice[ticker] ?? quotesData.find(q => q.ticker === ticker)?.previous_close ?? 0;
          if (!isNaN(price)) {
            stockValue += (price * shares);
          }
        });
        
        if (!isNaN(stockValue)) {
          chartSeries.push({
            date: t, 
            value: stockValue + cashReserved
          });
        }
      }
        
      setIntradayChart(chartSeries);

    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [navData]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
     return <div className="spinner" style={{ margin: '60px auto' }} />;
  }

  // Calculate live portfolio value
  const cashReserved = navData?.summary?.cash_reserved ?? 0;
  
  const livePortfolioValue = quotes.reduce((sum, q) => {
    const holding = navData?.holdings?.find(h => h.ticker === q.ticker);
    if (!holding || !q.price) return sum;
    return sum + (holding.shares * q.price);
  }, 0);
  
  const totalValue = livePortfolioValue + cashReserved;
  const investedBase = investment - cashReserved;
  const totalReturn = livePortfolioValue - investedBase;
  const totalReturnPct = investedBase > 0 ? (totalReturn / investedBase) * 100 : 0;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Live summary header */}
      <div className="card" style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Capital Activo (Live)
          </div>
          <div className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ${livePortfolioValue.toFixed(2)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span className={`badge ${totalReturn >= 0 ? 'gain' : 'loss'}`}>
              {totalReturn >= 0 ? '▲' : '▼'} ${Math.abs(totalReturn).toFixed(2)} ({Math.abs(totalReturnPct).toFixed(2)}%)
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>vs ${investedBase.toFixed(2)} invertidos</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
            <span className={`market-dot ${marketOpen ? 'open' : 'closed'}`} />
            <span style={{ color: marketOpen ? 'var(--gain)' : 'var(--text-muted)' }}>
              {marketOpen ? 'Mercado abierto' : 'Mercado cerrado'}
            </span>
          </div>
          {lastUpdate && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Actualizado: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Intraday Chart */}
      {intradayChart.length > 0 && (
        <div className="card" style={{ paddingBottom: '30px' }}>
           <h3 style={{ marginBottom: 16 }}>Gráfica de Hoy (Intradía)</h3>
           <div style={{ height: '340px' }}>
             <NavChart 
               navData={intradayChart} 
               investment={investedBase}
             />
           </div>
        </div>
      )}

      {/* Quotes grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
      }}>
        {quotes.map((q) => {
          const isGain = (q.change ?? 0) >= 0;
          const holding = navData?.holdings?.find(h => h.ticker === q.ticker);
          const shares = holding ? holding.shares : 0;
          const currentVal = shares * (q.price ?? q.previous_close ?? 0);
          return (
            <div
              key={q.ticker}
              className="card"
              style={{ borderColor: isGain ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--accent-primary)' }}>
                  {q.ticker}
                </span>
                <span className={`badge ${isGain ? 'gain' : 'loss'}`} style={{ fontSize: '0.6875rem' }}>
                  {isGain ? '▲' : '▼'} {Math.abs(q.change_pct ?? 0).toFixed(2)}%
                </span>
              </div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 2 }}>
                ${q.price?.toFixed(2) ?? '—'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Valor: <span className="mono" style={{ color: 'var(--text-secondary)' }}>${currentVal.toFixed(2)}</span>
                {' · '}{shares.toFixed(4)} acc.
              </div>
            </div>
          );
        })}

        {/* Cash placeholder card */}
        {cashReserved > 0 && (
          <div className="card" style={{ opacity: 0.4, border: '1px dashed var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Q (pendiente)
            </div>
            <div className="mono" style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>
              ${cashReserved.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
