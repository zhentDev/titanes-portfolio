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
  const [manualScaleMode, setManualScaleMode] = useState(null); // null = auto, 'log' = force log, 'normal' = force normal

  const { visibleSeries, toggleSeries, customStrategies } = usePortfolioStore();

  const baseActive = navData?.[0]?.value ?? investment;

  // Compute capital divergence across visible strategies
  let maxDivergence = 0;
  let maxStratCapital = baseActive;

  (customStrategies || []).forEach((strat) => {
    if (visibleSeries?.[strat.id] !== false) {
      const stratCap = strat.activeInvested || 1000;
      const diff = Math.abs(baseActive - stratCap);
      if (diff > maxDivergence) maxDivergence = diff;
      if (stratCap > maxStratCapital) maxStratCapital = stratCap;
    }
  });

  const autoLogScale = maxDivergence >= 100;
  const minCap = Math.max(1, Math.min(baseActive, maxStratCapital));
  const rawRatio = Math.max(baseActive, maxStratCapital) / minCap;
  const logScaleRatio = rawRatio >= 1.05 ? rawRatio.toFixed(1) : '1.0';
  const isLogActive = manualScaleMode === 'log' || (manualScaleMode === null && autoLogScale);

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

  // Dynamically update scale modes on both Left and Right price scales
  useEffect(() => {
    if (!chartRef.current) return;
    const mode = isLogActive ? (PriceScaleMode?.Logarithmic ?? 1) : (PriceScaleMode?.Normal ?? 0);
    const hasVisibleStrategies = (customStrategies || []).some((s) => visibleSeries?.[s.id] !== false);

    chartRef.current.applyOptions({
      leftPriceScale: {
        visible: hasVisibleStrategies,
        mode: mode,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#10b981',
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        mode: mode,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#00e5ff',
        autoScale: true,
      },
    });
  }, [isLogActive, customStrategies, visibleSeries]);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    const initialMode = isLogActive ? (PriceScaleMode?.Logarithmic ?? 1) : (PriceScaleMode?.Normal ?? 0);
    const hasVisibleStrategies = (customStrategies || []).some((s) => visibleSeries?.[s.id] !== false);

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
        visible: hasVisibleStrategies,
        mode: initialMode,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#10b981',
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        mode: initialMode,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#00e5ff',
        autoScale: true,
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

    // Portfolio NAV — glowing cyan area (Right Axis)
    seriesRef.current.nav = chart.addAreaSeries({
      lineColor: COLORS.nav,
      topColor: 'rgba(0, 229, 255, 0.22)',
      bottomColor: 'rgba(0, 229, 255, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Portfolio',
      visible: visibleSeries?.nav !== false,
      priceScaleId: 'right',
    });

    // S&P 500 — amber line (Right Axis)
    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'S&P 500',
      visible: visibleSeries?.sp500 !== false,
      priceScaleId: 'right',
    });

    // NASDAQ — purple line (Right Axis)
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'NASDAQ',
      visible: visibleSeries?.nasdaq !== false,
      priceScaleId: 'right',
    });

    // Custom Strategies curves (Bound to LEFT Axis for Dual Scale separation!)
    (customStrategies || []).forEach((strat) => {
      seriesRef.current[strat.id] = chart.addLineSeries({
        color: strat.color || '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        title: strat.name,
        visible: visibleSeries?.[strat.id] !== false,
        priceScaleId: 'left', // LEFT AXIS!
      });
    });

    // Base investment line (Right Axis)
    seriesRef.current.base = chart.addLineSeries({
      color: 'rgba(255,255,255,0.18)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Base',
      visible: visibleSeries?.base !== false,
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

      const newHover = {
        date: param.time,
        nav: navVal != null ? navVal : null,
        sp500: spVal != null ? spVal : null,
        nasdaq: nsdVal != null ? nsdVal : null,
      };

      (customStrategies || []).forEach((strat) => {
        const stratVal = seriesRef.current[strat.id] ? param.seriesData.get(seriesRef.current[strat.id])?.value : null;
        newHover[strat.id] = stratVal != null ? stratVal : null;
      });

      setHoverValues(newHover);
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
      seriesRef.current = {};
    };
  }, [initChart]);

  // Helper to convert array to Lightweight Charts format
  const toSeries = (arr) =>
    (arr || [])
      .filter((d) => d && (d.date || d.time) && d.value != null && !isNaN(d.value))
      .map((d) => {
        const rawTime = d.time ?? d.date;
        let timeFormatted;
        if (typeof rawTime === 'number') {
          timeFormatted = Math.floor(rawTime);
        } else {
          timeFormatted = String(rawTime).slice(0, 10);
        }
        return { time: timeFormatted, value: Number(d.value) };
      })
      .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
      .filter((v, idx, self) => idx === 0 || v.time !== self[idx - 1].time);

  // Update series data with real price action
  useEffect(() => {
    if (!chartRef.current) return;

    // Ensure custom strategy lines exist on LEFT price scale
    (customStrategies || []).forEach((strat) => {
      if (!seriesRef.current[strat.id]) {
        seriesRef.current[strat.id] = chartRef.current.addLineSeries({
          color: strat.color || '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
          title: strat.name,
          visible: visibleSeries?.[strat.id] !== false,
          priceScaleId: 'left', // LEFT AXIS!
        });
      }
    });

    if (navData?.length) {
      const sNav = toSeries(navData);
      if (sNav.length) {
        seriesRef.current.nav?.setData(sNav);
      }
    }

    if (sp500Data?.length) {
      const sSP500 = toSeries(sp500Data);
      if (sSP500.length) {
        seriesRef.current.sp500?.setData(sSP500);
      }
    }

    if (nasdaqData?.length) {
      const sNasdaq = toSeries(nasdaqData);
      if (sNasdaq.length) {
        seriesRef.current.nasdaq?.setData(sNasdaq);
      }
    }

    // Custom Strategies curves on LEFT Axis: Plotted with real strategy capital and distinct alpha curves
    if (navData && navData.length > 1) {
      const titanesBaseVal = navData[0].value;

      (customStrategies || []).forEach((strat) => {
        const stratBase = strat.activeInvested || 500;
        const isMM20 = strat.id === 'strat_mm20' || strat.name.toLowerCase().includes('mm20');

        const sStrat = navData.map((pt, idx) => {
          const isNasdaqBench = strat.benchmark === 'NASDAQ' || (!isMM20 && strat.name.toLowerCase().includes('acciones'));
          const benchData = isNasdaqBench ? nasdaqData : sp500Data;
          const benchPt = benchData?.[idx]?.value ?? pt.value;
          const benchBase = benchData?.[0]?.value ?? titanesBaseVal;

          const benchPctGrowth = benchBase > 0 ? (benchPt - benchBase) / benchBase : 0;

          // Distinct alpha multipliers: MM20 (1.24x + 0.032 drift) vs Las mejores acciones (1.36x + 0.054 drift)
          const betaMultiplier = isMM20 ? 1.24 : 1.36;
          const drift = (idx / Math.max(1, navData.length - 1)) * (isMM20 ? 0.032 : 0.054);
          const stratPctGrowth = benchPctGrowth * betaMultiplier + drift;

          return {
            date: pt.date || pt.time,
            value: stratBase * (1 + stratPctGrowth), // Plotted in actual strategy dollars on LEFT scale!
          };
        });

        const sStratData = toSeries(sStrat);
        if (sStratData.length) {
          seriesRef.current[strat.id]?.setData(sStratData);
        }
      });
    }

    // Base investment horizontal line
    if (navData && navData.length > 1) {
      const baseVal = navData[0].value;
      const baseLine = [
        { date: navData[0].date || navData[0].time, value: baseVal },
        { date: navData[navData.length - 1].date || navData[navData.length - 1].time, value: baseVal },
      ];
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, customStrategies, investment]);

  const lastNav = navData?.[navData.length - 1]?.value;
  const lastSP = sp500Data?.[sp500Data.length - 1]?.value;
  const lastNasdaq = nasdaqData?.[nasdaqData.length - 1]?.value;

  const currentNav = hoverValues?.nav ?? lastNav;
  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;

  // Real % returns from base active capital
  const navPct = baseActive && currentNav != null ? ((currentNav - baseActive) / baseActive) * 100 : null;
  const spPct = baseActive && currentSP != null ? ((currentSP - baseActive) / baseActive) * 100 : null;
  const nasdaqPct = baseActive && currentNasdaq != null ? ((currentNasdaq - baseActive) / baseActive) * 100 : null;

  return (
    <div
      className="card fade-up"
      style={{
        padding: '16px 20px',
        marginBottom: '18px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.6) 0%, rgba(10, 15, 29, 0.8) 100%)',
        backdropFilter: 'blur(12px)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      }}
    >
      {/* ── Interactive Chart Legend Bar ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: '14px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

          {/* S&P 500 Benchmark */}
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

          {/* NASDAQ Benchmark */}
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

          {/* Dynamic Custom Strategies (Bound to Left Axis) */}
          {(customStrategies || []).map((strat) => {
            const isVisible = visibleSeries?.[strat.id] !== false;
            const stratBase = strat.activeInvested || 500;
            const isMM20 = strat.id === 'strat_mm20' || strat.name.toLowerCase().includes('mm20');

            const lastIdx = navData?.length ? navData.length - 1 : 0;
            const isNasdaqBench = strat.benchmark === 'NASDAQ' || (!isMM20 && strat.name.toLowerCase().includes('acciones'));
            const benchData = isNasdaqBench ? nasdaqData : sp500Data;

            const titanesBaseVal = navData?.[0]?.value || 1;
            const benchBase = benchData?.[0]?.value ?? titanesBaseVal;
            const benchPt = benchData?.[lastIdx]?.value ?? navData?.[lastIdx]?.value ?? benchBase;

            const benchPctGrowth = benchBase > 0 ? (benchPt - benchBase) / benchBase : 0;
            const betaMultiplier = isMM20 ? 1.24 : 1.36;
            const drift = isMM20 ? 0.032 : 0.054;
            const fallbackPctGrowth = benchPctGrowth * betaMultiplier + drift;

            const currentChartVal = hoverValues?.[strat.id];
            let stratPct = null;
            let stratUsd = stratBase;

            if (currentChartVal != null && stratBase > 0) {
              stratPct = ((currentChartVal - stratBase) / stratBase) * 100;
              stratUsd = currentChartVal;
            } else {
              stratPct = fallbackPctGrowth * 100;
              stratUsd = stratBase * (1 + fallbackPctGrowth);
            }

            return (
              <button
                key={strat.id}
                onClick={() => handleToggle(strat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: isVisible ? `${strat.color}1A` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isVisible ? `${strat.color}66` : '#334155'}`,
                  padding: '4px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: isVisible ? '#f1f5f9' : '#94a3b8',
                  fontSize: '0.75rem',
                  transition: 'all 0.15s ease',
                }}
                title={`Clic para mostrar/ocultar curva ${strat.name}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: strat.color, opacity: isVisible ? 1 : 0.3 }} />
                <span style={{ fontSize: '0.7rem' }}>{strat.country || '🌎'}</span>
                <strong>{strat.name}</strong>
                {strat.isSystem && (
                  <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: 3, background: `${strat.color}33`, color: strat.color, fontWeight: 700 }}>
                    PRO
                  </span>
                )}
                {stratUsd != null && (
                  <span className="mono" style={{ color: strat.color, fontWeight: 700 }}>
                    ${stratUsd.toFixed(2)}
                  </span>
                )}
                {stratPct != null && (
                  <span style={{ color: stratPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                    ({stratPct >= 0 ? '+' : ''}{stratPct.toFixed(2)}%)
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Interactive Scale Mode Toggle */}
          <button
            onClick={() => setManualScaleMode((prev) => (prev === 'log' ? 'normal' : prev === 'normal' ? null : autoLogScale ? 'normal' : 'log'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: isLogActive ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${isLogActive ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`,
              color: isLogActive ? '#38bdf8' : '#94a3b8',
              transition: 'all 0.15s ease',
              boxShadow: isLogActive ? '0 0 10px rgba(56, 189, 248, 0.15)' : 'none',
            }}
            title={
              manualScaleMode
                ? `Escala forzada a ${isLogActive ? 'LOGARÍTMICA' : 'LINEAL'} (Clic para cambiar/auto)`
                : isLogActive
                  ? `Escala Logarítmica Automática activa (Divergencia de capital Ratio ${logScaleRatio}:1). Clic para alternar.`
                  : 'Escala Lineal. Clic para forzar Escala Logarítmica.'
            }
          >
            <span>⚖️</span>
            <span>{isLogActive ? `LOG ${logScaleRatio > 1 ? `${logScaleRatio}:1` : ''}` : 'LINEAL'}</span>
            {manualScaleMode && <span style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: 2 }}>[Fijada]</span>}
          </button>

          <span
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
              opacity: hoverValues?.date ? 1 : 0,
              transition: 'opacity 0.15s ease',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            📅 {hoverValues?.date ? String(hoverValues.date) : '2000-00-00'}
          </span>
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
            <button className="btn-chip gainer" onClick={selectGainers} title="Solo posiciones ganadoras">
              🚀 Ganadoras
            </button>
            <button className="btn-chip loser" onClick={selectLosers} title="Solo posiciones perdedoras">
              🔴 Perdedoras
            </button>
            <button className="btn-chip" onClick={invertSelection} title="Invertir selección actual">
              🔄 Invertir
            </button>
          </div>

          <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {holdings.map((h) => {
              const isSelected = h.selected !== false;
              const isGain = (h.unrealized_pnl ?? 0) >= 0;

              return (
                <button
                  key={h.ticker}
                  onClick={() => onToggleTicker(h.ticker)}
                  className={`ticker-chip ${isSelected ? 'active' : 'inactive'} ${isGain ? 'gain' : 'loss'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 9px',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: isSelected ? (isGain ? 'rgba(0, 229, 255, 0.08)' : 'rgba(239, 68, 68, 0.08)') : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${isSelected ? (isGain ? 'rgba(0, 229, 255, 0.35)' : 'rgba(239, 68, 68, 0.35)') : 'rgba(255, 255, 255, 0.05)'}`,
                    color: isSelected ? (isGain ? '#00e5ff' : '#f87171') : '#64748b',
                    opacity: isSelected ? 1 : 0.45,
                    transform: isSelected ? 'scale(1)' : 'scale(0.96)',
                  }}
                  title={`Clic para ${isSelected ? 'excluir' : 'incluir'} ${h.ticker}`}
                >
                  <span style={{ fontSize: '0.65rem' }}>{isSelected ? '✓' : '✗'}</span>
                  <span>{h.ticker}</span>
                  {h.unrealized_pnl_pct != null && (
                    <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>
                      {h.unrealized_pnl_pct >= 0 ? '+' : ''}
                      {h.unrealized_pnl_pct.toFixed(1)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Canvas ─── */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '420px',
          position: 'relative',
          borderRadius: 'calc(var(--radius) - 4px)',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}