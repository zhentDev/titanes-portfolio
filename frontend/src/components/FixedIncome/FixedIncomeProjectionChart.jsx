import { useEffect, useRef, memo } from 'react';
import { createChart, ColorType, LineStyle, PriceScaleMode } from 'lightweight-charts';

function FixedIncomeProjectionChart({ projectionData, currency = 'COP', mode = 'NOMINAL' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});

  useEffect(() => {
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
        vertLine: { color: 'rgba(16,185,129,0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(16,185,129,0.4)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#10b981',
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        barSpacing: 10,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const chart = chartRef.current;

    // Projected Balance — Emerald Glowing Area
    seriesRef.current.balance = chart.addAreaSeries({
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.28)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: mode === 'REAL' ? 'Poder Adquisitivo Real' : 'Patrimonio Proyectado',
    });

    // Base Capital Invertido — Amber Dashed Line
    seriesRef.current.capital = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Capital Base',
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // Update Series Data
  useEffect(() => {
    if (!chartRef.current || !projectionData?.length) return;

    const formattedBalance = projectionData.map((d) => ({
      time: d.date,
      value: Number(d.projectedValue),
    }));

    const formattedCapital = projectionData.map((d) => ({
      time: d.date,
      value: Number(d.baseCapital),
    }));

    seriesRef.current.balance?.setData(formattedBalance);
    seriesRef.current.capital?.setData(formattedCapital);
    chartRef.current.timeScale().fitContent();
  }, [projectionData]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 320, background: 'rgba(15, 23, 42, 0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>
            {mode === 'REAL' ? 'Proyección de Crecimiento Real (Descontando Inflación)' : 'Proyección de Interés Compuesto'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: '#94a3b8' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Saldo Proyectado
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} /> Capital Base
          </span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 260 }} />
    </div>
  );
}

export default memo(FixedIncomeProjectionChart);
