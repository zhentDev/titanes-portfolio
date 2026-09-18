/**
 * chartTheme.js
 * Returns chart color tokens for lightweight-charts based on the active theme.
 */
export function getChartColors(theme) {
  if (theme === "light") {
    return {
      background: "transparent",
      textColor: "#475569",
      gridColor: "rgba(0,0,0,0.05)",
      borderColor: "rgba(0,0,0,0.10)",
      crosshairColor: "rgba(2,132,199,0.5)",
      upColor: "#059669",
      downColor: "#dc2626",
      lineColor: "#0284c7",
      areaTopColor: "rgba(2,132,199,0.20)",
      areaBottomColor: "rgba(2,132,199,0.01)",
      volumeUpColor: "rgba(5,150,105,0.4)",
      volumeDownColor: "rgba(220,38,38,0.4)",
      leftScaleText: "#059669",
      rightScaleText: "#0284c7",
      purpleScaleText: "#9333ea",
    };
  }
  return {
    background: "transparent",
    textColor: "#94a3b8",
    gridColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    crosshairColor: "rgba(0,229,255,0.4)",
    upColor: "#10b981",
    downColor: "#ef4444",
    lineColor: "#00e5ff",
    areaTopColor: "rgba(0,229,255,0.20)",
    areaBottomColor: "rgba(0,229,255,0.02)",
    volumeUpColor: "rgba(16,185,129,0.4)",
    volumeDownColor: "rgba(239,68,68,0.4)",
    leftScaleText: "#10b981",
    rightScaleText: "#00e5ff",
    purpleScaleText: "#c084fc",
  };
}

export function applyChartTheme(chart, theme) {
  if (!chart) return;
  const c = getChartColors(theme);
  chart.applyOptions({
    layout: { textColor: c.textColor },
    grid: {
      vertLines: { color: c.gridColor },
      horzLines: { color: c.gridColor },
    },
    crosshair: {
      vertLine: { color: c.crosshairColor },
      horzLine: { color: c.crosshairColor },
    },
    leftPriceScale: { borderColor: c.borderColor, textColor: c.leftScaleText },
    rightPriceScale: { borderColor: c.borderColor, textColor: c.rightScaleText },
    timeScale: { borderColor: c.borderColor },
  });
}
