import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { fetchFxHistory } from "../../api/client";
import { useTheme } from "../../context/ThemeContext";
import { getChartColors } from "../../utils/chartTheme";

const RANGES = [
  { label: "1S", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "5A", days: 1825 },
  { label: "TODO", days: null },
];

export default function FxRateExplorer({ defaultAsset = "USD", defaultLocal = "COP" }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  // Pair state: base is what we want (e.g. USD) and quote is target (e.g. COP)
  const [baseCurrency, setBaseCurrency] = useState(defaultAsset);
  const [quoteCurrency, setQuoteCurrency] = useState(defaultLocal);
  const [isInverted, setIsInverted] = useState(false); // false: USD -> COP, true: COP -> USD

  // Data state
  const [rawFxData, setRawFxData] = useState({ current: 0, history: {} });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Time range filter
  const [selectedRange, setSelectedRange] = useState("1A");

  // Converter state
  const [convertAmount, setConvertAmount] = useState(100);

  // Chart DOM refs
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const areaSeriesRef = useRef(null);

  // Fetch FX data (always fetches standard USD-COP from backend cache/yfinance)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (!isMounted) return;
        if (res && res.history) {
          setRawFxData(res);
        } else {
          setError("No se pudieron cargar los datos de la tasa de cambio");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error fetching FX history:", err);
        setError("Error de conexión al cargar la TRM");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute active rate and transformed historical series based on inversion
  const { currentRate, historyList, stats } = useMemo(() => {
    const hist = rawFxData?.history || {};
    const dates = Object.keys(hist).sort();

    if (dates.length === 0) {
      return { currentRate: 0, historyList: [], stats: null };
    }

    const list = dates
      .map((d) => {
        const rawVal = Number(hist[d]);
        if (!rawVal || isNaN(rawVal) || rawVal <= 0) return null;
        const val = isInverted ? 1 / rawVal : rawVal;
        return {
          time: d,
          value: isInverted ? Number(val.toFixed(8)) : Number(val.toFixed(2)),
          rawVal,
        };
      })
      .filter(Boolean);

    const latestRaw = rawFxData.current || (list.length > 0 ? list[list.length - 1].rawVal : 0);
    const curr = isInverted ? (latestRaw > 0 ? 1 / latestRaw : 0) : latestRaw;

    // Filter by selected range
    let filteredList = list;
    const rangeObj = RANGES.find((r) => r.label === selectedRange);
    if (rangeObj && rangeObj.days && list.length > 0) {
      const lastDate = new Date(list[list.length - 1].time);
      const cutoff = new Date(lastDate);
      cutoff.setDate(cutoff.getDate() - rangeObj.days);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      filteredList = list.filter((item) => item.time >= cutoffStr);
      if (filteredList.length === 0) filteredList = list;
    }

    // High / Low / Change stats
    let minVal = Infinity;
    let maxVal = -Infinity;
    filteredList.forEach((pt) => {
      if (pt.value < minVal) minVal = pt.value;
      if (pt.value > maxVal) maxVal = pt.value;
    });

    const firstPt = filteredList[0];
    const lastPt = filteredList[filteredList.length - 1];
    const changeVal = firstPt && lastPt ? lastPt.value - firstPt.value : 0;
    const changePct = firstPt && firstPt.value > 0 ? (changeVal / firstPt.value) * 100 : 0;

    return {
      currentRate: curr,
      historyList: filteredList,
      stats: {
        min: minVal === Infinity ? 0 : minVal,
        max: maxVal === -Infinity ? 0 : maxVal,
        changeVal,
        changePct,
        firstTime: firstPt?.time,
        lastTime: lastPt?.time,
      },
    };
  }, [rawFxData, isInverted, selectedRange]);

  // Handle Chart Creation & Updates
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: 380,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: chartColors.textColor,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartColors.gridColor },
        horzLines: { color: chartColors.gridColor },
      },
      crosshair: {
        vertLine: { color: chartColors.crosshairColor, width: 1, style: 2 },
        horzLine: { color: chartColors.crosshairColor, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        textColor: chartColors.textColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: false,
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: isInverted ? (isLight ? "#059669" : "#10b981") : isLight ? "#0284c7" : "#00e5ff",
      topColor: isInverted
        ? isLight
          ? "rgba(5, 150, 105, 0.28)"
          : "rgba(16, 185, 129, 0.28)"
        : isLight
        ? "rgba(2, 132, 199, 0.25)"
        : "rgba(0, 229, 255, 0.25)",
      bottomColor: "rgba(0, 0, 0, 0.00)",
      lineWidth: 2,
      priceFormat: isInverted
        ? { type: "price", precision: 6, minMove: 0.000001 }
        : { type: "price", precision: 2, minMove: 0.05 },
    });

    areaSeriesRef.current = areaSeries;

    if (historyList.length > 0) {
      areaSeries.setData(historyList);
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (container && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: container.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [isInverted, theme, chartColors, isLight]);

  // Update chart data whenever historyList changes without recreating the chart if possible
  useEffect(() => {
    if (areaSeriesRef.current && chartInstanceRef.current && historyList.length > 0) {
      areaSeriesRef.current.setData(historyList);
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [historyList]);

  // Switch / Toggle inversion
  const handleToggleInversion = () => {
    setIsInverted((prev) => !prev);
  };

  // Conversions
  const convertedResult = useMemo(() => {
    const num = Number(convertAmount) || 0;
    if (currentRate <= 0) return 0;
    return num * currentRate;
  }, [convertAmount, currentRate]);

  const activeFromSym = isInverted ? "COP" : "USD";
  const activeToSym = isInverted ? "USD" : "COP";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Top Bar: Pair Title, Invert Button & Quick Metrics ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "16px 20px",
          background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
          borderRadius: 12,
          border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.3rem",
              background: isInverted
                ? isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)"
                : isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.15)",
              color: isInverted
                ? isLight ? "#059669" : "#34d399"
                : isLight ? "#0284c7" : "#00e5ff",
            }}
          >
            💱
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                {activeFromSym} / {activeToSym}
              </h3>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 700,
                  background: isInverted ? "rgba(16, 185, 129, 0.15)" : "rgba(0, 229, 255, 0.15)",
                  color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                  border: `1px solid ${isInverted ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 229, 255, 0.3)"}`,
                }}
              >
                {isInverted ? "Pesos Colombianos a Dólares" : "TRM Dólar / Peso Colombiano"}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Tasa de cambio spot del mercado interbancario
            </div>
          </div>
        </div>

        {/* Invert Button & Current Value Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              marginRight: 6,
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Tasa Actual (Spot)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                }}
              >
                {isInverted
                  ? `$${currentRate.toFixed(6)}`
                  : `$${currentRate.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700 }}>
                {activeToSym}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleInversion}
            title={`Invertir par a ${activeToSym} → ${activeFromSym}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 8,
              border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}`,
              background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.05)",
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.06)" : "0 2px 8px rgba(0,0,0,0.2)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = isInverted ? "#10b981" : "var(--accent-primary)";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <span style={{ fontSize: "1rem" }}>⇄</span>
            <span>Invertir ({activeToSym} → {activeFromSym})</span>
          </button>
        </div>
      </div>

      {/* ── Conversor de Divisa Rápido e Interactivo ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          padding: "16px 20px",
          background: isLight ? "rgba(2, 132, 199, 0.04)" : "rgba(0, 229, 255, 0.03)",
          border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.1)"}`,
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Monto a Convertir ({activeFromSym})
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "6px 12px",
            }}
          >
            <span style={{ fontWeight: 800, color: "var(--text-muted)", marginRight: 8 }}>
              {activeFromSym === "USD" ? "$" : "COP$"}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              placeholder="0.00"
            />
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", marginLeft: 6 }}>
              {activeFromSym}
            </span>
          </div>
        </div>

        {/* Central Arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            onClick={handleToggleInversion}
            title="Click para alternar dirección de conversión"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 20,
              background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
              transition: "all 0.2s ease",
            }}
          >
            <span>{activeFromSym}</span>
            <span>➔</span>
            <span>{activeToSym}</span>
          </div>
        </div>

        {/* Result Output */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Equivalente Resultante ({activeToSym})
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {isInverted
                ? `$${convertedResult.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                : `$${convertedResult.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "var(--text-muted)",
              }}
            >
              {activeToSym}
            </span>
          </div>
        </div>
      </div>

      {/* ── Chart Section & Range Filters ── */}
      <div
        style={{
          background: isLight ? "#ffffff" : "var(--bg-surface)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {/* Stats summary */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              📈 Gráfica Histórica ({activeFromSym} / {activeToSym})
            </span>

            {stats && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.78rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Mín: </span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isInverted ? stats.min.toFixed(6) : stats.min.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Máx: </span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isInverted ? stats.max.toFixed(6) : stats.max.toFixed(1)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    color: stats.changeVal >= 0 ? "#10b981" : "#f43f5e",
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span>{stats.changeVal >= 0 ? "▲" : "▼"}</span>
                  <span>{Math.abs(stats.changePct).toFixed(2)}%</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    en el periodo
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Timeframe Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              padding: 3,
              borderRadius: 8,
              border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            {RANGES.map((r) => {
              const isSelected = selectedRange === r.label;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setSelectedRange(r.label)}
                  style={{
                    border: "none",
                    background: isSelected
                      ? isInverted
                        ? isLight ? "#059669" : "#10b981"
                        : isLight ? "#0284c7" : "var(--accent-primary)"
                      : "transparent",
                    color: isSelected
                      ? isLight ? "#ffffff" : "#0d1117"
                      : "var(--text-muted)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    fontWeight: isSelected ? 800 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart View Container */}
        {isLoading ? (
          <div
            style={{
              height: 380,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            Cargando histórico de tipo de cambio...
          </div>
        ) : error ? (
          <div
            style={{
              height: 380,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f43f5e",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        ) : (
          <div
            ref={chartContainerRef}
            style={{
              width: "100%",
              height: 380,
            }}
          />
        )}
      </div>
    </div>
  );
}
