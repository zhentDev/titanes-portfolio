import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import { usePortfolioStore } from '../store/portfolioStore';

const COLORS = {
  sp500: '#f59e0b',
  nasdaq: '#a855f7',
  mm20: '#10b981',
};

export const SYNTHETIC_RETURNS = {
  '1W': { sp: 0.005, nasdaq: 0.008, strat: 0.015, days: 7, points: 7 },
  '1M': { sp: 0.02, nasdaq: 0.03, strat: 0.05, days: 30, points: 30 },
  '3M': { sp: 0.05, nasdaq: 0.08, strat: 0.12, days: 90, points: 45 },
  '6M': { sp: 0.08, nasdaq: 0.12, strat: 0.20, days: 180, points: 60 },
  '1Y': { sp: 0.143, nasdaq: 0.162, strat: 0.278, days: 365, points: 90 },
  '3Y': { sp: 0.45, nasdaq: 0.55, strat: 1.10, days: 1095, points: 120 },
  '5Y': { sp: 0.85, nasdaq: 1.10, strat: 2.50, days: 1825, points: 150 },
  'MAX': { sp: 2.808, nasdaq: 3.50, strat: 10.626, days: 3650, points: 180 },
};

// Generador pseudoaleatorio predecible para que la curva no salte con cada render
function seededRandom(seed) {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateSyntheticData(baseActive, period) {
  const pData = SYNTHETIC_RETURNS[period] || SYNTHETIC_RETURNS['MAX'];
  const data = { sp500: [], nasdaq: [], strat: [] };
  
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const pointsCount = pData.points;
  const dayStep = pData.days / pointsCount;

  // 1. Generate standard random walks
  const rawWalks = { sp500: [0], nasdaq: [0], strat: [0] };
  let seed = pData.days; // seed based on period length
  
  for (let i = 1; i <= pointsCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - pData.days + Math.round(i * dayStep));
    const year = d.getFullYear();
    
    // Base random step (-0.5 to 0.5)
    let stepSP = seededRandom(seed++) - 0.5;
    let stepND = seededRandom(seed++) - 0.5;
    let stepMM = seededRandom(seed++) - 0.5;
    
    // Simulate historical shocks if the date falls in known bear markets
    if (year === 2020 && d.getMonth() === 2) { // COVID crash March 2020
      stepSP -= 3; stepND -= 2; stepMM -= 4;
    } else if (year === 2022) { // 2022 Bear Market
      stepSP -= 0.2; stepND -= 0.3; stepMM -= 0.4;
    } else if (year === 2018 && d.getMonth() === 11) { // Late 2018 crash
      stepSP -= 2; stepND -= 2; stepMM -= 3;
    }

    rawWalks.sp500.push(rawWalks.sp500[i - 1] + stepSP);
    rawWalks.nasdaq.push(rawWalks.nasdaq[i - 1] + stepND);
    rawWalks.strat.push(rawWalks.strat[i - 1] + stepMM);
  }

  // 2. Tie the random walks to the exact target returns (Brownian bridge concept)
  // End values of the raw walks
  const endSP = rawWalks.sp500[pointsCount];
  const endND = rawWalks.nasdaq[pointsCount];
  const endMM = rawWalks.strat[pointsCount];

  for (let i = 0; i <= pointsCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - pData.days + Math.round(i * dayStep));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const timeStr = `${year}-${month}-${day}`;
    
    const progress = i / pointsCount;
    
    // Calculate the correction needed to force the endpoint to exactly match pData target
    const correctionSP = (pData.sp - endSP) * progress;
    const correctionND = (pData.nasdaq - endND) * progress;
    const correctionMM = (pData.strat - endMM) * progress;

    // Apply the structural curve (e.g. exponential baseline) + the corrected random walk
    // We scale down the random walk amplitude based on period to keep it looking like a stock chart
    const volScale = Math.min(0.2, pData.strat / 10);
    
    const valSP = baseActive * (1 + pData.sp * Math.pow(progress, 1.2) + (rawWalks.sp500[i] + correctionSP) * volScale * 0.5);
    const valND = baseActive * (1 + pData.nasdaq * Math.pow(progress, 1.2) + (rawWalks.nasdaq[i] + correctionND) * volScale * 0.7);
    const valMM = baseActive * (1 + pData.strat * Math.pow(progress, 1.4) + (rawWalks.strat[i] + correctionMM) * volScale);

    data.sp500.push({ time: timeStr, value: Math.max(1, valSP) });
    data.nasdaq.push({ time: timeStr, value: Math.max(1, valND) });
    data.strat.push({ time: timeStr, value: Math.max(1, valMM) });
  }

  // Ensure unique dates in case of DST overlaps
  const uniqueData = { sp500: [], nasdaq: [], strat: [] };
  const seenDates = new Set();
  for (let i = 0; i < data.sp500.length; i++) {
    if (!seenDates.has(data.sp500[i].time)) {
      seenDates.add(data.sp500[i].time);
      uniqueData.sp500.push(data.sp500[i]);
      uniqueData.nasdaq.push(data.nasdaq[i]);
      uniqueData.strat.push(data.strat[i]);
    }
  }

  // Ensure first point exactly matches baseActive and last point exactly matches target return
  if (uniqueData.sp500.length > 0) {
    uniqueData.sp500[0].value = baseActive;
    uniqueData.nasdaq[0].value = baseActive;
    uniqueData.strat[0].value = baseActive;

    const last = uniqueData.sp500.length - 1;
    uniqueData.sp500[last].value = baseActive * (1 + pData.sp);
    uniqueData.nasdaq[last].value = baseActive * (1 + pData.nasdaq);
    uniqueData.strat[last].value = baseActive * (1 + pData.strat);
  }

  return uniqueData;
}

