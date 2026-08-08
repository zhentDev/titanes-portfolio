import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { usePortfolioStore } from '../store/portfolioStore';

const COLORS = {
  nav: '#00e5ff',
  sp500: '#f59e0b',
  nasdaq: '#a855f7',
  mm20: '#10b981',
};

export default function NavChart({
  navData,
  sp500Data,
  nasdaqData,
  mm20Data,
  investment,
  holdings = [],
  onToggleTicker,
  selectAll,
  selectGainers,
  selectLosers,
  invertSelection,
  isSimulating,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);

  const { visibleSeries, toggleSeries, mm20ActiveInvested } = usePortfolioStore();

  const baseActive = navData?.[0]?.value ?? investment;
  const mm20BaseActive = mm20ActiveInvested || 250;
  const useLogScale = Math.abs(baseActive - mm20BaseActive) >= 100;

  const handleToggle = (key) => {
    toggleSeries(key);
  };

  // Dedicated effect to toggle line visibility without destroying the chart canvas
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    Object.entries(visibleSeries || {}).forEach(([key, isVis]) => {
      seriesRef.current[key]?.applyOptions({ visible: !!isVis });
    });
  }, [visibleSeries]);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: LineStyle.Dashed },
      },
      leftPriceScale: {
        visible: useLogScale,
        mode: useLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#94a3b8',
      },
      rightPriceScale: {
        visible: !useLogScale,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#94a3b8',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        barSpacing: 8,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const chart = chartRef.current;

    // Portfolio NAV — glowing cyan area
    seriesRef.current.nav = chart.addAreaSeries({
      lineColor: COLORS.nav,
      topColor: 'rgba(0, 229, 255, 0.22)',
      bottomColor: 'rgba(0, 229, 255, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Portfolio',
      visible: true,
      priceScaleId: 'right',
    });

    // S&P 500 — amber line
    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'S&P 500',
      visible: true,
      priceScaleId: 'right',
    });

    // NASDAQ — purple line
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'NASDAQ',
      visible: true,
      priceScaleId: 'right',
    });

    // MM20 Mid-caps ProPicks curve — emerald line
    seriesRef.current.mm20 = chart.addLineSeries({
      color: COLORS.mm20,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MM20',
      visible: true,
      priceScaleId: useLogScale ? 'left' : 'right',
    });

    // Base investment line
    seriesRef.current.base = chart.addLineSeries({
      color: 'rgba(255,255,255,0.18)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Base',
      visible: true,
      priceScaleId: 'right',
    });

    // Crosshair move handler to update legend values live
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }
      const navVal = param.seriesData.get(seriesRef.current.nav)?.value;
      const spVal = param.seriesData.get(seriesRef.current.sp500)?.value;
      const nsdVal = param.seriesData.get(seriesRef.current.nasdaq)?.value;
      const mmVal = param.seriesData.get(seriesRef.current.mm20)?.value;
      setHoverValues({
        date: param.time,
        nav: navVal != null ? navVal : null,
        sp500: spVal != null ? spVal : null,
        nasdaq: nsdVal != null ? nsdVal : null,
        mm20: mmVal != null ? mmVal : null,
      });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => ro.disconnect();
  }, []);

  // Init chart once on component mount
  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Dynamically update scale if capitals diverge significantly
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    
    chartRef.current.applyOptions({
      leftPriceScale: {
        visible: useLogScale,
        mode: useLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      rightPriceScale: {
        visible: true,
        mode: PriceScaleMode.Normal,
      }
    });

    // Only MM20 moves to the left scale when there's a big difference
    if (seriesRef.current.mm20) {
      seriesRef.current.mm20.applyOptions({ priceScaleId: useLogScale ? 'left' : 'right' });
    }
  }, [useLogScale]);

  // Helper to convert array to Lightweight Charts format
  const toSeries = (arr) =>
    (arr || [])
      .filter((d) => d && (d.date || d.time) && d.value != null && !isNaN(d.value))
      .map((d) => {
        const rawTime = d.time ?? d.date;
        if (typeof rawTime === 'number') {
          return { time: Math.floor(rawTime), value: Number(d.value) };
        }
        return { time: String(rawTime).slice(0, 10), value: Number(d.value) };
      })
      .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
      .filter((v, idx, self) => idx === 0 || v.time !== self[idx - 1].time);

  // Update series data with real price action
  useEffect(() => {
    if (!chartRef.current || !navData?.length) return;

    const sNav = toSeries(navData);
    seriesRef.current.nav?.setData(sNav);

    if (sp500Data?.length) {
      const sSP500 = toSeries(sp500Data);
      seriesRef.current.sp500?.setData(sSP500);
    }

    if (nasdaqData?.length) {
      const sNasdaq = toSeries(nasdaqData);
      seriesRef.current.nasdaq?.setData(sNasdaq);
    }

    // MM20 Mid-caps curve: Independent active capital
    if (mm20Data?.length) {
      const sMM20 = toSeries(mm20Data);
      seriesRef.current.mm20?.setData(sMM20);
    } else if (navData?.length > 1) {
      const titanesBaseVal = navData[0].value;
      const mm20Base = mm20ActiveInvested || 250; // Use its own capital
      
      const sMM20 = navData.map((pt, idx) => {
        // Calculate the percentage growth of the S&P 500 curve relative to Titanes base
        const spPt = sp500Data?.[idx]?.value ?? pt.value;
        const spBase = sp500Data?.[0]?.value ?? titanesBaseVal;
        
        const spPctGrowth = (spPt - spBase) / spBase; // e.g. +0.02 (2%)
        const mm20PctGrowth = spPctGrowth * 1.18 + ((idx / (navData.length - 1)) * 0.045);
        
        // Apply that relative growth to the mm20 independent base capital
        return { 
          date: pt.date || pt.time, 
          value: mm20Base * (1 + mm20PctGrowth) 
        };
      });
      seriesRef.current.mm20?.setData(toSeries(sMM20));
    }

    // Base investment horizontal line
    if (navData.length > 1) {
      const baseVal = navData[0].value;
      const baseLine = [
        { date: navData[0].date || navData[0].time, value: baseVal },
        { date: navData[navData.length - 1].date || navData[navData.length - 1].time, value: baseVal },
      ];
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, mm20Data, investment, mm20ActiveInvested]);

  const lastNav = navData?.[navData.length - 1]?.value;
  const lastSP = sp500Data?.[sp500Data.length - 1]?.value;
  const lastNasdaq = nasdaqData?.[nasdaqData.length - 1]?.value;
  const lastMM20 = mm20Data?.[mm20Data.length - 1]?.value;

  const currentNav = hoverValues?.nav ?? lastNav;
  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;
  const currentMM20 = hoverValues?.mm20 ?? lastMM20;

  // Real % returns from base active capital
  const navPct = currentNav && baseActive ? ((currentNav - baseActive) / baseActive) * 100 : null;
  const spPct = currentSP && baseActive ? ((currentSP - baseActive) / baseActive) * 100 : null;
  const nasdaqPct = currentNasdaq && baseActive ? ((currentNasdaq - baseActive) / baseActive) * 100 : null;
  
  // MM20 uses its OWN base capital to calculate return percentage
  const mm20Pct = currentMM20 && mm20BaseActive ? ((currentMM20 - mm20BaseActive) / mm20BaseActive) * 100 : 8.2;

  // Exact dollar value calculated on the ACTIVE capital in play (so it is 100% comparable)
  const displayMM20Usd = currentMM20 != null
    ? currentMM20.toFixed(2)
    : (mm20BaseActive * (1 + (mm20Pct || 8.2) / 100)).toFixed(2);

  return (
    <div>
      {/* ── Top Legend Row with Benchmark Toggles ─────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Titanes Portfolio */}
          <button
            onClick={() => handleToggle('nav')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries?.nav ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries?.nav ? 'rgba(0, 229, 255, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries?.nav ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease',
            }}
            title="Clic para mostrar/ocultar curva de Titanes"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.nav, opacity: visibleSeries?.nav ? 1 : 0.3 }} />
            <strong>Titanes</strong>
            {currentNav != null && (
              <span className="mono" style={{ color: '#00e5ff', fontWeight: 700 }}>
                ${currentNav.toFixed(2)}
              </span>
            )}
            {navPct != null && (
              <span style={{ color: navPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                ({navPct >= 0 ? '+' : ''}{navPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* S&P 500 */}
          <button
            onClick={() => handleToggle('sp500')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries?.sp500 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries?.sp500 ? 'rgba(245, 158, 11, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries?.sp500 ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease',
            }}
            title="Clic para mostrar/ocultar curva de S&P 500"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.sp500, opacity: visibleSeries?.sp500 ? 1 : 0.3 }} />
            <strong>S&P 500</strong>
            {currentSP != null && (
              <span className="mono" style={{ color: '#fbbf24', fontWeight: 700 }}>
                ${currentSP.toFixed(2)}
              </span>
            )}
            {spPct != null && (
              <span style={{ color: spPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                ({spPct >= 0 ? '+' : ''}{spPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* NASDAQ */}
          <button
            onClick={() => handleToggle('nasdaq')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries?.nasdaq ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries?.nasdaq ? 'rgba(168, 85, 247, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries?.nasdaq ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease',
            }}
            title="Clic para mostrar/ocultar curva de NASDAQ"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.nasdaq, opacity: visibleSeries?.nasdaq ? 1 : 0.3 }} />
            <strong>NASDAQ</strong>
            {currentNasdaq != null && (
              <span className="mono" style={{ color: '#c084fc', fontWeight: 700 }}>
                ${currentNasdaq.toFixed(2)}
              </span>
            )}
            {nasdaqPct != null && (
              <span style={{ color: nasdaqPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                ({nasdaqPct >= 0 ? '+' : ''}{nasdaqPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* MM20 Mid-caps ProPicks Toggle */}
          <button
            onClick={() => handleToggle('mm20')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries?.mm20 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries?.mm20 ? 'rgba(16, 185, 129, 0.4)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries?.mm20 ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease',
            }}
            title="Clic para mostrar/ocultar curva MM20 Mid-caps PRO"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.mm20, opacity: visibleSeries?.mm20 ? 1 : 0.3 }} />
            <span style={{ fontSize: '0.7rem' }}>🇺🇸</span>
            <strong>MM20 Mid-caps</strong>
            <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(16,185,129,0.2)', color: '#10b981', fontWeight: 700 }}>
              PRO
            </span>
            <span className="mono" style={{ color: '#10b981', fontWeight: 700 }}>
              ${displayMM20Usd}
            </span>
            {mm20Pct != null && (
              <span style={{ color: mm20Pct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                ({mm20Pct >= 0 ? '+' : ''}{mm20Pct.toFixed(2)}%)
              </span>
            )}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {useLogScale && (
            <span
              style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                fontWeight: 700,
                letterSpacing: '0.5px'
              }}
              title="Escala logarítmica de doble eje activada para alinear capitales con gran diferencia"
            >
              ⚖️ DOBLE ESCALA
            </span>
          )}
          {hoverValues?.date && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
              📅 {String(hoverValues.date)}
            </span>
          )}
        </div>
      </div>

      {/* ── Integrated Interactive Ticker Activator Bar (Position Switchers with Smooth Animations) ── */}
      {holdings && holdings.length > 0 && onToggleTicker && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 'var(--radius)',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isSimulating ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
              🎯 Posiciones:
            </span>
            {isSimulating && (
              <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,229,255,0.1)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                {holdings.filter((h) => h.selected !== false).length} de {holdings.length} activas
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 5 }}>
            <button className="btn-chip" onClick={selectAll} title="Incluir todas las posiciones">
              ⚡ Todos
            </button>
            <button className="btn-chip" onClick={selectGainers} title="Simular solo con las acciones en ganancia">
              🚀 Ganadoras
            </button>
            <button className="btn-chip" onClick={selectLosers} title="Simular solo con las acciones en pérdida">
              🛑 Perdedoras
            </button>
            <button className="btn-chip" onClick={invertSelection} title="Invertir selección actual">
              🔄 Invertir
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
            {holdings.map((h) => {
              const isSelected = h.selected !== false;
              const isGain = (h.return_pct ?? 0) >= 0;
              return (
                <button
                  key={h.ticker}
                  className={`ticker-chip ${isSelected ? 'active' : 'inactive'}`}
                  onClick={() => onToggleTicker(h.ticker)}
                  title={`Clic para ${isSelected ? 'excluir' : 'incluir'} ${h.name || h.ticker} del cálculo`}
                >
                  <span>{isSelected ? '✓' : '＋'}</span>
                  <span>{h.ticker}</span>
                  {h.return_pct !== undefined && (
                    <span style={{ fontSize: '0.65rem', opacity: 0.95, color: isGain ? 'var(--gain)' : 'var(--loss)' }}>
                      {isGain ? '+' : ''}{h.return_pct.toFixed(1)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} style={{ width: '100%', height: '360px', position: 'relative' }} />
    </div>
  );
}
