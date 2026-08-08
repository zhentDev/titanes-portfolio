import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

const COLORS = {
  nav: '#00e5ff',
  sp500: '#f59e0b',
  nasdaq: '#a855f7',
};

export default function NavChart({ navData, sp500Data, nasdaqData, investment }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);
  const [visibleSeries, setVisibleSeries] = useState({
    nav: true,
    sp500: true,
    nasdaq: true,
    base: true,
  });

  const toggleSeries = (key) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (seriesRef.current[key]) {
        seriesRef.current[key].applyOptions({ visible: next[key] });
      }
      return next;
    });
  };

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
      rightPriceScale: {
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
      topColor: 'rgba(0, 229, 255, 0.18)',
      bottomColor: 'rgba(0, 229, 255, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Portfolio',
      visible: visibleSeries.nav,
    });

    // S&P 500 — amber line
    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'S&P 500',
      visible: visibleSeries.sp500,
    });

    // NASDAQ — purple line
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'NASDAQ',
      visible: visibleSeries.nasdaq,
    });

    // Base investment line
    seriesRef.current.base = chart.addLineSeries({
      color: 'rgba(255,255,255,0.18)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Base',
      visible: visibleSeries.base,
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
      setHoverValues({
        date: param.time,
        nav: navVal != null ? navVal : null,
        sp500: spVal != null ? spVal : null,
        nasdaq: nsdVal != null ? nsdVal : null,
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

  // Init chart once
  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Helper to convert array to Lightweight Charts format with YYYY-MM-DD or Unix timestamp
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

  // Update series data
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

    // Base investment horizontal line
    if (navData.length > 1) {
      const baseVal = navData[0].value;
      const baseLine = [
        { date: navData[0].date, value: baseVal },
        { date: navData[navData.length - 1].date, value: baseVal },
      ];
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, investment]);

  // Latest fallback values
  const lastNav = navData?.[navData.length - 1]?.value;
  const lastSP = sp500Data?.[sp500Data.length - 1]?.value;
  const lastNasdaq = nasdaqData?.[nasdaqData.length - 1]?.value;
  const baseActive = navData?.[0]?.value ?? investment;

  const currentNav = hoverValues?.nav ?? lastNav;
  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;

  // Real % returns from base active capital
  const navPct = currentNav && baseActive ? ((currentNav - baseActive) / baseActive) * 100 : null;
  const spPct = currentSP && baseActive ? ((currentSP - baseActive) / baseActive) * 100 : null;
  const nasdaqPct = currentNasdaq && baseActive ? ((currentNasdaq - baseActive) / baseActive) * 100 : null;

  return (
    <div>
      {/* Dynamic interactive legend with toggle buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Titanes Portfolio */}
          <button
            onClick={() => toggleSeries('nav')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries.nav ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries.nav ? 'rgba(0, 229, 255, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries.nav ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
            }}
            title="Clic para mostrar/ocultar curva de Titanes"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.nav, opacity: visibleSeries.nav ? 1 : 0.3 }} />
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
            onClick={() => toggleSeries('sp500')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries.sp500 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries.sp500 ? 'rgba(245, 158, 11, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries.sp500 ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
            }}
            title="Clic para mostrar/ocultar S&P 500"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.sp500, opacity: visibleSeries.sp500 ? 1 : 0.3 }} />
            <span>S&P 500</span>
            {currentSP != null && (
              <span className="mono" style={{ color: '#fbbf24', fontWeight: 600 }}>
                ${currentSP.toFixed(2)}
              </span>
            )}
            {spPct != null && (
              <span style={{ color: spPct >= 0 ? '#fbbf24' : '#ef4444', fontSize: '0.7rem' }}>
                ({spPct >= 0 ? '+' : ''}{spPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* NASDAQ */}
          <button
            onClick={() => toggleSeries('nasdaq')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: visibleSeries.nasdaq ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${visibleSeries.nasdaq ? 'rgba(168, 85, 247, 0.3)' : '#334155'}`,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: visibleSeries.nasdaq ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.75rem',
            }}
            title="Clic para mostrar/ocultar NASDAQ"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.nasdaq, opacity: visibleSeries.nasdaq ? 1 : 0.3 }} />
            <span>NASDAQ</span>
            {currentNasdaq != null && (
              <span className="mono" style={{ color: '#c084fc', fontWeight: 600 }}>
                ${currentNasdaq.toFixed(2)}
              </span>
            )}
            {nasdaqPct != null && (
              <span style={{ color: nasdaqPct >= 0 ? '#c084fc' : '#ef4444', fontSize: '0.7rem' }}>
                ({nasdaqPct >= 0 ? '+' : ''}{nasdaqPct.toFixed(2)}%)
              </span>
            )}
          </button>
        </div>

        {hoverValues?.date && (
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
            📅 {String(hoverValues.date)}
          </span>
        )}
      </div>

      {/* Chart container */}
      <div ref={containerRef} style={{ width: '100%', height: '360px', position: 'relative' }} />
    </div>
  );
}

function LegendItem({ color, label, value, dashed, dotted }) {
  const style = {
    width: 20, height: 2,
    background: dashed || dotted ? 'none' : color,
    borderTop: dashed ? `2px dashed ${color}` : dotted ? `2px dotted ${color}` : 'none',
    borderRadius: 2, flexShrink: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
      <div style={style} />
      <span style={{ color: '#cbd5e1' }}>{label}:</span>
      {value && <strong style={{ color, fontWeight: 600 }}>{value}</strong>}
    </div>
  );
}

