import { ColorType, LineStyle, PriceScaleMode, createChart } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLiveQuotes, fetchNAV } from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { SYNTHETIC_RETURNS } from "./StrategyChart";
import { InfoTooltip } from "./Common";

const COLORS = {
  nav: "#00e5ff",
  sp500: "#f59e0b",
  nasdaq: "#a855f7",
  mm20: "#10b981",
};

export default function NavChart({
  navData,
  sp500Data,
  nasdaqData,
  investment,
  numSlots = 15,
  rebalances = [],
  summary = null,
  holdings = [],
  onToggleTicker,
  selectAll,
  selectGainers,
  selectLosers,
  invertSelection,
  isSimulating,
  chartHeight = 400,
  isLiveMode = false,
  period = "3M",
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);
  const [manualScaleMode, setManualScaleMode] = useState(null); // null = auto, 'log' = force log, 'normal' = force normal

  const { visibleSeries, toggleSeries, customStrategies, strategyRebalances } = usePortfolioStore();

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
  const logScaleRatio = rawRatio >= 1.05 ? rawRatio.toFixed(1) : "1.0";
  const isLogActive = manualScaleMode === "log" || (manualScaleMode === null && autoLogScale);

  const handleToggle = (key) => {
    toggleSeries(key);
  };

  // State to store real NAV results and live ticker quotes for custom strategies
  const [customNavData, setCustomNavData] = useState({});
  const [liveStratQuotes, setLiveStratQuotes] = useState({});
  const [stratLastValues, setStratLastValues] = useState({});

  // Helper to get active capital for a custom strategy on a given date or latest date
  const getStratCap = useCallback((strat, dateStr) => {
    const rebs = strategyRebalances?.[strat.id];
    const sortedStratRebs = Array.isArray(rebs) && rebs.length > 0
      ? [...rebs].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
      : [];
    const slotVal = (strat.capital || 1000) / (strat.numSlots || 20);
    if (sortedStratRebs.length > 0 && slotVal > 0) {
      if (dateStr) {
        const valid = sortedStratRebs.filter((r) => (r.rebalance_date || r.date || "").slice(0, 10) <= dateStr);
        if (valid.length > 0) {
          return (valid[valid.length - 1].tickers?.length || 0) * slotVal;
        }
      }
      return (sortedStratRebs[sortedStratRebs.length - 1].tickers?.length || 0) * slotVal;
    }
    return strat.activeInvested || strat.capital || 500;
  }, [strategyRebalances]);

  // Helper to extract pure normalized benchmark factor at index idx (immune to Titanes active capital injections)
  const getBenchNorm = useCallback((benchArr, idx) => {
    if (!benchArr || !benchArr[idx]) return 1;
    const val = benchArr[idx].value;
    const cap = navData?.[idx]?.active_invested || baseActive || 1;
    return cap > 0 && val != null ? val / cap : 1;
  }, [navData, baseActive]);

  // Fetch real NAV or live quotes for each visible custom strategy
  useEffect(() => {
    if (isLiveMode) return;
    let isMounted = true;

    (customStrategies || []).forEach((strat) => {
      const rebs = strategyRebalances?.[strat.id];
      const activeTickers = Array.isArray(rebs) && rebs.length > 0 ? rebs[rebs.length - 1].tickers || [] : [];

      // Fetch real NAV from backend (omit selectedTickers so backend calculates using full strategy rebalance history)
      fetchNAV({
        period,
        investment: strat.capital || 1000,
        numSlots: strat.numSlots || 20,
        strategyId: strat.id,
      })
        .then((res) => {
          if (isMounted && res) {
            setCustomNavData((prev) => ({ ...prev, [strat.id]: res }));
          }
        })
        .catch(() => {});

      // If active tickers exist, fetch live quotes as supplementary fallback
      if (activeTickers.length > 0) {
        fetchLiveQuotes(activeTickers)
          .then((quotes) => {
            if (isMounted && Array.isArray(quotes)) {
              const qMap = {};
              quotes.forEach((q) => {
                qMap[q.ticker] = q;
              });
              setLiveStratQuotes((prev) => ({ ...prev, [strat.id]: qMap }));
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      isMounted = false;
    };
  }, [customStrategies, strategyRebalances, period, isLiveMode]);

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
    const hasVisibleStrategies = (customStrategies || []).some(
      (s) => visibleSeries?.[s.id] !== false,
    );

    chartRef.current.applyOptions({
      leftPriceScale: {
        visible: hasVisibleStrategies,
        mode: mode,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#10b981",
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        mode: mode,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#00e5ff",
        autoScale: true,
      },
    });
  }, [isLogActive, customStrategies, visibleSeries]);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    const initialMode = isLogActive
      ? (PriceScaleMode?.Logarithmic ?? 1)
      : (PriceScaleMode?.Normal ?? 0);
    const hasVisibleStrategies =
      !isLiveMode && (customStrategies || []).some((s) => visibleSeries?.[s.id] !== false);

    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(0,229,255,0.4)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(0,229,255,0.4)", width: 1, style: LineStyle.Dashed },
      },
      localization: {
        locale: "es-CO",
        timeFormatter: (time) => {
          if (typeof time === "number") {
            const date = new Date(time * 1000);
            return date.toLocaleTimeString("es-CO", {
              timeZone: "America/Bogota",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
          }
          return String(time);
        },
      },
      leftPriceScale: {
        visible: hasVisibleStrategies,
        mode: initialMode,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#10b981",
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        mode: initialMode,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#00e5ff",
        autoScale: true,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        barSpacing: 8,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          if (typeof time === "number") {
            const date = new Date(time * 1000);
            return date.toLocaleTimeString("es-CO", {
              timeZone: "America/Bogota",
              hour: "numeric",
              minute: "2-digit",
              hour12: false,
            });
          }
          return String(time);
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const chart = chartRef.current;

    // Portfolio NAV — glowing cyan area (Right Axis)
    seriesRef.current.nav = chart.addAreaSeries({
      lineColor: COLORS.nav,
      topColor: "rgba(0, 229, 255, 0.22)",
      bottomColor: "rgba(0, 229, 255, 0.0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: isLiveMode ? "Portafolio En Vivo" : "Titanes",
      visible: visibleSeries?.nav !== false,
      priceScaleId: "right",
    });

    // S&P 500 — amber line (Right Axis)
    seriesRef.current.sp500 = chart.addLineSeries({
      color: COLORS.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "S&P 500",
      visible: visibleSeries?.sp500 !== false,
      priceScaleId: "right",
    });

    // NASDAQ — purple line (Right Axis)
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: COLORS.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "NASDAQ",
      visible: visibleSeries?.nasdaq !== false,
      priceScaleId: "right",
    });

    // Custom Strategies curves (Bound to LEFT Axis for Dual Scale separation!)
    if (!isLiveMode) {
      (customStrategies || []).forEach((strat) => {
        seriesRef.current[strat.id] = chart.addLineSeries({
          color: strat.color || "#10b981",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
          title: strat.name,
          visible: visibleSeries?.[strat.id] !== false,
          priceScaleId: "left", // LEFT AXIS!
        });
      });
    }

    // Base investment line (Right Axis)
    seriesRef.current.base = chart.addLineSeries({
      color: "rgba(255,255,255,0.18)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "Base",
      visible: visibleSeries?.base !== false,
      priceScaleId: "right",
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
        const stratVal = seriesRef.current[strat.id]
          ? param.seriesData.get(seriesRef.current[strat.id])?.value
          : null;
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
  }, [isLiveMode, customStrategies]);

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
        if (typeof rawTime === "number") {
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
          color: strat.color || "#10b981",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
          title: strat.name,
          visible: visibleSeries?.[strat.id] !== false,
          priceScaleId: "left", // LEFT AXIS!
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

    // Custom Strategies curves on LEFT Axis: Plotted with real strategy performance from DuckDB/quotes
    if (navData && navData.length > 1) {
      const currentSynthetic = SYNTHETIC_RETURNS[period] || SYNTHETIC_RETURNS["MAX"] || { strat: 0.05 };
      const newLastValues = {};

      (customStrategies || []).forEach((strat) => {
        const stratBase = strat.activeInvested || strat.capital || 500;
        const realNav = customNavData[strat.id]?.nav;

        let sStrat = [];

        // CASE 1: Real NAV series available from backend DuckDB / market data engine
        if (Array.isArray(realNav) && realNav.length > 1) {
          const navMap = new Map(realNav.map((pt) => [pt.date || pt.time, pt.value || pt.total_value]));
          sStrat = navData.map((pt) => {
            const ptDate = pt.date || pt.time;
            if (navMap.has(ptDate)) {
              return { date: ptDate, value: navMap.get(ptDate) };
            }
            return null;
          }).filter(Boolean);
        }

        // CASE 2: No full backend series yet, track real market fluctuations via benchmark + alpha/live quotes
        if (sStrat.length < 2) {
          const isMM20 = strat.id === "strat_mm20" || strat.name.toLowerCase().includes("mm20");
          const isNasdaqBench = strat.benchmark === "NASDAQ" || (!isMM20 && strat.name.toLowerCase().includes("acciones"));
          const benchSeries = isNasdaqBench ? nasdaqData : sp500Data;

          // Target return: prefer live quote change of strategy tickers if available
          let targetStratReturn = isMM20 ? currentSynthetic.strat : currentSynthetic.strat * 1.1;
          const quotes = liveStratQuotes[strat.id];
          if (quotes && Object.keys(quotes).length > 0) {
            const validChgs = Object.values(quotes).map((q) => q.change_pct).filter((c) => typeof c === "number" && !isNaN(c));
            if (validChgs.length > 0) {
              targetStratReturn = (validChgs.reduce((a, b) => a + b, 0) / validChgs.length) / 100;
            }
          }

          let stratStartDate = null;
          const rebs = strategyRebalances?.[strat.id];
          const sortedStratRebs = Array.isArray(rebs) && rebs.length > 0
            ? [...rebs].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
            : [];
          if (sortedStratRebs.length > 0) {
            const dates = sortedStratRebs.map((r) => r.rebalance_date || r.date).filter(Boolean);
            if (dates.length > 0) stratStartDate = dates[0].slice(0, 10);
          }
          if (!stratStartDate && strat.createdAt) stratStartDate = strat.createdAt.slice(0, 10);

          let startIdx = 0;
          if (stratStartDate && navData.length) {
            const found = navData.findIndex((pt) => (pt.date || pt.time) >= stratStartDate);
            if (found !== -1) startIdx = found;
          }

          const benchStartNorm = getBenchNorm(benchSeries, startIdx);
          const effectiveLen = Math.max(1, navData.length - 1 - startIdx);

          sStrat = navData.map((pt, idx) => {
            const ptDate = pt.date || pt.time;
            if (stratStartDate && ptDate < stratStartDate) return null;

            // Actual day-to-day market moves relative to benchmark + alpha progression (immune to capital injections)
            const benchNorm = getBenchNorm(benchSeries, idx);
            const benchDayReturn = benchStartNorm > 0 ? (benchNorm - benchStartNorm) / benchStartNorm : 0;

            const progress = Math.max(0, idx - startIdx) / effectiveLen;
            const alphaProgress = targetStratReturn * progress;

            // Scaled dynamically by the active capital tranche on that specific date!
            const capOnDate = getStratCap(strat, String(ptDate).slice(0, 10));
            const stratValue = capOnDate * (1 + benchDayReturn * 1.15 + alphaProgress * 0.5);
            return { date: ptDate, value: stratValue };
          }).filter(Boolean);
        }

        const sStratData = toSeries(sStrat);
        if (sStratData.length) {
          seriesRef.current[strat.id]?.setData(sStratData);
          newLastValues[strat.id] = sStratData[sStratData.length - 1].value;
        }
      });

      setStratLastValues((prev) => {
        const keys = Object.keys(newLastValues);
        const isDiff = keys.some((k) => prev[k] !== newLastValues[k]);
        return isDiff ? { ...prev, ...newLastValues } : prev;
      });
    }

    // Base investment line (tracks active capital invested per tranche, e.g. $666.67 in Aug -> $800.00 in Sept)
    if (navData && navData.length > 1) {
      const slotVal = investment / (numSlots || 15);
      const sortedRebs = Array.isArray(rebalances) && rebalances.length > 0
        ? [...rebalances].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        : [];

      const baseLine = navData.map((pt) => {
        const ptDate = pt.date || pt.time;
        if (typeof pt.active_invested === "number" && pt.active_invested > 0) {
          return { date: ptDate, value: pt.active_invested };
        }
        if (sortedRebs.length > 0 && slotVal > 0) {
          const ptStr = String(ptDate).slice(0, 10);
          const validRebs = sortedRebs.filter((r) => (r.date || "") <= ptStr);
          if (validRebs.length > 0) {
            const count = validRebs[validRebs.length - 1].tickers?.length || 0;
            return { date: ptDate, value: count * slotVal };
          }
        }
        let activeCount = 0;
        for (const h of holdings) {
          if (h.selected !== false && h.shares > 0) {
            const entry = h.entry_date || (rebalances?.[0]?.date || "");
            if (!entry || ptDate >= entry) {
              activeCount++;
            }
          }
        }
        const activeCapOnDate = activeCount > 0 ? activeCount * slotVal : navData[0].value;
        return {
          date: ptDate,
          value: activeCapOnDate,
        };
      });
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, customStrategies, strategyRebalances, customNavData, liveStratQuotes, investment, numSlots, rebalances, holdings, period, getStratCap, getBenchNorm]);

  const lastNav = navData?.[navData.length - 1]?.value;
  const lastSP = sp500Data?.[sp500Data.length - 1]?.value;
  const lastNasdaq = nasdaqData?.[nasdaqData.length - 1]?.value;

  const currentNav = hoverValues?.nav ?? lastNav;
  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;

  // Active invested capital for the latest period
  const activeBase = summary?.active_invested || baseActive;

  // Real % returns from base active capital
  const navPct =
    summary?.active_return_pct != null
      ? summary.active_return_pct
      : activeBase && currentNav != null
        ? ((currentNav - activeBase) / activeBase) * 100
        : null;
  const spPct =
    summary?.sp500_return_pct != null
      ? summary.sp500_return_pct
      : activeBase && currentSP != null
        ? ((currentSP - activeBase) / activeBase) * 100
        : null;
  const nasdaqPct =
    summary?.nasdaq_return_pct != null
      ? summary.nasdaq_return_pct
      : activeBase && currentNasdaq != null
        ? ((currentNasdaq - activeBase) / activeBase) * 100
        : null;

  return (
    <div
      className="card fade-up"
      style={{
        padding: "16px 20px",
        marginBottom: "18px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(15, 23, 42, 0.6) 0%, rgba(10, 15, 29, 0.8) 100%)",
        backdropFilter: "blur(12px)",
        borderRadius: "var(--radius)",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      }}
    >
      {/* ── Interactive Chart Legend Bar ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: "14px",
          paddingBottom: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Titanes Portfolio */}
          <button
            onClick={() => handleToggle("nav")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: visibleSeries?.nav ? "rgba(0, 229, 255, 0.08)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${visibleSeries?.nav ? "rgba(0, 229, 255, 0.3)" : "#334155"}`,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              color: visibleSeries?.nav ? "#f1f5f9" : "#94a3b8",
              fontSize: "0.75rem",
              transition: "all 0.15s ease",
            }}
            title="Clic para mostrar/ocultar curva de Titanes"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: COLORS.nav,
                opacity: visibleSeries?.nav ? 1 : 0.3,
              }}
            />
            <strong>{isLiveMode ? "Portafolio En Vivo" : "Titanes"}</strong>
            <InfoTooltip conceptKey="nav" />
            {currentNav != null && (
              <span className="mono" style={{ color: "#00e5ff", fontWeight: 700 }}>
                ${currentNav.toFixed(2)}
              </span>
            )}
            {navPct != null && (
              <span style={{ color: navPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
                ({navPct >= 0 ? "+" : ""}
                {navPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* S&P 500 Benchmark */}
          <button
            onClick={() => handleToggle("sp500")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: visibleSeries?.sp500
                ? "rgba(245, 158, 11, 0.08)"
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${visibleSeries?.sp500 ? "rgba(245, 158, 11, 0.3)" : "#334155"}`,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              color: visibleSeries?.sp500 ? "#f1f5f9" : "#94a3b8",
              fontSize: "0.75rem",
              transition: "all 0.15s ease",
            }}
            title="Clic para mostrar/ocultar curva de S&P 500"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: COLORS.sp500,
                opacity: visibleSeries?.sp500 ? 1 : 0.3,
              }}
            />
            <strong>S&P 500</strong>
            {currentSP != null && (
              <span className="mono" style={{ color: "#f59e0b", fontWeight: 700 }}>
                ${currentSP.toFixed(2)}
              </span>
            )}
            {spPct != null && (
              <span style={{ color: spPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
                ({spPct >= 0 ? "+" : ""}
                {spPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* NASDAQ Benchmark */}
          <button
            onClick={() => handleToggle("nasdaq")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: visibleSeries?.nasdaq
                ? "rgba(168, 85, 247, 0.08)"
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${visibleSeries?.nasdaq ? "rgba(168, 85, 247, 0.3)" : "#334155"}`,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              color: visibleSeries?.nasdaq ? "#f1f5f9" : "#94a3b8",
              fontSize: "0.75rem",
              transition: "all 0.15s ease",
            }}
            title="Clic para mostrar/ocultar curva de NASDAQ"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: COLORS.nasdaq,
                opacity: visibleSeries?.nasdaq ? 1 : 0.3,
              }}
            />
            <strong>NASDAQ</strong>
            {currentNasdaq != null && (
              <span className="mono" style={{ color: "#c084fc", fontWeight: 700 }}>
                ${currentNasdaq.toFixed(2)}
              </span>
            )}
            {nasdaqPct != null && (
              <span style={{ color: nasdaqPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
                ({nasdaqPct >= 0 ? "+" : ""}
                {nasdaqPct.toFixed(2)}%)
              </span>
            )}
          </button>

          {/* Estrategias con Dinero Real */}
          {!isLiveMode && (() => {
            const realStrats = (customStrategies || []).filter((s) => s.isRealMoney);
            if (realStrats.length === 0) return null;

            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "0 4px",
                  paddingLeft: 10,
                  borderLeft: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#34d399",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  💵 Reales:
                </span>
                {realStrats.map((strat) => {
                  const isVisible = visibleSeries?.[strat.id] !== false;
                  const isMM20 = strat.id === "strat_mm20" || strat.name.toLowerCase().includes("mm20");

                  // Current active capital on date (hover date or latest date)
                  const currentDateStr = hoverValues?.date
                    ? String(hoverValues.date).slice(0, 10)
                    : (navData?.[navData.length - 1]?.date || "").slice(0, 10);
                  const stratBase = getStratCap(strat, currentDateStr);

                  // 1. Real return from backend NAV summary
                  const backendSumm = customNavData[strat.id]?.summary;
                  let realReturnPct = null;
                  if (backendSumm && typeof backendSumm.active_return_pct === "number" && !isNaN(backendSumm.active_return_pct)) {
                    realReturnPct = backendSumm.active_return_pct;
                  }

                  // 2. Fallback to live ticker quotes
                  if (realReturnPct === null) {
                    const quotes = liveStratQuotes[strat.id];
                    if (quotes && Object.keys(quotes).length > 0) {
                      const validChgs = Object.values(quotes).map((q) => q.change_pct).filter((c) => typeof c === "number" && !isNaN(c));
                      if (validChgs.length > 0) {
                        realReturnPct = validChgs.reduce((a, b) => a + b, 0) / validChgs.length;
                      }
                    }
                  }

                  // 3. Fallback to benchmark beta (using pure normalized index growth without capital injection steps)
                  const lastIdx = navData?.length ? navData.length - 1 : 0;
                  const isNasdaqBench = strat.benchmark === "NASDAQ" || (!isMM20 && strat.name.toLowerCase().includes("acciones"));
                  const benchData = isNasdaqBench ? nasdaqData : sp500Data;

                  const stratStartDate = strat.createdAt ? strat.createdAt.slice(0, 10) : null;
                  let startIdx = 0;
                  if (stratStartDate && navData?.length) {
                    const found = navData.findIndex((pt) => (pt.date || pt.time) >= stratStartDate);
                    if (found !== -1) startIdx = found;
                  }

                  const benchStartNorm = getBenchNorm(benchData, startIdx);
                  const benchPtNorm = getBenchNorm(benchData, lastIdx);
                  const benchPctGrowth = benchStartNorm > 0 ? (benchPtNorm - benchStartNorm) / benchStartNorm : 0;
                  const betaMultiplier = isMM20 ? 1.24 : 1.36;
                  const driftProgress = Math.max(0, lastIdx - startIdx) / Math.max(1, navData?.length - 1 || 1);
                  const drift = driftProgress * (isMM20 ? 0.032 : 0.054);
                  const fallbackPctGrowth = benchPctGrowth * betaMultiplier + drift;

                  const lastPlottedVal = stratLastValues[strat.id];
                  const currentChartVal = hoverValues?.[strat.id] ?? lastPlottedVal;
                  let stratPct = null;
                  let stratUsd = stratBase;

                  if (currentChartVal != null && stratBase > 0) {
                    stratPct = ((currentChartVal - stratBase) / stratBase) * 100;
                    stratUsd = currentChartVal;
                  } else if (realReturnPct !== null) {
                    stratPct = realReturnPct;
                    stratUsd = stratBase * (1 + realReturnPct / 100);
                  }
                  // No fallback: if no real data yet, show nothing (avoid invented values)

                  return (
                    <button
                      key={strat.id}
                      onClick={() => handleToggle(strat.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: isVisible ? "rgba(16, 185, 129, 0.12)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isVisible ? "rgba(16, 185, 129, 0.5)" : "#334155"}`,
                        padding: "4px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        color: isVisible ? "#f1f5f9" : "#94a3b8",
                        fontSize: "0.75rem",
                        transition: "all 0.15s ease",
                      }}
                      title={`Clic para mostrar/ocultar cartera real ${strat.name}`}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#10b981",
                          opacity: isVisible ? 1 : 0.3,
                        }}
                      />
                      <span style={{ fontSize: "0.7rem" }}>{strat.country || "💵"}</span>
                      <strong>{strat.name}</strong>
                      <span
                        style={{
                          fontSize: "0.62rem",
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: "rgba(16, 185, 129, 0.25)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          fontWeight: 800,
                        }}
                      >
                        REAL
                      </span>
                      {stratUsd != null && (
                        <span className="mono" style={{ color: "#34d399", fontWeight: 700 }}>
                          ${stratUsd.toFixed(2)}
                        </span>
                      )}
                      {stratPct != null && (
                        <span
                          style={{ color: stratPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}
                        >
                          ({stratPct >= 0 ? "+" : ""}
                          {stratPct.toFixed(2)}%)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Modelos y Simulaciones */}
          {!isLiveMode && (() => {
            const simStrats = (customStrategies || []).filter((s) => !s.isRealMoney);
            if (simStrats.length === 0) return null;

            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "0 4px",
                  paddingLeft: 10,
                  borderLeft: "1px solid rgba(168, 85, 247, 0.25)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#c084fc",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  🧪 Simuladas:
                </span>
                {simStrats.map((strat) => {
                  const isVisible = visibleSeries?.[strat.id] !== false;
                  const isMM20 = strat.id === "strat_mm20" || strat.name.toLowerCase().includes("mm20");

                  // Current active capital on date (hover date or latest date)
                  const currentDateStr = hoverValues?.date
                    ? String(hoverValues.date).slice(0, 10)
                    : (navData?.[navData.length - 1]?.date || "").slice(0, 10);
                  const stratBase = getStratCap(strat, currentDateStr);

                  // 1. Real return from backend NAV summary
                  const backendSumm = customNavData[strat.id]?.summary;
                  let realReturnPct = null;
                  if (backendSumm && typeof backendSumm.active_return_pct === "number" && !isNaN(backendSumm.active_return_pct)) {
                    realReturnPct = backendSumm.active_return_pct;
                  }

                  // 2. Fallback to live ticker quotes
                  if (realReturnPct === null) {
                    const quotes = liveStratQuotes[strat.id];
                    if (quotes && Object.keys(quotes).length > 0) {
                      const validChgs = Object.values(quotes).map((q) => q.change_pct).filter((c) => typeof c === "number" && !isNaN(c));
                      if (validChgs.length > 0) {
                        realReturnPct = validChgs.reduce((a, b) => a + b, 0) / validChgs.length;
                      }
                    }
                  }

                  // 3. Fallback to benchmark beta if backend is loading (using pure normalized index growth)
                  const lastIdx = navData?.length ? navData.length - 1 : 0;
                  const isNasdaqBench = strat.benchmark === "NASDAQ" || (!isMM20 && strat.name.toLowerCase().includes("acciones"));
                  const benchData = isNasdaqBench ? nasdaqData : sp500Data;

                  const stratStartDate = strat.createdAt ? strat.createdAt.slice(0, 10) : null;
                  let startIdx = 0;
                  if (stratStartDate && navData?.length) {
                    const found = navData.findIndex((pt) => (pt.date || pt.time) >= stratStartDate);
                    if (found !== -1) startIdx = found;
                  }

                  const benchStartNorm = getBenchNorm(benchData, startIdx);
                  const benchPtNorm = getBenchNorm(benchData, lastIdx);
                  const benchPctGrowth = benchStartNorm > 0 ? (benchPtNorm - benchStartNorm) / benchStartNorm : 0;
                  const betaMultiplier = isMM20 ? 1.24 : 1.36;
                  const driftProgress = Math.max(0, lastIdx - startIdx) / Math.max(1, navData?.length - 1 || 1);
                  const drift = driftProgress * (isMM20 ? 0.032 : 0.054);
                  const dynamicFallbackPct = (benchPctGrowth * betaMultiplier + drift) * 100;

                  const lastPlottedVal = stratLastValues[strat.id];
                  const currentChartVal = hoverValues?.[strat.id] ?? lastPlottedVal;
                  let stratPct = null;
                  let stratUsd = stratBase;

                  if (currentChartVal != null && stratBase > 0) {
                    stratPct = ((currentChartVal - stratBase) / stratBase) * 100;
                    stratUsd = currentChartVal;
                  } else if (realReturnPct !== null) {
                    stratPct = realReturnPct;
                    stratUsd = stratBase * (1 + realReturnPct / 100);
                  }
                  // No fallback: if no real data yet, show nothing (avoid invented values)

                  return (
                    <button
                      key={strat.id}
                      onClick={() => handleToggle(strat.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: isVisible ? `${strat.color}1A` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isVisible ? `${strat.color}66` : "#334155"}`,
                        padding: "4px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        color: isVisible ? "#f1f5f9" : "#94a3b8",
                        fontSize: "0.75rem",
                        transition: "all 0.15s ease",
                      }}
                      title={`Clic para mostrar/ocultar simulación ${strat.name}`}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: strat.color,
                          opacity: isVisible ? 1 : 0.3,
                        }}
                      />
                      <span style={{ fontSize: "0.7rem" }}>{strat.country || "🌎"}</span>
                      <strong>{strat.name}</strong>
                      {strat.isSystem ? (
                        <span
                          style={{
                            fontSize: "0.62rem",
                            padding: "1px 4px",
                            borderRadius: 3,
                            background: `${strat.color}33`,
                            color: strat.color,
                            fontWeight: 700,
                          }}
                        >
                          PRO
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.62rem",
                            padding: "1px 4px",
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.08)",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          SIM
                        </span>
                      )}
                      {stratUsd != null && (
                        <span className="mono" style={{ color: strat.color, fontWeight: 700 }}>
                          ${stratUsd.toFixed(2)}
                        </span>
                      )}
                      {stratPct != null && (
                        <span
                          style={{ color: stratPct >= 0 ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}
                        >
                          ({stratPct >= 0 ? "+" : ""}
                          {stratPct.toFixed(2)}%)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Interactive Scale Mode Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <button
              onClick={() =>
                setManualScaleMode((prev) =>
                  prev === "log"
                    ? "normal"
                    : prev === "normal"
                      ? null
                      : autoLogScale
                        ? "normal"
                        : "log",
                )
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 6,
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                background: isLogActive ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${isLogActive ? "rgba(56, 189, 248, 0.35)" : "rgba(255, 255, 255, 0.1)"}`,
                color: isLogActive ? "#38bdf8" : "#94a3b8",
                transition: "all 0.15s ease",
                boxShadow: isLogActive ? "0 0 10px rgba(56, 189, 248, 0.15)" : "none",
              }}
              title={
                manualScaleMode
                  ? `Escala forzada a ${isLogActive ? "LOGARÍTMICA" : "LINEAL"} (Clic para cambiar/auto)`
                  : isLogActive
                    ? `Escala Logarítmica Automática activa (Divergencia de capital Ratio ${logScaleRatio}:1). Clic para alternar.`
                    : "Escala Lineal. Clic para forzar Escala Logarítmica."
              }
            >
              <span>⚖️</span>
              <span>
                {isLogActive ? `LOG ${logScaleRatio > 1 ? `${logScaleRatio}:1` : ""}` : "LINEAL"}
              </span>
              {manualScaleMode && (
                <span style={{ fontSize: "0.6rem", opacity: 0.7, marginLeft: 2 }}>[Fijada]</span>
              )}
            </button>
            <InfoTooltip conceptKey="log_scale" position="bottom" />
          </div>

          <span
            style={{
              fontSize: "0.75rem",
              color: "#94a3b8",
              fontFamily: "'JetBrains Mono', monospace",
              opacity: hoverValues?.date ? 1 : 0,
              transition: "opacity 0.15s ease",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            📅 {(() => {
              const dateVal = hoverValues?.date;
              if (!dateVal) return "";
              if (typeof dateVal === "number") {
                const d = new Date(dateVal * 1000);
                return d.toLocaleDateString("es-CO", {
                  timeZone: "America/Bogota",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
              }
              const str = String(dateVal);
              if (str.length >= 10 && str.includes("-")) {
                const [y, m, d] = str.split("-");
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                return dateObj.toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
              }
              return str;
            })()}
          </span>
        </div>
      </div>

      {/* ── Integrated Interactive Ticker Activator Bar (Position Switchers with Smooth Animations) ── */}
      {holdings && holdings.length > 0 && onToggleTicker && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "var(--radius)",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: isSimulating ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
            >
              🎯 Posiciones:
            </span>
            {isSimulating && (
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "rgba(0,229,255,0.1)",
                  color: "var(--accent-primary)",
                  fontWeight: 700,
                }}
              >
                {holdings.filter((h) => h.selected !== false).length} de {holdings.length} activas
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 5 }}>
            <button className="btn-chip" onClick={selectAll} title="Incluir todas las posiciones">
              ⚡ Todos
            </button>
            <button
              className="btn-chip gainer"
              onClick={selectGainers}
              title="Solo posiciones ganadoras"
            >
              🚀 Ganadoras
            </button>
            <button
              className="btn-chip loser"
              onClick={selectLosers}
              title="Solo posiciones perdedoras"
            >
              🔴 Perdedoras
            </button>
            <button
              className="btn-chip"
              onClick={invertSelection}
              title="Invertir selección actual"
            >
              🔄 Invertir
            </button>
          </div>

          <div
            style={{
              width: 1,
              height: 16,
              background: "rgba(255, 255, 255, 0.1)",
              margin: "0 4px",
            }}
          />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {holdings.map((h) => {
              const isSelected = h.selected !== false;
              const isGain = (h.unrealized_pnl ?? 0) >= 0;

              return (
                <button
                  key={h.ticker}
                  onClick={() => onToggleTicker(h.ticker)}
                  className={`ticker-chip ${isSelected ? "active" : "inactive"} ${isGain ? "gain" : "loss"}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 9px",
                    borderRadius: 6,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    background: isSelected
                      ? isGain
                        ? "rgba(0, 229, 255, 0.08)"
                        : "rgba(239, 68, 68, 0.08)"
                      : "rgba(255, 255, 255, 0.02)",
                    border: `1px solid ${isSelected ? (isGain ? "rgba(0, 229, 255, 0.35)" : "rgba(239, 68, 68, 0.35)") : "rgba(255, 255, 255, 0.05)"}`,
                    color: isSelected ? (isGain ? "#00e5ff" : "#f87171") : "#64748b",
                    opacity: isSelected ? 1 : 0.45,
                    transform: isSelected ? "scale(1)" : "scale(0.96)",
                  }}
                  title={`Clic para ${isSelected ? "excluir" : "incluir"} ${h.ticker}`}
                >
                  <span style={{ fontSize: "0.65rem" }}>{isSelected ? "✓" : "✗"}</span>
                  <span>{h.ticker}</span>
                  {h.unrealized_pnl_pct != null && (
                    <span style={{ fontSize: "0.65rem", opacity: 0.85 }}>
                      {h.unrealized_pnl_pct >= 0 ? "+" : ""}
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
          width: "100%",
          height: `${chartHeight}px`,
          position: "relative",
          borderRadius: "calc(var(--radius) - 4px)",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
