/**
 * NavChart — TradingView Lightweight Charts integration.
 * Renders portfolio NAV vs S&P500 vs NASDAQ as a multi-line area chart.
 */
import { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

const COLORS = {
  nav:    '#00e5ff',
  sp500:  '#f59e0b',
  nasdaq: '#a855f7',
};

export default function NavChart({ navData, sp500Data, nasdaqData, investment }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});

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
        textColor: '#6b7280',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        barSpacing: 4,
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
      lineWidth: 1.5,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'S&P 500',
    });

    // NASDAQ — purple line
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 1.5,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'NASDAQ',
    });

    // Base investment line
    seriesRef.current.base = chart.addLineSeries({
      color: 'rgba(255,255,255,0.15)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Base',
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

  // Update series data
  useEffect(() => {
    if (!chartRef.current || !navData?.length) return;

    const toSeries = (arr) =>
      arr
        .map((d) => {
          let t = d.date;
          if (typeof t === 'string') {
             // Convert string YYYY-MM-DD (or any date string) to UNIX timestamp in seconds
             t = Math.floor(new Date(t).getTime() / 1000);
          }
          return { time: t, value: d.value };
        })
        .sort((a, b) => (a.time > b.time ? 1 : -1));

    seriesRef.current.nav?.setData(toSeries(navData));

    if (sp500Data?.length)  seriesRef.current.sp500?.setData(toSeries(sp500Data));
    if (nasdaqData?.length) seriesRef.current.nasdaq?.setData(toSeries(nasdaqData));

    // Base investment horizontal line
    if (navData.length > 1) {
      const baseLine = [
        { date: navData[0].date, value: investment },
        { date: navData[navData.length - 1].date, value: investment },
      ];
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, investment]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={{
        display: 'flex', gap: '16px', marginBottom: '12px',
        fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace",
      }}>
        <LegendItem color={COLORS.nav}    label="Portfolio" />
        <LegendItem color={COLORS.sp500}  label="S&P 500"   dashed />
        <LegendItem color={COLORS.nasdaq} label="NASDAQ"    dotted />
        <LegendItem color="rgba(255,255,255,0.2)" label="Base ($)" dashed />
      </div>
      <div ref={containerRef} style={{ height: '340px', width: '100%' }} />
    </div>
  );
}

function LegendItem({ color, label, dashed, dotted }) {
  const style = {
    width: 24, height: 2,
    background: dashed || dotted ? 'none' : color,
    borderTop: dashed ? `2px dashed ${color}` : dotted ? `2px dotted ${color}` : 'none',
    borderRadius: 2, flexShrink: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
      <div style={style} />
      <span>{label}</span>
    </div>
  );
}
