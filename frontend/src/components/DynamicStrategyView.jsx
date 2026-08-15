import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchColInflationHistory,
  fetchFxHistory,
  fetchLiveQuotes,
  searchTicker,
} from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { toastConfirm } from "../utils/toastAlerts";
import InflationExplorerModal from "./InflationExplorerModal";
import StrategyChart, { SYNTHETIC_RETURNS } from "./StrategyChart";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];

export default function DynamicStrategyView({ strategy, onDelete, onBack, firstInvestDate }) {
  const storageKey = `titanes_strat_${strategy.id}_rebalances`;
  const capitalKey = `titanes_strat_${strategy.id}_capital`;
  const settingsKey = `titanes_strat_${strategy.id}_settings`;

  // Settings for currency and inflation
  const [stratSettings, setStratSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return {
      assetCurrency: "USD",
      localCurrency: "COP",
      inflationRate: 0,
      useAutoColInflation: false,
    };
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInflationExplorer, setShowInflationExplorer] = useState(false);
  const [stratYieldViewMode, setStratYieldViewMode] = useState("USD");
  const [fxData, setFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingFx, setIsFetchingFx] = useState(false);
  const [colInflationData, setColInflationData] = useState({
    history: {},
    latest: {},
    monthly_rates: [],
  });
  const [isFetchingInflation, setIsFetchingInflation] = useState(false);

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify(stratSettings));
  }, [stratSettings, settingsKey]);

  useEffect(() => {
    if (
      stratSettings.assetCurrency &&
      stratSettings.localCurrency &&
      stratSettings.assetCurrency !== stratSettings.localCurrency
    ) {
      setIsFetchingFx(true);
      fetchFxHistory(stratSettings.assetCurrency, stratSettings.localCurrency)
        .then((res) => setFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingFx(false));
    } else {
      setFxData({ current: 1.0, history: {} });
      if (stratYieldViewMode === "FX") setStratYieldViewMode("USD");
    }
  }, [stratSettings.assetCurrency, stratSettings.localCurrency]);

  useEffect(() => {
    setIsFetchingInflation(true);
    fetchColInflationHistory()
      .then((res) => setColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingInflation(false));
  }, []);

  // Rebalance history for this specific custom strategy
  const [rebalances, setRebalances] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return [
      {
        rebalance_date: new Date().toISOString().split("T")[0],
        cash_added: 0,
        tickers: [],
      },
    ];
  });

  const { period: storePeriod, updateStrategyCapital } = usePortfolioStore();

  // Umbrales de desbloqueo: un periodo se activa al tener al menos estos días de historial
  // desde la primera inversión. Escala progresiva: cada periodo se desbloquea con una fracción
  // de su ventana (p. ej. 1M desde la 1ra semana), evitando saltos bruscos entre niveles.
  const UNLOCK_DAYS = {
    "1W": 1,
    "1M": 7,
    "3M": 30,
    "6M": 90,
    "1Y": 180,
    "3Y": 365,
    "5Y": 1095,
    MAX: 0,
  };
  const periodEnabled = useMemo(() => {
    const map = {};
    const availableDays = firstInvestDate
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(`${firstInvestDate}T00:00:00Z`).getTime()) / 86400000,
          ),
        )
      : Infinity;
    for (const p of PERIODS) map[p] = !firstInvestDate || UNLOCK_DAYS[p] <= availableDays;
    return map;
  }, [firstInvestDate]);

  const [period, setPeriod] = useState(() =>
    periodEnabled[storePeriod] ? storePeriod : PERIODS.find((p) => periodEnabled[p]) || "1W",
  );

  const [simulatedCapital, setLocalSimulatedCapital] = useState(() => {
    try {
      const saved = localStorage.getItem(capitalKey);
      return saved ? Number(saved) : strategy.activeInvested || 1000;
    } catch {
      return strategy.activeInvested || 1000;
    }
  });

  const numSlots = strategy.numSlots || 20;
  const [unit, setUnit] = useState("pct");

  // Form state to add new dated rebalance
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formTickers, setFormTickers] = useState(() => {
    return rebalances.length > 0 ? [...(rebalances[rebalances.length - 1].tickers || [])] : [];
  });
  const [selectedForDeletion, setSelectedForDeletion] = useState([]);

  // Search & Batch paste input
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [batchInput, setBatchInput] = useState("");

  // Persist rebalances and capital
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(rebalances));
  }, [rebalances, storageKey]);

  useEffect(() => {
    localStorage.setItem(capitalKey, String(simulatedCapital));
  }, [simulatedCapital, capitalKey]);

  // Latest active rebalance
  const activeRebalance = rebalances[rebalances.length - 1] || {
    tickers: [],
    rebalance_date: date,
  };
  const activeTickers = activeRebalance.tickers || [];
  const slotValue = simulatedCapital / numSlots;
  const activeInvested = activeTickers.length * slotValue;
  const cashBuffer = simulatedCapital - activeInvested;
  const weightPerSlot = (100 / numSlots).toFixed(1);

  const [tickerMetadata, setTickerMetadata] = useState({});

  useEffect(() => {
    if (activeTickers.length > 0) {
      fetchLiveQuotes(activeTickers)
        .then((res) => {
          if (Array.isArray(res)) {
            const map = {};
            res.forEach((q) => {
              map[q.ticker] = q;
            });
            setTickerMetadata(map);
          }
        })
        .catch(console.error);
    }
  }, [activeTickers.join(",")]);

  // Sync to global store (NavChart needs this)
  useEffect(() => {
    if (strategy?.id) {
      updateStrategyCapital(strategy.id, simulatedCapital, activeInvested);
    }
  }, [simulatedCapital, activeInvested, strategy?.id, updateStrategyCapital]);

  const currentReturns = SYNTHETIC_RETURNS[period] || SYNTHETIC_RETURNS["MAX"];

  const handleSearchAndAdd = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    const ticker = query.trim().toUpperCase();
    if (formTickers.includes(ticker)) {
      setSearchError(`${ticker} ya está en la lista`);
      return;
    }
    if (formTickers.length >= numSlots) {
      setSearchError(`Límite máximo de ${numSlots} slots alcanzado`);
      return;
    }

    setSearching(true);
    setSearchError("");
    try {
      const res = await searchTicker(ticker);
      if (res.valid) {
        setFormTickers((prev) => [...prev, res.ticker]);
        setQuery("");
      } else {
        setFormTickers((prev) => [...prev, ticker]);
        setQuery("");
      }
    } catch {
      setFormTickers((prev) => [...prev, ticker]);
      setQuery("");
    } finally {
      setSearching(false);
    }
  };

  const handleBatchAdd = () => {
    if (!batchInput.trim()) return;
    const extracted = batchInput
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && /^[A-Z0-9.-]+$/.test(t));

    const uniqueNew = extracted.filter((t) => !formTickers.includes(t));
    const combined = [...formTickers, ...uniqueNew].slice(0, numSlots);
    setFormTickers(combined);
    setBatchInput("");
  };

  const handleRemoveTicker = (tickerToRemove) => {
    setFormTickers((prev) => prev.filter((t) => t !== tickerToRemove));
    setSelectedForDeletion((prev) => prev.filter((t) => t !== tickerToRemove));
  };

  const toggleForDeletion = (ticker) => {
    setSelectedForDeletion((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    );
  };

  const handleDeleteSelected = () => {
    setFormTickers((prev) => prev.filter((t) => !selectedForDeletion.includes(t)));
    setSelectedForDeletion([]);
  };

  const handleSaveRebalance = () => {
    if (!date) {
      toast.error("Por favor selecciona una fecha válida");
      return;
    }
    if (formTickers.length === 0) {
      toast.error("Debes agregar al menos 1 posición al rebalanceo");
      return;
    }

    const updated = [
      ...rebalances.filter((r) => r.rebalance_date !== date),
      {
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers,
      },
    ].sort((a, b) => (a.rebalance_date > b.rebalance_date ? 1 : -1));

    setRebalances(updated);
    toast.success(`Rebalanceo del ${date} guardado con éxito (${formTickers.length} posiciones)`);
  };

  const handleDeleteRebalance = async (delDate) => {
    const isConfirmed = await toastConfirm(`¿Eliminar el rebalanceo de la fecha ${delDate}?`);
    if (!isConfirmed) return;
    setRebalances((prev) => prev.filter((r) => r.rebalance_date !== delDate));
  };

  const handleDeleteStrategy = async () => {
    if (strategy.isSystem) {
      toast.error("Esta es una estrategia base del sistema y no puede eliminarse.");
      return;
    }
    const isConfirmed = await toastConfirm(
      `¿Estás seguro de eliminar por completo la estrategia "${strategy.name}"?`,
    );
    if (isConfirmed) {
      onDelete(strategy.id);
    }
  };

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Strategy Header ──────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "24px",
          background: `linear-gradient(135deg, ${strategy.color}14 0%, rgba(0, 0, 0, 0.4) 100%)`,
          border: `1px solid ${strategy.color}40`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>{strategy.country || "🌎"}</span>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#f1f5f9" }}>
              {strategy.name}
            </h2>
            {strategy.isSystem && (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: `${strategy.color}33`,
                  color: strategy.color,
                  border: `1px solid ${strategy.color}4D`,
                }}
              >
                PRO
              </span>
            )}
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {numSlots} SLOTS
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
              }}
            >
              Benchmark: {strategy.benchmark || "S&P 500"}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#94a3b8" }}>
            Estrategia personalizada con {numSlots} posiciones equiponderadas ({weightPerSlot}% por
            slot).
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              padding: "6px 14px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Capital Simulado:
            </span>
            <span style={{ color: strategy.color, fontWeight: 700 }}>$</span>
            <input
              type="number"
              min={100}
              step={100}
              value={simulatedCapital}
              onChange={(e) => setLocalSimulatedCapital(Number(e.target.value))}
              style={{
                width: 90,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 8px",
                color: strategy.color,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.9rem",
                textAlign: "right",
              }}
            />
          </div>

          <div
            className="unit-toggle"
            onClick={() => setUnit((u) => (u === "pct" ? "usd" : "pct"))}
          >
            <button
              className={`unit-btn ${unit === "pct" ? "active" : ""}`}
              style={unit === "pct" ? { color: strategy.color } : {}}
            >
              %
            </button>
            <button
              className={`unit-btn ${unit === "usd" ? "active" : ""}`}
              style={unit === "usd" ? { color: strategy.color } : {}}
            >
              $
            </button>
          </div>

          {!strategy.isSystem && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleDeleteStrategy}
              style={{ padding: "6px 12px", fontSize: "0.75rem", fontWeight: 700 }}
              title="Eliminar esta estrategia personalizada"
            >
              🗑️ Eliminar Estrategia
            </button>
          )}
        </div>
      </div>

      {/* ── Yield View Controls for Strategy (Nominal / Divisa / Real) ── */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            background: "rgba(0,0,0,0.3)",
            borderRadius: 20,
            padding: 4,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <button
            onClick={() => setStratYieldViewMode("USD")}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background: stratYieldViewMode === "USD" ? "rgba(255,255,255,0.1)" : "transparent",
              color: stratYieldViewMode === "USD" ? "#fff" : "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "USD" ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Nominal ({stratSettings.assetCurrency || "USD"})
          </button>
          <button
            onClick={() => {
              if (
                stratSettings.localCurrency &&
                stratSettings.localCurrency !== (stratSettings.assetCurrency || "USD")
              ) {
                setStratYieldViewMode("FX");
              } else if (stratSettings.localCurrency) {
                setStratYieldViewMode("FX");
              } else {
                toast("Configura tu Divisa Local en ⚙️ primero.", { icon: "ℹ️" });
              }
            }}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background: stratYieldViewMode === "FX" ? "rgba(0, 229, 255, 0.15)" : "transparent",
              color: stratYieldViewMode === "FX" ? "#00e5ff" : "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "FX" ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Divisa ({stratSettings.localCurrency || "COP"}){" "}
            {isFetchingFx && stratYieldViewMode === "FX" && "⏳"}
          </button>
          <button
            onClick={() => {
              if (stratSettings.useAutoColInflation || stratSettings.inflationRate > 0) {
                setStratYieldViewMode("REAL");
              } else {
                toast("Configura la Inflación en ⚙️ primero.", { icon: "ℹ️" });
              }
            }}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background:
                stratYieldViewMode === "REAL" ? "rgba(245, 158, 11, 0.15)" : "transparent",
              color: stratYieldViewMode === "REAL" ? "#f59e0b" : "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "REAL" ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Poder Adquisitivo Real {isFetchingInflation && stratYieldViewMode === "REAL" && "⏳"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowInflationExplorer(true)}
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              color: "#fbbf24",
              padding: "6px 14px",
              borderRadius: "14px",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            🔍 Ver Historial IPC (
            {colInflationData.latest?.yoy ? `${colInflationData.latest.yoy}%` : "Colombia"})
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "var(--text-secondary)",
              padding: "6px 14px",
              borderRadius: "14px",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            ⚙️ Configurar Divisa/Inflación
          </button>
        </div>
      </div>

      {(() => {
        let fxMult = 1.0;
        if (stratYieldViewMode !== "USD") {
          fxMult = fxData.current || 1.0;
        }

        let inflationFactor = 1.0;
        if (stratYieldViewMode === "REAL") {
          if (
            stratSettings.useAutoColInflation &&
            colInflationData.history &&
            Object.keys(colInflationData.history).length > 0
          ) {
            const dates = Object.keys(colInflationData.history).sort();
            const cpiCurrent = colInflationData.history[dates[dates.length - 1]];
            const pastDates = dates.slice(0, Math.max(1, dates.length - 12));
            const cpiStart =
              pastDates.length > 0 ? colInflationData.history[pastDates[0]] : cpiCurrent;
            if (cpiStart && cpiCurrent) {
              inflationFactor = cpiCurrent / cpiStart;
            }
          } else if (stratSettings.inflationRate > 0) {
            const years =
              period === "1W"
                ? 1 / 52
                : period === "1M"
                  ? 1 / 12
                  : period === "3M"
                    ? 3 / 12
                    : period === "6M"
                      ? 6 / 12
                      : period === "1Y"
                        ? 1
                        : period === "3Y"
                          ? 3
                          : period === "5Y"
                            ? 5
                            : 5;
            inflationFactor = Math.pow(1 + stratSettings.inflationRate / 100, years);
          }
        }

        const rawInvested = activeInvested;
        const investedAdjusted = rawInvested * (stratYieldViewMode !== "USD" ? fxMult : 1.0);

        const rawStockVal = rawInvested * (1 + currentReturns.strat);
        const currentStockValueAdjusted =
          (rawStockVal * (stratYieldViewMode !== "USD" ? fxMult : 1.0)) / inflationFactor;

        const netReturnAdjusted = currentStockValueAdjusted - investedAdjusted;
        const returnPctAdjusted = investedAdjusted > 0 ? netReturnAdjusted / investedAdjusted : 0;

        const currSymbol =
          stratYieldViewMode === "USD"
            ? stratSettings.assetCurrency || "USD"
            : stratSettings.localCurrency || "COP";

        return (
          <div className="summary-strip fade-up">
            <div className="summary-item">
              <div className="summary-label">
                Rentabilidad {strategy.name} ({stratYieldViewMode === "REAL" ? "Real" : period})
              </div>
              <div
                className="summary-value large mono"
                style={{
                  color: returnPctAdjusted >= 0 ? "var(--gain)" : "var(--loss)",
                  fontWeight: 800,
                }}
              >
                {unit === "pct"
                  ? `${returnPctAdjusted >= 0 ? "+" : ""}${(returnPctAdjusted * 100).toFixed(1)}%`
                  : `${netReturnAdjusted >= 0 ? "+" : "-"}$${Math.abs(netReturnAdjusted).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">
                Benchmark ({strategy.benchmark}) ({period})
              </div>
              <div className="summary-value mono" style={{ color: "#fbbf24", fontWeight: 700 }}>
                {unit === "pct"
                  ? `${currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] >= 0 ? "+" : ""}${(currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] * 100).toFixed(1)}%`
                  : `${currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] >= 0 ? "+" : "-"}$${Math.abs(investedAdjusted * currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">
                Capital Activo ({activeTickers.length}/{numSlots} Slots - {currSymbol})
              </div>
              <div
                className="summary-value mono large"
                style={{ color: strategy.color, fontWeight: 800 }}
              >
                {unit === "pct"
                  ? `${((activeTickers.length / numSlots) * 100).toFixed(1)}%`
                  : `$${investedAdjusted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">Regla de Asignación</div>
              <div
                className="summary-value mono"
                style={{ color: strategy.color, fontWeight: 700 }}
              >
                {weightPerSlot}% / slot ($
                {(slotValue * (stratYieldViewMode !== "USD" ? fxMult : 1.0)).toFixed(2)})
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
      {(() => {
        const nomInvested = activeInvested;
        const nomReturnUsd = nomInvested * (currentReturns.strat || 0);
        const nomReturnPct = (currentReturns.strat || 0) * 100;

        const fxMult = fxData.current || 1.0;
        const fxInvested = nomInvested * fxMult;
        const fxStockVal = (nomInvested + nomReturnUsd) * fxMult;
        const fxReturnNet = fxStockVal - fxInvested;
        const fxReturnPct = fxInvested > 0 ? (fxReturnNet / fxInvested) * 100 : 0;

        let inflationFactor = 1.0;
        if (stratSettings.useAutoColInflation && colInflationData.latest?.yoy) {
          const yoy = colInflationData.latest.yoy;
          const years =
            period === "1W"
              ? 1 / 52
              : period === "1M"
                ? 1 / 12
                : period === "3M"
                  ? 3 / 12
                  : period === "6M"
                    ? 6 / 12
                    : period === "1Y"
                      ? 1
                      : period === "3Y"
                        ? 3
                        : period === "5Y"
                          ? 5
                          : 5;
          inflationFactor = Math.pow(1 + yoy / 100, years);
        } else if (stratSettings.inflationRate > 0) {
          const years =
            period === "1W"
              ? 1 / 52
              : period === "1M"
                ? 1 / 12
                : period === "3M"
                  ? 3 / 12
                  : period === "6M"
                    ? 6 / 12
                    : period === "1Y"
                      ? 1
                      : period === "3Y"
                        ? 3
                        : period === "5Y"
                          ? 5
                          : 5;
          inflationFactor = Math.pow(1 + stratSettings.inflationRate / 100, years);
        }

        const realStockVal = fxStockVal / inflationFactor;
        const realReturnNet = realStockVal - fxInvested;
        const realReturnPct = fxInvested > 0 ? (realReturnNet / fxInvested) * 100 : 0;

        const inflationLossAmount = fxStockVal - realStockVal;
        const inflationLossPct = fxInvested > 0 ? (inflationLossAmount / fxInvested) * 100 : 0;

        return (
          <div
            className="fade-up"
            style={{
              marginTop: 12,
              marginBottom: 16,
              padding: "14px 20px",
              background: "rgba(0,0,0,0.25)",
              borderRadius: "var(--radius)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>📊 Comparativa de Rendimiento Multinivel (Nominal ➔ Divisa ➔ Real)</span>
              <span
                style={{
                  fontSize: "0.74rem",
                  color: "#f59e0b",
                  background: "rgba(245,158,11,0.1)",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                {stratSettings.useAutoColInflation
                  ? "IPC Automático (FRED/DANE)"
                  : `Inflación Manual ${stratSettings.inflationRate || 0}%/año`}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {/* Level 1: Nominal */}
              <div
                style={{
                  padding: 10,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase" }}>
                  1. Nominal ({stratSettings.assetCurrency || "USD"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: nomReturnUsd >= 0 ? "#4ade80" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {nomReturnUsd >= 0 ? "+" : ""}${nomReturnUsd.toFixed(2)} (
                  {nomReturnPct >= 0 ? "+" : ""}
                  {nomReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Crecimiento puro en moneda del activo
                </div>
              </div>

              {/* Level 2: FX Adjusted */}
              <div
                style={{
                  padding: 10,
                  background: "rgba(0, 229, 255, 0.03)",
                  borderRadius: 8,
                  border: "1px solid rgba(0, 229, 255, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#00e5ff", textTransform: "uppercase" }}>
                  2. Al Cambio Divisa ({stratSettings.localCurrency || "COP"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: fxReturnNet >= 0 ? "#4ade80" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)} (
                  {fxReturnPct >= 0 ? "+" : ""}
                  {fxReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Tipo de cambio: ${fxMult.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Level 3: Real Purchasing Power */}
              <div
                style={{
                  padding: 10,
                  background: "rgba(245, 158, 11, 0.03)",
                  borderRadius: 8,
                  border: "1px solid rgba(245, 158, 11, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#f59e0b", textTransform: "uppercase" }}>
                  3. Poder Adquisitivo Real
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: realReturnNet >= 0 ? "#f59e0b" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                  {realReturnPct >= 0 ? "+" : ""}
                  {realReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Factor Inflación: -{((inflationFactor - 1) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Explicit Deduction Equation Bar */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.06)",
                borderRadius: 8,
                border: "1px dashed rgba(245, 158, 11, 0.25)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.78rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: "#00e5ff", fontWeight: 700 }}>
                  Ganancia Bruta ({stratSettings.localCurrency || "COP"}):
                </span>
                <span
                  className="mono"
                  style={{ color: fxReturnNet >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}
                >
                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)}
                </span>
                <span style={{ color: "var(--text-muted)" }}>➖</span>
                <span style={{ color: "#f87171", fontWeight: 700 }}>
                  Descuento Inflación (IPC):
                </span>
                <span className="mono" style={{ color: "#f87171", fontWeight: 700 }}>
                  -${inflationLossAmount.toFixed(2)} ({inflationLossPct.toFixed(2)}%)
                </span>
                <span style={{ color: "var(--text-muted)" }}>🟰</span>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>Ganancia Real Neta:</span>
                <span
                  className="mono"
                  style={{ color: realReturnNet >= 0 ? "#f59e0b" : "#f87171", fontWeight: 800 }}
                >
                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                  {realReturnPct >= 0 ? "+" : ""}
                  {realReturnPct.toFixed(2)}% Real)
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Settings Modal ────────────────────────────── */}
      {showSettingsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            className="card fade-up"
            style={{
              width: "100%",
              maxWidth: 450,
              padding: 24,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <h3
              style={{
                margin: "0 0 20px 0",
                color: "#f1f5f9",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⚙️ Configuración: {strategy.name}
            </h3>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  Divisa del Activo
                </label>
                <select
                  value={stratSettings.assetCurrency || "USD"}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, assetCurrency: e.target.value }))
                  }
                  className="input"
                  style={{ width: "100%" }}
                >
                  <option value="USD">USD - Dólar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - Libra</option>
                  <option value="COP">COP - Peso Col.</option>
                  <option value="MXN">MXN - Peso Mex.</option>
                  <option value="CLP">CLP - Peso Chi.</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  Divisa Local
                </label>
                <select
                  value={stratSettings.localCurrency || "COP"}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, localCurrency: e.target.value }))
                  }
                  className="input"
                  style={{ width: "100%" }}
                >
                  <option value="COP">COP - Peso Col.</option>
                  <option value="MXN">MXN - Peso Mex.</option>
                  <option value="CLP">CLP - Peso Chi.</option>
                  <option value="USD">USD - Dólar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={stratSettings.useAutoColInflation || false}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, useAutoColInflation: e.target.checked }))
                  }
                />
                Usar Inflación Automática (Colombia, mensual)
              </label>

              {!stratSettings.useAutoColInflation && (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    Inflación Anual Manual (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={stratSettings.inflationRate || 0}
                    onChange={(e) =>
                      setStratSettings((prev) => ({
                        ...prev,
                        inflationRate: Number.parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="input"
                    style={{ width: "100%" }}
                  />
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="btn btn-primary"
                style={{ minWidth: 100 }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inflation Explorer Modal ──────────────────── */}
      <InflationExplorerModal
        isOpen={showInflationExplorer}
        onClose={() => setShowInflationExplorer(false)}
        inflationData={colInflationData}
      />

      <div className="card fade-up" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>📊 Crecimiento Histórico</h3>
          <div
            className="period-selector"
            style={{ margin: 0, padding: 0, background: "transparent" }}
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                className={`period-btn ${p === period ? "active" : ""}`}
                onClick={() => setPeriod(p)}
                disabled={!periodEnabled[p]}
                title={
                  periodEnabled[p]
                    ? undefined
                    : "Requiere más historial desde tu primera inversión"
                }
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  opacity: periodEnabled[p] ? 1 : 0.35,
                  cursor: periodEnabled[p] ? "pointer" : "not-allowed",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <StrategyChart
                  strategy={strategy}
                  activeInvested={activeInvested}
                  period={period}
                  firstInvestDate={firstInvestDate}
                />
      </div>

      {/* ── Constellation Grid Visualizer (Slots) ────── */}
      <div className="card fade-up" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🧩 Matriz de Asignación de {numSlots} Slots</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: `${strategy.color}26`,
                  color: strategy.color,
                  fontWeight: 700,
                }}
              >
                1 / {numSlots} = {weightPerSlot}% Equiponderado
              </span>
            </h3>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Cada posición ocupa exactamente 1 slot (${slotValue.toFixed(2)} / {weightPerSlot}%).
              Los slots vacíos se preservan en liquidez (Cash Q).
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: strategy.color }}>
            {activeTickers.length} Asignados · {numSlots - activeTickers.length} en Cash
          </div>
        </div>

        {/* N-Slots Box Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: "10px",
          }}
        >
          {Array.from({ length: numSlots }).map((_, i) => {
            const ticker = activeTickers[i];
            const isOccupied = !!ticker;
            return (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  border: isOccupied
                    ? `1px solid ${strategy.color}66`
                    : "1px dashed rgba(255, 255, 255, 0.1)",
                  background: isOccupied
                    ? `linear-gradient(135deg, ${strategy.color}20 0%, rgba(0,0,0,0.3) 100%)`
                    : "rgba(255, 255, 255, 0.02)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span
                    style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}
                  >
                    Slot {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: isOccupied ? `${strategy.color}40` : "rgba(255, 255, 255, 0.05)",
                      color: isOccupied ? strategy.color : "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    {isOccupied ? `${weightPerSlot}%` : "Cash Q"}
                  </span>
                </div>

                {isOccupied ? (
                  <>
                    <strong
                      className="mono"
                      style={{ fontSize: "1.05rem", color: strategy.color, lineHeight: 1.1 }}
                    >
                      {ticker}
                    </strong>
                    {tickerMetadata[ticker] && (
                      <div
                        style={{
                          fontSize: "0.62rem",
                          color: "#cbd5e1",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={tickerMetadata[ticker].name}
                      >
                        {tickerMetadata[ticker].name}
                      </div>
                    )}
                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
                      ${slotValue.toFixed(2)} asignados
                    </div>
                  </>
                ) : (
                  <>
                    <span
                      style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}
                    >
                      Disponible
                    </span>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      ${slotValue.toFixed(2)} en reserva
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Rebalance Manager Grid ────────────────────── */}
      <div className="bottom-grid">
        {/* Formulario para agregar rebalanceo con fecha específica */}
        <div className="card fade-up" style={{ padding: "20px" }}>
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: "1.05rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📅</span>
            <span>Registrar Nuevo Rebalanceo Fechado</span>
          </h3>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
            Define la fecha de entrada en vigor y la lista exacta de posiciones para {strategy.name}
            .
          </p>

          {/* Fecha del Rebalanceo */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Fecha del Rebalanceo / Compra:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.85rem",
              }}
            />
          </div>

          {/* Búsqueda y Adición Individual */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Buscar y agregar ticker ({formTickers.length}/{numSlots} slots):
            </label>
            <form onSubmit={handleSearchAndAdd} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Ej. AAPL NVDA MSFT..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.85rem",
                }}
              />
              <button type="submit" className="btn btn-ghost" disabled={searching}>
                {searching ? "Buscando…" : "+ Agregar"}
              </button>
            </form>
            {searchError && (
              <span
                style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 4, display: "block" }}
              >
                {searchError}
              </span>
            )}
          </div>

          {/* Pegar Grupo de Tickers en Bloque */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              O pegar grupo de tickers separados por espacio:
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="AAPL NVDA MSFT GOOGL AMZN..."
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.78rem",
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleBatchAdd}
                style={{ fontSize: "0.75rem" }}
              >
                Cargar Grupo
              </button>
            </div>
          </div>

          {/* Chips de Tickers en este Rebalanceo */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
                Posiciones asignadas ({formTickers.length}):
              </span>
              {formTickers.length > 0 && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    style={{
                      background: "#ef444422",
                      border: "1px solid #ef444455",
                      color: "#ef4444",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      opacity: selectedForDeletion.length > 0 ? 1 : 0,
                      pointerEvents: selectedForDeletion.length > 0 ? "auto" : "none",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    Borrar seleccionados ({Math.max(selectedForDeletion.length, 1)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTickers([]);
                      setSelectedForDeletion([]);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Limpiar todo
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                minHeight: 40,
                padding: 10,
                background: "rgba(0,0,0,0.2)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              {formTickers.length === 0 ? (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  No hay posiciones agregadas para esta fecha.
                </span>
              ) : (
                formTickers.map((t) => (
                  <span
                    key={t}
                    onClick={() => toggleForDeletion(t)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 16,
                      background: selectedForDeletion.includes(t)
                        ? "#ef444426"
                        : `${strategy.color}26`,
                      border: `1px solid ${selectedForDeletion.includes(t) ? "#ef444459" : `${strategy.color}59`}`,
                      color: selectedForDeletion.includes(t) ? "#ef4444" : strategy.color,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Clic para seleccionar/deseleccionar para borrar"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTicker(t);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "1rem",
                        lineHeight: 1,
                        padding: 0,
                        opacity: 0.7,
                      }}
                      title="Eliminar posición"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveRebalance}
            style={{ width: "100%", padding: "12px", fontSize: "0.85rem", fontWeight: 700 }}
          >
            💾 Guardar Rebalanceo ({date})
          </button>
        </div>

        {/* Historial de Rebalanceos Fechados */}
        <div className="card fade-up" style={{ padding: "20px" }}>
          <h3
            style={{
              margin: "0 0 14px 0",
              fontSize: "1.05rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📜</span>
            <span>Historial de Rebalanceos ({rebalances.length})</span>
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight: 520,
              overflowY: "auto",
            }}
          >
            {rebalances.map((reb, idx) => {
              const isCurrent = idx === rebalances.length - 1;
              return (
                <div
                  key={reb.rebalance_date}
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius)",
                    background: isCurrent ? `${strategy.color}10` : "var(--bg-surface)",
                    border: `1px solid ${isCurrent ? `${strategy.color}4D` : "var(--border)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className="mono"
                        style={{
                          fontWeight: 800,
                          fontSize: "0.9rem",
                          color: isCurrent ? strategy.color : "var(--text-primary)",
                        }}
                      >
                        {reb.rebalance_date}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: `${strategy.color}33`,
                            color: strategy.color,
                            fontWeight: 700,
                          }}
                        >
                          VIGENTE
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRebalance(reb.rebalance_date)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                      }}
                      title="Eliminar este evento"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>

                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    {reb.tickers?.length || 0} acciones asignadas ($
                    {(((reb.tickers?.length || 0) / numSlots) * simulatedCapital).toFixed(2)}{" "}
                    simulado)
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {reb.tickers?.map((t) => (
                      <span
                        key={t}
                        className="mono"
                        style={{
                          fontSize: "0.68rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#cbd5e1",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