export default function StrategyChart({ strategy, activeInvested }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);

  const { period } = usePortfolioStore();

  const [visibleSeries, setVisibleSeries] = useState({
    sp500: strategy?.benchmark !== 'NASDAQ',
    nasdaq: strategy?.benchmark === 'NASDAQ',
    strat: true,
  });

  const handleToggle = (key) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const chartData = useMemo(() => generateSyntheticData(activeInvested || 500, period), [activeInvested, period]);

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

    seriesRef.current.strat = chart.addAreaSeries({
      lineColor: strategy?.color || COLORS.mm20,
      topColor: `${strategy?.color || COLORS.mm20}40`,
      bottomColor: `${strategy?.color || COLORS.mm20}00`,
      lineWidth: 2,
      priceLineVisible: false,
      title: strategy?.name || 'Estrategia',
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }
      const spVal = param.seriesData.get(seriesRef.current.sp500)?.value;
      const nsdVal = param.seriesData.get(seriesRef.current.nasdaq)?.value;
      const mmVal = param.seriesData.get(seriesRef.current.strat)?.value;
      setHoverValues({
        date: param.time,
        sp500: spVal,
        nasdaq: nsdVal,
        strat: mmVal,
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

  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    seriesRef.current.sp500?.setData(chartData.sp500);
    seriesRef.current.nasdaq?.setData(chartData.nasdaq);
    seriesRef.current.strat?.setData(chartData.strat);
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  const lastSP = chartData.sp500[chartData.sp500.length - 1]?.value;
  const lastNasdaq = chartData.nasdaq[chartData.nasdaq.length - 1]?.value;
  const lastStrat = chartData.strat[chartData.strat.length - 1]?.value;

  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;
  const currentStrat = hoverValues?.strat ?? lastStrat;

  const baseVal = activeInvested || 500;

  const spPct = currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0;
  const nasdaqPct = currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0;
  const stratPct = currentStrat ? ((currentStrat - baseVal) / baseVal) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
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

        <button
          onClick={() => handleToggle('strat')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: visibleSeries.strat ? `${strategy?.color || COLORS.mm20}20` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${visibleSeries.strat ? `${strategy?.color || COLORS.mm20}66` : '#334155'}`,
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            color: visibleSeries.strat ? '#f1f5f9' : '#94a3b8', fontSize: '0.75rem',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: strategy?.color || COLORS.mm20, opacity: visibleSeries.strat ? 1 : 0.3 }} />
          <strong>{strategy?.name || 'Estrategia'} {strategy?.isSystem ? 'PRO' : ''}</strong>
          <span className="mono" style={{ color: strategy?.color || COLORS.mm20, fontWeight: 700 }}>${currentStrat?.toFixed(2)}</span>
          <span style={{ color: stratPct >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>({stratPct >= 0 ? '+' : ''}{stratPct.toFixed(2)}%)</span>
        </button>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '320px', position: 'relative' }} />
    </div>
  );
}
