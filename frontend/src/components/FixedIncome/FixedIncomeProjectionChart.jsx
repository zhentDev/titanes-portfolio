import { ColorType, LineStyle, PriceScaleMode, createChart } from "lightweight-charts";
import { memo, useEffect, useRef, useState } from "react";

function FixedIncomeProjectionChart({ projectionData, currency = "COP", mode = "NOMINAL" }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});

  // Individual series visibility state
  const [visibleSeries, setVisibleSeries] = useState({
    balance: true,
    capital: true,
    earnings: true,
    rate: true,
  });

  // Scale mode: Linear vs Logarithmic
  const [isLogScale, setIsLogScale] = useState(false);

  // Hover state for clean HUD header (avoids obstructing the chart)
  const [hoverData, setHoverData] = useState(null);

  const toggleSeries = (key) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Prevent turning all off
      if (!next.balance && !next.capital && !next.earnings && !next.rate) {
        return prev;
      }
      return next;
    });
  };

  const setPresetView = (preset) => {
    if (preset === "ALL") {
      setVisibleSeries({ balance: true, capital: true, earnings: true, rate: true });
    } else if (preset === "PROFIT") {
      setVisibleSeries({ balance: false, capital: false, earnings: true, rate: true });
    } else if (preset === "PATRIMONY") {
      setVisibleSeries({ balance: true, capital: true, earnings: false, rate: false });
    } else if (preset === "RATE") {
      setVisibleSeries({ balance: false, capital: false, earnings: false, rate: true });
    }
  };

  // Format currency
  const fmtMoney = (v) => {
    if (v === undefined || v === null || isNaN(v)) return "--";
    return `${currency === "COP" ? "$" : "US$"}${Number(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Latest point fallback for HUD
  const latestPoint = projectionData && projectionData.length > 0
    ? projectionData[projectionData.length - 1]
    : null;

  const currentDisplay = hoverData || latestPoint || {};

  useEffect(() => {
    if (!containerRef.current) return;

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
        vertLine: { color: "rgba(16,185,129,0.4)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(16,185,129,0.4)", width: 1, style: LineStyle.Dashed },
      },
      leftPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#c084fc",
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "#10b981",
        autoScale: true,
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        barSpacing: 10,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const chart = chartRef.current;

    // Projected Balance — Emerald Area
    seriesRef.current.balance = chart.addAreaSeries({
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.25)",
      bottomColor: "rgba(16, 185, 129, 0.0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false, // Clean: no invasive badges covering the lines
      priceFormat: {
        type: "custom",
        formatter: (price) => fmtMoney(price),
      },
    });

    // Base Capital Invertido — Amber Line
    seriesRef.current.capital = chart.addLineSeries({
      color: "#f59e0b",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        formatter: (price) => fmtMoney(price),
      },
    });

    // Ganancia Neta Acumulada — Cyan Line
    seriesRef.current.earnings = chart.addLineSeries({
      color: "#00e5ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        formatter: (price) => fmtMoney(price),
      },
    });

    // Rentabilidad Ponderada E.A. — Purple Line on Left Axis
    seriesRef.current.rate = chart.addLineSeries({
      color: "#c084fc",
      lineWidth: 2,
      priceScaleId: "left",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        formatter: (rate) => `${Number(rate).toFixed(2)}%`,
      },
    });

    // Crosshair move subscription for HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }

      const balVal = param.seriesData.get(seriesRef.current.balance)?.value;
      const capVal = param.seriesData.get(seriesRef.current.capital)?.value;
      const earnVal = param.seriesData.get(seriesRef.current.earnings)?.value;
      const rateVal = param.seriesData.get(seriesRef.current.rate)?.value;

      // Format clean standard date YYYY-MM-DD without overflowing
      let dateStr = "";
      if (typeof param.time === "number") {
        const dObj = new Date(param.time * 1000);
        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, "0");
        const d = String(dObj.getUTCDate()).padStart(2, "0");
        dateStr = `${y}-${m}-${d}`;
      } else if (typeof param.time === "string") {
        dateStr = param.time;
      }

      setHoverData({
        date: dateStr,
        projectedValue: balVal,
        baseCapital: capVal,
        earnings: earnVal,
        rate: rateVal,
      });
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

  // Update Logarithmic / Normal Mode
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.priceScale("right").applyOptions({
      mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
    chartRef.current.timeScale().fitContent();
  }, [isLogScale]);

  // Update Series Visibility dynamically based on visibleSeries state
  useEffect(() => {
    if (!seriesRef.current.balance) return;

    seriesRef.current.balance.applyOptions({ visible: visibleSeries.balance });
    seriesRef.current.capital.applyOptions({ visible: visibleSeries.capital });
    seriesRef.current.earnings.applyOptions({ visible: visibleSeries.earnings });
    seriesRef.current.rate.applyOptions({ visible: visibleSeries.rate });

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [visibleSeries]);

  // Update Series Data
  useEffect(() => {
    if (!chartRef.current || !projectionData?.length) return;

    const seenTimes = new Set();
    const formattedBalance = [];
    const formattedCapital = [];
    const formattedEarnings = [];
    const formattedRate = [];

    projectionData.forEach((d) => {
      const timeVal = d.date;
      if (!timeVal || seenTimes.has(timeVal)) return;
      seenTimes.add(timeVal);

      const timestamp = Math.floor(new Date(d.date).getTime() / 1000);

      formattedBalance.push({
        time: timestamp,
        value: Number(d.projectedValue) || 0,
      });

      formattedCapital.push({
        time: timestamp,
        value: Number(d.baseCapital) || 0,
      });

      formattedEarnings.push({
        time: timestamp,
        value: Number(d.earnings) || 0,
      });

      formattedRate.push({
        time: timestamp,
        value: Number(d.rate) || 0,
      });
    });

    if (formattedBalance.length > 0) {
      seriesRef.current.balance?.setData(formattedBalance);
      seriesRef.current.capital?.setData(formattedCapital);
      seriesRef.current.earnings?.setData(formattedEarnings);
      seriesRef.current.rate?.setData(formattedRate);
      chartRef.current.timeScale().fitContent();
    }
  }, [projectionData]);

  // Determine current active preset
  const isAll = visibleSeries.balance && visibleSeries.capital && visibleSeries.earnings && visibleSeries.rate;
  const isProfitOnly = !visibleSeries.balance && !visibleSeries.capital && visibleSeries.earnings && visibleSeries.rate;
  const isPatrimonyOnly = visibleSeries.balance && visibleSeries.capital && !visibleSeries.earnings && !visibleSeries.rate;
  const isRateOnly = !visibleSeries.balance && !visibleSeries.capital && !visibleSeries.earnings && visibleSeries.rate;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 380,
        background: "rgba(15, 23, 42, 0.55)",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "14px 18px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {/* ── TOP CONTROLS & FILTER BAR ────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* Left: Title, Scale Switcher & Presets */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
              Historial de Crecimiento & Rentabilidad Real
            </span>
          </div>

          {/* Log / Linear Scale Switcher */}
          <button
            type="button"
            onClick={() => setIsLogScale(!isLogScale)}
            style={{
              background: isLogScale ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isLogScale ? "#38bdf8" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 12,
              padding: "2px 8px",
              color: isLogScale ? "#38bdf8" : "#94a3b8",
              fontSize: "0.68rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
            title="Alternar entre Escala Lineal y Escala Logarítmica para ver curvas grandes y pequeñas al mismo tiempo"
          >
            <span>{isLogScale ? "📐 Escala Logarítmica" : "📏 Escala Lineal"}</span>
          </button>

          {/* Quick Presets Bar */}
          <div
            style={{
              display: "flex",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 14,
              padding: 2,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => setPresetView("ALL")}
              style={{
                background: isAll ? "rgba(16, 185, 129, 0.2)" : "transparent",
                color: isAll ? "#10b981" : "#94a3b8",
                border: isAll ? "1px solid rgba(16, 185, 129, 0.4)" : "none",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: "0.68rem",
                fontWeight: isAll ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              🌟 Completo
            </button>
            <button
              type="button"
              onClick={() => setPresetView("PROFIT")}
              style={{
                background: isProfitOnly ? "rgba(0, 229, 255, 0.2)" : "transparent",
                color: isProfitOnly ? "#00e5ff" : "#94a3b8",
                border: isProfitOnly ? "1px solid rgba(0, 229, 255, 0.4)" : "none",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: "0.68rem",
                fontWeight: isProfitOnly ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              💰 Solo Ganancia
            </button>
            <button
              type="button"
              onClick={() => setPresetView("PATRIMONY")}
              style={{
                background: isPatrimonyOnly ? "rgba(245, 158, 11, 0.2)" : "transparent",
                color: isPatrimonyOnly ? "#f59e0b" : "#94a3b8",
                border: isPatrimonyOnly ? "1px solid rgba(245, 158, 11, 0.4)" : "none",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: "0.68rem",
                fontWeight: isPatrimonyOnly ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              🏛️ Patrimonio
            </button>
            <button
              type="button"
              onClick={() => setPresetView("RATE")}
              style={{
                background: isRateOnly ? "rgba(192, 132, 252, 0.2)" : "transparent",
                color: isRateOnly ? "#c084fc" : "#94a3b8",
                border: isRateOnly ? "1px solid rgba(192, 132, 252, 0.4)" : "none",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: "0.68rem",
                fontWeight: isRateOnly ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              📈 Solo Tasa
            </button>
          </div>
        </div>

        {/* Right: Interactive Series Badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* 1. Rentabilidad E.A. */}
          <button
            type="button"
            onClick={() => toggleSeries("rate")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: visibleSeries.rate ? "rgba(192, 132, 252, 0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${visibleSeries.rate ? "rgba(192, 132, 252, 0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              color: visibleSeries.rate ? "#c084fc" : "#64748b",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              opacity: visibleSeries.rate ? 1 : 0.4,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: visibleSeries.rate ? "#c084fc" : "#64748b" }} />
            <span>Tasa Ponderada (%)</span>
            <span style={{ fontSize: "0.62rem" }}>{visibleSeries.rate ? "👁️" : "✕"}</span>
          </button>

          {/* 2. Saldo Total Real */}
          <button
            type="button"
            onClick={() => toggleSeries("balance")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: visibleSeries.balance ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${visibleSeries.balance ? "rgba(16, 185, 129, 0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              color: visibleSeries.balance ? "#10b981" : "#64748b",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              opacity: visibleSeries.balance ? 1 : 0.4,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: visibleSeries.balance ? "#10b981" : "#64748b" }} />
            <span>Saldo Total</span>
            <span style={{ fontSize: "0.62rem" }}>{visibleSeries.balance ? "👁️" : "✕"}</span>
          </button>

          {/* 3. Capital Invertido */}
          <button
            type="button"
            onClick={() => toggleSeries("capital")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: visibleSeries.capital ? "rgba(245, 158, 11, 0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${visibleSeries.capital ? "rgba(245, 158, 11, 0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              color: visibleSeries.capital ? "#f59e0b" : "#64748b",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              opacity: visibleSeries.capital ? 1 : 0.4,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: visibleSeries.capital ? "#f59e0b" : "#64748b" }} />
            <span>Capital Base</span>
            <span style={{ fontSize: "0.62rem" }}>{visibleSeries.capital ? "👁️" : "✕"}</span>
          </button>

          {/* 4. Ganancia Neta */}
          <button
            type="button"
            onClick={() => toggleSeries("earnings")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: visibleSeries.earnings ? "rgba(0, 229, 255, 0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${visibleSeries.earnings ? "rgba(0, 229, 255, 0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              color: visibleSeries.earnings ? "#00e5ff" : "#64748b",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              opacity: visibleSeries.earnings ? 1 : 0.4,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: visibleSeries.earnings ? "#00e5ff" : "#64748b" }} />
            <span>Ganancia Neta</span>
            <span style={{ fontSize: "0.62rem" }}>{visibleSeries.earnings ? "👁️" : "✕"}</span>
          </button>
        </div>
      </div>

      {/* ── CLEAN FIXED HUD VALUES GRID (ZERO JUMPING / FIXED POSITIONS) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(115px, auto) repeat(auto-fit, minmax(130px, 1fr))",
          gap: 10,
          alignItems: "center",
          padding: "6px 14px",
          background: "rgba(0, 0, 0, 0.35)",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.06)",
          marginBottom: 8,
          fontSize: "0.72rem",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ color: "#94a3b8", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
          <span>📅</span>
          <span style={{ color: "#f8fafc", fontWeight: 700 }}>{currentDisplay.date || "Hoy"}</span>
        </div>

        <div style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", opacity: visibleSeries.balance ? 1 : 0.25 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
          <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Saldo:</span>
          <span style={{ fontWeight: 700, color: "#f8fafc" }}>
            {fmtMoney(currentDisplay.projectedValue)}
          </span>
        </div>

        <div style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", opacity: visibleSeries.capital ? 1 : 0.25 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
          <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Capital:</span>
          <span style={{ fontWeight: 700, color: "#f8fafc" }}>
            {fmtMoney(currentDisplay.baseCapital)}
          </span>
        </div>

        <div style={{ color: "#00e5ff", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", opacity: visibleSeries.earnings ? 1 : 0.25 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5ff", flexShrink: 0 }} />
          <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Ganancia:</span>
          <span style={{ fontWeight: 700, color: "#00e5ff" }}>
            +{fmtMoney(currentDisplay.earnings)}
          </span>
        </div>

        <div style={{ color: "#c084fc", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", opacity: visibleSeries.rate ? 1 : 0.25 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c084fc", flexShrink: 0 }} />
          <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Tasa Ponderada:</span>
          <span style={{ fontWeight: 700, color: "#c084fc" }}>
            {currentDisplay.rate ? `${Number(currentDisplay.rate).toFixed(2)}%` : "--"}
          </span>
        </div>
      </div>

      <div ref={containerRef} style={{ width: "100%", height: 260 }} />
    </div>
  );
}

export default memo(FixedIncomeProjectionChart);
