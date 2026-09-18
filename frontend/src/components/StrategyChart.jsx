import { ColorType, LineStyle, createChart } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortfolioStore } from "../store/portfolioStore";
import { useTheme } from "../context/ThemeContext";
import { getChartColors, applyChartTheme } from "../utils/chartTheme";

const COLORS = {
  sp500: "#f59e0b",
  nasdaq: "#a855f7",
  mm20: "#10b981",
};

export const SYNTHETIC_RETURNS = {
  "1D": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1, points: 7 },
  "1W": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 7, points: 7 },
  "1M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 30, points: 30 },
  "3M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 90, points: 45 },
  "6M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 180, points: 60 },
  "1Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 365, points: 90 },
  "3Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1095, points: 120 },
  "5Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1825, points: 150 },
  MAX: { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 90, points: 45 },
};

// Generador pseudoaleatorio predecible para que la curva no salte con cada render
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateSyntheticData(
  baseActive,
  period,
  firstInvestDate,
  rebalances = [],
  slotValue = 0,
  targetReturns = null,
  navData = null,
  strategy = null,
) {
  // If navData with valid historical series is provided by backend, use real data directly!
  if (navData && Array.isArray(navData.nav) && navData.nav.length > 1) {
    const isMidCap = strategy?.benchmark === "S&P MidCap 400" || strategy?.id === "strat_mm20";
    const benchmarkPoints = isMidCap && Array.isArray(navData.mm20) && navData.mm20.length > 0
      ? navData.mm20
      : (Array.isArray(navData.sp500) ? navData.sp500 : []);
    const spPoints = benchmarkPoints;
    const nsdPoints = Array.isArray(navData.nasdaq) ? navData.nasdaq : [];

    const spMap = new Map(spPoints.map((p) => [p.date, p.value]));
    const nsdMap = new Map(nsdPoints.map((p) => [p.date, p.value]));

    const sortedRebalances = Array.isArray(rebalances) && rebalances.length > 0
      ? [...rebalances].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
      : [];
    const initialCapital = (sortedRebalances.length > 0 && slotValue > 0)
      ? (sortedRebalances[0].tickers?.length || 0) * slotValue
      : (baseActive || 500);

    const getCap = (dateStr) => {
      if (sortedRebalances.length > 0 && slotValue > 0) {
        const valid = sortedRebalances.filter((r) => (r.rebalance_date || r.date) <= dateStr);
        if (valid.length > 0) {
          return (valid[valid.length - 1].tickers?.length || 0) * slotValue;
        }
        return initialCapital;
      }
      return baseActive || 500;
    };

    const sp500 = [];
    const nasdaq = [];
    const strat = [];
    const baseLine = [];

    navData.nav.forEach((pt) => {
      const rawDate = pt.date;
      // If rawDate is numeric string or number (unix seconds), convert to Number for lightweight-charts
      const d = (!isNaN(Number(rawDate)) && String(rawDate).trim() !== "") ? Number(rawDate) : rawDate;
      const stratVal = pt.value || pt.stock_value || baseActive;
      const capVal = pt.active_invested || getCap(String(rawDate));
      strat.push({ time: d, value: stratVal });
      baseLine.push({ time: d, value: capVal });
      sp500.push({ time: d, value: spMap.get(rawDate) ?? capVal });
      nasdaq.push({ time: d, value: nsdMap.get(rawDate) ?? capVal });
    });

    if (strat.length > 0) {
      return { sp500, nasdaq, strat, baseLine };
    }
  }

  let effectivePeriod = period;
  if (effectivePeriod === "MAX") {
    effectivePeriod = "3M";
  }
  const defaultPData = SYNTHETIC_RETURNS[effectivePeriod] || SYNTHETIC_RETURNS["3M"];
  const pData = {
    sp: targetReturns?.sp ?? defaultPData.sp,
    nasdaq: targetReturns?.nasdaq ?? defaultPData.nasdaq,
    strat: targetReturns?.strat ?? defaultPData.strat,
    days: defaultPData.days,
    points: defaultPData.points,
  };
  const data = { sp500: [], nasdaq: [], strat: [], baseLine: [] };

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Ordenar rebalanceos cronológicamente si existen
  const sortedRebalances = Array.isArray(rebalances) && rebalances.length > 0
    ? [...rebalances].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
    : [];

  const initialCapital = (sortedRebalances.length > 0 && slotValue > 0)
    ? (sortedRebalances[0].tickers?.length || 0) * slotValue
    : (baseActive || 500);

  const getCapitalOnDate = (dateStr) => {
    if (sortedRebalances.length > 0 && slotValue > 0) {
      const valid = sortedRebalances.filter((r) => (r.rebalance_date || r.date) <= dateStr);
      if (valid.length > 0) {
        return (valid[valid.length - 1].tickers?.length || 0) * slotValue;
      }
      return initialCapital;
    }
    return baseActive || 500;
  };

  // Si hay firstInvestDate y el periodo seleccionado o la fecha de inicio es anterior a pData.days,
  // expandimos spanDays para abarcar desde firstInvestDate (ej. 3 de agosto)
  let spanDays = pData.days;
  if (firstInvestDate) {
    const dInvest = new Date(`${firstInvestDate}T12:00:00`);
    if (!isNaN(dInvest.getTime())) {
      const daysSinceInvest = Math.ceil((today.getTime() - dInvest.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceInvest > 0) {
        spanDays = Math.max(spanDays, daysSinceInvest);
      }
    }
  }

  const pointsCount = Math.max(pData.points, spanDays);
  const dayStep = spanDays / pointsCount;

  // 1. Generate standard random walks
  const rawWalks = { sp500: [0], nasdaq: [0], strat: [0] };
  let seed = spanDays; // seed based on period length

  for (let i = 1; i <= pointsCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - spanDays + Math.round(i * dayStep));
    const year = d.getFullYear();

    // Base random step (-0.5 to 0.5)
    let stepSP = seededRandom(seed++) - 0.5;
    let stepND = seededRandom(seed++) - 0.5;
    let stepMM = seededRandom(seed++) - 0.5;

    // Simulate historical shocks if the date falls in known bear markets
    if (year === 2020 && d.getMonth() === 2) {
      // COVID crash March 2020
      stepSP -= 3;
      stepND -= 2;
      stepMM -= 4;
    } else if (year === 2022) {
      // 2022 Bear Market
      stepSP -= 0.2;
      stepND -= 0.3;
      stepMM -= 0.4;
    } else if (year === 2018 && d.getMonth() === 11) {
      // Late 2018 crash
      stepSP -= 2;
      stepND -= 2;
      stepMM -= 3;
    }

    rawWalks.sp500.push(rawWalks.sp500[i - 1] + stepSP);
    rawWalks.nasdaq.push(rawWalks.nasdaq[i - 1] + stepND);
    rawWalks.strat.push(rawWalks.strat[i - 1] + stepMM);
  }

  // 2. Tie the random walks to the exact target returns (Brownian bridge concept)
  const endSP = rawWalks.sp500[pointsCount];
  const endND = rawWalks.nasdaq[pointsCount];
  const endMM = rawWalks.strat[pointsCount];

  for (let i = 0; i <= pointsCount; i++) {
    let timeVal;
    if (period === "1D") {
      // Intraday hours from 09:30 to 15:30 (intervals of 1h)
      const baseHour = new Date(today);
      baseHour.setHours(9 + Math.floor(i), 30, 0, 0);
      timeVal = Math.floor(baseHour.getTime() / 1000);
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - spanDays + Math.round(i * dayStep));
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      timeVal = `${year}-${month}-${day}`;
    }

    const progress = i / pointsCount;

    // Calculate the correction needed to force the endpoint to exactly match pData target
    const correctionSP = (pData.sp - endSP) * progress;
    const correctionND = (pData.nasdaq - endND) * progress;
    const correctionMM = (pData.strat - endMM) * progress;

    const volScale = Math.max(0.005, Math.min(0.04, Math.abs(pData.strat || 0.05) / 10));

    const capOnDate = getCapitalOnDate(typeof timeVal === "string" ? timeVal : today.toISOString().split("T")[0]);

    const stratGrowth = pData.strat * Math.pow(progress, 1.4) + (rawWalks.strat[i] + correctionMM) * volScale;
    const spGrowth = pData.sp * Math.pow(progress, 1.2) + (rawWalks.sp500[i] + correctionSP) * volScale * 0.5;
    const ndGrowth = pData.nasdaq * Math.pow(progress, 1.2) + (rawWalks.nasdaq[i] + correctionND) * volScale * 0.7;

    const valSP = capOnDate * (1 + spGrowth);
    const valND = capOnDate * (1 + ndGrowth);
    const valMM = capOnDate * (1 + stratGrowth);

    data.sp500.push({ time: timeVal, value: Math.max(1, valSP) });
    data.nasdaq.push({ time: timeVal, value: Math.max(1, valND) });
    data.strat.push({ time: timeVal, value: Math.max(1, valMM) });
    data.baseLine.push({ time: timeVal, value: Math.max(1, capOnDate) });
  }

  // Ensure unique dates in case of DST overlaps
  const uniqueData = { sp500: [], nasdaq: [], strat: [], baseLine: [] };
  const seenDates = new Set();
  for (let i = 0; i < data.sp500.length; i++) {
    if (!seenDates.has(data.sp500[i].time)) {
      seenDates.add(data.sp500[i].time);
      uniqueData.sp500.push(data.sp500[i]);
      uniqueData.nasdaq.push(data.nasdaq[i]);
      uniqueData.strat.push(data.strat[i]);
      uniqueData.baseLine.push(data.baseLine[i]);
    }
  }

  // Ensure first point matches initial capital and last point matches final target return
  if (uniqueData.sp500.length > 0) {
    const firstTime = uniqueData.strat[0].time;
    const firstCap = getCapitalOnDate(typeof firstTime === "string" ? firstTime : today.toISOString().split("T")[0]);
    uniqueData.sp500[0].value = firstCap;
    uniqueData.nasdaq[0].value = firstCap;
    uniqueData.strat[0].value = firstCap;
    uniqueData.baseLine[0].value = firstCap;

    const last = uniqueData.sp500.length - 1;
    const lastTime = uniqueData.strat[last].time;
    const lastCap = getCapitalOnDate(typeof lastTime === "string" ? lastTime : today.toISOString().split("T")[0]);
    uniqueData.sp500[last].value = lastCap * (1 + pData.sp);
    uniqueData.nasdaq[last].value = lastCap * (1 + pData.nasdaq);
    uniqueData.strat[last].value = lastCap * (1 + pData.strat);
    uniqueData.baseLine[last].value = lastCap;
  }

  // Recorte a la fecha de la primera inversión: nunca se muestra historial anterior (solo para periodos multidiarios)
  if (firstInvestDate && period !== "1D") {
    const clipped = {
      sp500: uniqueData.sp500.filter((pt) => pt.time >= firstInvestDate),
      nasdaq: uniqueData.nasdaq.filter((pt) => pt.time >= firstInvestDate),
      strat: uniqueData.strat.filter((pt) => pt.time >= firstInvestDate),
      baseLine: uniqueData.baseLine.filter((pt) => pt.time >= firstInvestDate),
    };
    if (clipped.strat.length > 0) {
      const firstCap = getCapitalOnDate(clipped.strat[0].time);
      clipped.sp500[0].value = firstCap;
      clipped.nasdaq[0].value = firstCap;
      clipped.strat[0].value = firstCap;
      clipped.baseLine[0].value = firstCap;
      return clipped;
    }
  }

  return uniqueData;
}

