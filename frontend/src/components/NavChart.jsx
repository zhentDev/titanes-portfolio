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
    });

    // S&P 500 — amber line
    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'S&P 500',
    });

    // NASDAQ — purple line
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'NASDAQ',
    });

    // Base investment line
    seriesRef.current.base = chart.addLineSeries({
      color: 'rgba(255,255,255,0.18)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Base',
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

  // Helper to convert array to Lightweight Charts format with YYYY-MM-DD
  const toSeries = (arr) =>
    (arr || [])
      .filter((d) => d && d.date && d.value != null && !isNaN(d.value))
      .map((d) => ({
        time: String(d.date).slice(0, 10),
        value: Number(d.value),
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

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

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend with interactive values */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '12px',
        fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
      }}>
        <LegendItem
          color={COLORS.nav}
          label="Titanes (Activo)"
          value={currentNav != null ? `$${Number(currentNav).toFixed(2)}` : null}
        />
        <LegendItem
          color={COLORS.sp500}
          label="S&P 500"
          value={currentSP != null ? `$${Number(currentSP).toFixed(2)}` : null}
          dashed
        />
        <LegendItem
          color={COLORS.nasdaq}
          label="NASDAQ"
          value={currentNasdaq != null ? `$${Number(currentNasdaq).toFixed(2)}` : null}
          dotted
        />
        <LegendItem
          color="rgba(255,255,255,0.25)"
          label="Base Activa"
          value={`$${Number(baseActive).toFixed(2)}`}
          dashed
        />
        {hoverValues?.date && (
          <span style={{ color: '#64748b', marginLeft: 'auto' }}>
            📅 {String(hoverValues.date)}
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ height: '340px', width: '100%' }} />
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

