import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

const COLORS = {
  sp500: '#f59e0b',
  nasdaq: '#a855f7',
  mm20: '#10b981',
};

// Generador de datos sintéticos visuales para 10 años (2014-2024)
function generateSyntheticData(baseActive) {
  const points = 120; // 120 meses = 10 años
  const startDate = new Date('2014-01-01');
  
  const sp500TotalReturn = 2.808; // +280.8%
  const nasdaqTotalReturn = 3.500; // +350.0% aprox
  const mm20TotalReturn = 10.626; // +1,062.6%

  const data = { sp500: [], nasdaq: [], mm20: [] };

  for (let i = 0; i <= points; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const timeStr = d.toISOString().split('T')[0];
    
    // Curva exponencial suave con algo de ruido (simulado simple para visualización fluida)
    const progress = i / points;
    const curve = Math.pow(progress, 1.5); 
    
    data.sp500.push({
      time: timeStr,
      value: baseActive * (1 + (sp500TotalReturn * curve))
    });
    
    data.nasdaq.push({
      time: timeStr,
      value: baseActive * (1 + (nasdaqTotalReturn * curve))
    });
    
    data.mm20.push({
      time: timeStr,
      value: baseActive * (1 + (mm20TotalReturn * curve))
    });
  }

  return data;
}

export default function MidCapsChart({ activeInvested }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);

  const [visibleSeries, setVisibleSeries] = useState({
    sp500: true,
    nasdaq: true,
    mm20: true,
  });

  const handleToggle = (key) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const chartData = useMemo(() => generateSyntheticData(activeInvested || 500), [activeInvested]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    Object.entries(visibleSeries).forEach(([key, isVis]) => {
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
        vertLine: { color: 'rgba(16, 185, 129, 0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(16, 185, 129, 0.4)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        textColor: '#94a3b8',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        fixLeftEdge: true,
        fixRightEdge: true,
      },
    });

    const chart = chartRef.current;

    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      title: 'S&P MidCap',
    });

    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      title: 'NASDAQ',
    });

    // Curva principal MM20
    seriesRef.current.mm20 = chart.addAreaSeries({
      lineColor: COLORS.mm20,
      topColor: 'rgba(16, 185, 129, 0.25)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
      title: 'MM20',
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }
      const spVal = param.seriesData.get(seriesRef.current.sp500)?.value;
      const nsdVal = param.seriesData.get(seriesRef.current.nasdaq)?.value;
      const mmVal = param.seriesData.get(seriesRef.current.mm20)?.value;
      setHoverValues({
        date: param.time,
        sp500: spVal,
        nasdaq: nsdVal,
        mm20: mmVal,
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

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Actualizar datos
  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    seriesRef.current.sp500?.setData(chartData.sp500);
    seriesRef.current.nasdaq?.setData(chartData.nasdaq);
    seriesRef.current.mm20?.setData(chartData.mm20);
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  // Cálculos de cabecera
  const lastSP = chartData.sp500[chartData.sp500.length - 1]?.value;
  const lastNasdaq = chartData.nasdaq[chartData.nasdaq.length - 1]?.value;
  const lastMM20 = chartData.mm20[chartData.mm20.length - 1]?.value;

  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;
  const currentMM20 = hoverValues?.mm20 ?? lastMM20;

  const baseVal = activeInvested || 500;

  const spPct = currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0;
  const nasdaqPct = currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0;
  const mm20Pct = currentMM20 ? ((currentMM20 - baseVal) / baseVal) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* S&P MidCap */}
        <button
          onClick={() => handleToggle('sp500')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: visibleSeries.sp500 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${visibleSeries.sp500 ? 'rgba(245, 158, 11, 0.3)' : '#334155'}`,
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            color: visibleSeries.sp500 ? '#f1f5f9' : '#94a3b8', fontSize: '0.75rem',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.sp500, opacity: visibleSeries.sp500 ? 1 : 0.3 }} />
          <strong>S&P MidCap 400</strong>
          <span className="mono" style={{ color: '#fbbf24', fontWeight: 700 }}>${currentSP?.toFixed(2)}</span>
          <span style={{ color: spPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>({spPct >= 0 ? '+' : ''}{spPct.toFixed(2)}%)</span>
        </button>

        {/* NASDAQ */}
        <button
          onClick={() => handleToggle('nasdaq')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: visibleSeries.nasdaq ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${visibleSeries.nasdaq ? 'rgba(168, 85, 247, 0.3)' : '#334155'}`,
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            color: visibleSeries.nasdaq ? '#f1f5f9' : '#94a3b8', fontSize: '0.75rem',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.nasdaq, opacity: visibleSeries.nasdaq ? 1 : 0.3 }} />
          <strong>NASDAQ</strong>
          <span className="mono" style={{ color: '#c084fc', fontWeight: 700 }}>${currentNasdaq?.toFixed(2)}</span>
          <span style={{ color: nasdaqPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>({nasdaqPct >= 0 ? '+' : ''}{nasdaqPct.toFixed(2)}%)</span>
        </button>

        {/* MM20 */}
        <button
          onClick={() => handleToggle('mm20')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: visibleSeries.mm20 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${visibleSeries.mm20 ? 'rgba(16, 185, 129, 0.4)' : '#334155'}`,
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            color: visibleSeries.mm20 ? '#f1f5f9' : '#94a3b8', fontSize: '0.75rem',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.mm20, opacity: visibleSeries.mm20 ? 1 : 0.3 }} />
          <strong>MM20 PRO</strong>
          <span className="mono" style={{ color: '#10b981', fontWeight: 700 }}>${currentMM20?.toFixed(2)}</span>
          <span style={{ color: mm20Pct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>({mm20Pct >= 0 ? '+' : ''}{mm20Pct.toFixed(2)}%)</span>
        </button>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '320px', position: 'relative' }} />
    </div>
  );
}