export default function StrategyChart({
  strategy,
  activeInvested,
  period: periodProp,
  firstInvestDate,
  rebalances = [],
  slotValue = 0,
  targetReturns = null,
  navData = null,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);

  const { theme } = useTheme();
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const { period: storePeriod } = usePortfolioStore();
  const period = periodProp ?? storePeriod;

  const [visibleSeries, setVisibleSeries] = useState({
    sp500: strategy?.benchmark !== "NASDAQ",
    nasdaq: strategy?.benchmark === "NASDAQ",
    strat: true,
    baseLine: true,
  });

  const handleToggle = (key) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const chartData = useMemo(
    () =>
      generateSyntheticData(
        activeInvested || 500,
        period,
        firstInvestDate,
        rebalances,
        slotValue,
        targetReturns,
        navData,
        strategy,
      ),
    [activeInvested, period, firstInvestDate, rebalances, slotValue, targetReturns, navData, strategy],
  );

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
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: chartColors.textColor,
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: chartColors.gridColor },
        horzLines: { color: chartColors.gridColor },
      },
      crosshair: {
        vertLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
        horzLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    seriesRef.current.baseLine = chartRef.current.addLineSeries({
      color: "rgba(255, 255, 255, 0.4)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "Capital Invertido",
    });

    seriesRef.current.sp500 = chartRef.current.addLineSeries({
      color: chartColors.sp500,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      title: strategy?.benchmark || "S&P 500",
    });

    seriesRef.current.nasdaq = chartRef.current.addLineSeries({
      color: chartColors.nasdaq,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "NASDAQ",
    });

    seriesRef.current.strat = chartRef.current.addLineSeries({
      color: strategy?.color || COLORS.mm20,
      lineWidth: 2.5,
      priceLineVisible: false,
      lastValueVisible: true,
      title: strategy?.name || "Estrategia",
    });

    chartRef.current.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }
      const spData = param.seriesData.get(seriesRef.current.sp500);
      const nsdData = param.seriesData.get(seriesRef.current.nasdaq);
      const mmData = param.seriesData.get(seriesRef.current.strat);
      const baseData = param.seriesData.get(seriesRef.current.baseLine);

      setHoverValues({
        sp500: spData?.value ?? null,
        nasdaq: nsdData?.value ?? null,
        strat: mmData?.value ?? null,
        baseLine: baseData?.value ?? null,
      });
    });

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: 340,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [strategy?.color, strategy?.benchmark, strategy?.name]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Apply theme changes to existing chart instance without full re-creation
  useEffect(() => {
    if (chartRef.current) {
      applyChartTheme(chartRef.current, theme, seriesRef.current);
    }
  }, [theme]);

  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    const isIntraday = period === "1D";
    chartRef.current.applyOptions({
      timeScale: {
        timeVisible: isIntraday,
        secondsVisible: false,
      },
    });
    seriesRef.current.sp500?.setData(chartData.sp500);
    seriesRef.current.nasdaq?.setData(chartData.nasdaq);
    seriesRef.current.baseLine?.setData(chartData.baseLine);
    seriesRef.current.strat?.setData(chartData.strat);
    chartRef.current.timeScale().fitContent();
  }, [chartData, period]);

  const lastSP = chartData.sp500[chartData.sp500.length - 1]?.value;
  const lastNasdaq = chartData.nasdaq[chartData.nasdaq.length - 1]?.value;
  const lastStrat = chartData.strat[chartData.strat.length - 1]?.value;
  const lastBase = chartData.baseLine[chartData.baseLine.length - 1]?.value;

  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;
  const currentStrat = hoverValues?.strat ?? lastStrat;
  const currentBase = hoverValues?.baseLine ?? lastBase;

  const baseVal = currentBase || activeInvested || 500;

  const isMidCap = strategy?.benchmark === "S&P MidCap 400" || strategy?.id === "strat_mm20";
  const benchmarkName = strategy?.benchmark || (isMidCap ? "S&P MidCap 400" : "S&P 500");

  // If hovering, compute return from the specific point relative to baseVal
  // If not hovering, prefer the exact computed return from navData / targetReturns
  const spPct = hoverValues
    ? (currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.sp != null
        ? targetReturns.sp * 100
        : (currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0));

  const nasdaqPct = hoverValues
    ? (currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.nasdaq != null
        ? targetReturns.nasdaq * 100
        : (currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0));

  const stratPct = hoverValues
    ? (currentStrat ? ((currentStrat - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.strat != null
        ? targetReturns.strat * 100
        : (currentStrat ? ((currentStrat - baseVal) / baseVal) * 100 : 0));

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => handleToggle("sp500")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.sp500 ? "rgba(245, 158, 11, 0.08)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${visibleSeries.sp500 ? "rgba(245, 158, 11, 0.3)" : "#334155"}`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.sp500 ? "#f1f5f9" : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.sp500,
              opacity: visibleSeries.sp500 ? 1 : 0.3,
            }}
          />
          <strong>{benchmarkName}</strong>
          <span className="mono" style={{ color: "#fbbf24", fontWeight: 700 }}>
            ${currentSP?.toFixed(2)}
          </span>
          <span style={{ color: spPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
            ({spPct >= 0 ? "+" : ""}
            {spPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("nasdaq")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.nasdaq
              ? "rgba(168, 85, 247, 0.08)"
              : "rgba(255,255,255,0.02)",
            border: `1px solid ${visibleSeries.nasdaq ? "rgba(168, 85, 247, 0.3)" : "#334155"}`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.nasdaq ? "#f1f5f9" : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.nasdaq,
              opacity: visibleSeries.nasdaq ? 1 : 0.3,
            }}
          />
          <strong>NASDAQ</strong>
          <span className="mono" style={{ color: "#c084fc", fontWeight: 700 }}>
            ${currentNasdaq?.toFixed(2)}
          </span>
          <span style={{ color: nasdaqPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
            ({nasdaqPct >= 0 ? "+" : ""}
            {nasdaqPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("strat")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.strat
              ? `${strategy?.color || COLORS.mm20}20`
              : "rgba(255,255,255,0.02)",
            border: `1px solid ${visibleSeries.strat ? `${strategy?.color || COLORS.mm20}66` : "#334155"}`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.strat ? "#f1f5f9" : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: strategy?.color || COLORS.mm20,
              opacity: visibleSeries.strat ? 1 : 0.3,
            }}
          />
          <strong>
            {strategy?.name || "Estrategia"} {strategy?.isSystem ? "PRO" : ""}
          </strong>
          <span className="mono" style={{ color: strategy?.color || COLORS.mm20, fontWeight: 700 }}>
            ${currentStrat?.toFixed(2)}
          </span>
          <span style={{ color: stratPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
            ({stratPct >= 0 ? "+" : ""}
            {stratPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("baseLine")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.baseLine ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${visibleSeries.baseLine ? "rgba(255,255,255,0.25)" : "#334155"}`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.baseLine ? "#f1f5f9" : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 2,
              borderTop: "2px dashed #94a3b8",
              opacity: visibleSeries.baseLine ? 1 : 0.3,
            }}
          />
          <strong>Base Asignada</strong>
          <span className="mono" style={{ color: "#94a3b8", fontWeight: 700 }}>
            ${currentBase?.toFixed(2)}
          </span>
        </button>
      </div>

      <div ref={containerRef} style={{ width: "100%", height: "320px", position: "relative" }} />
    </div>
  );
}
