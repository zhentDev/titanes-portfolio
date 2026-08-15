import toast from "react-hot-toast";
/**
 * Zustand store — portfolio state.
 * Persists to localStorage so the user's ticker list and chart settings survive page refreshes and tab switches.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createPurchaseLot,
  createPurchasePortfolio,
  deletePurchaseLot,
  deletePurchasePortfolioApi,
  fetchHistoricalPrice,
  fetchPurchasesData,
  syncPurchasesMigration,
  togglePortfolioPlanApi,
  updatePortfolioSettingsApi,
  updatePurchaseLots,
} from "../api/client";

const DEFAULT_TICKERS = [
  "AMD",
  "AMAT",
  "HPQ",
  "INTC",
  "ON",
  "ORCL",
  "POWI",
  "QCOM",
  "TXN",
  "MRVL",
  "HIMX",
  "NTAP",
  "KD",
  "ARM",
];

export const usePortfolioStore = create(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────
      settingsByMode: {
        historical: {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        },
        live: {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        },
      },
      mode: "historical", // 'historical' | 'live' | custom strategy ID
      period: "1Y", // Shared top-level period for backward compatibility with StrategyChart and DynamicStrategyView
      visibleSeries: {
        nav: true,
        sp500: true,
        nasdaq: true,
        base: true,
        strat_mm20: true, // Auto-show the default system strategy
      },
      // ── Main Mode Settings (Divisa e Inflación) ──
      mainPortfolioSettings: {
        assetCurrency: "USD",
        localCurrency: "COP",
        inflationRate: 0,
        useAutoColInflation: false,
      },
      setMainPortfolioSettings: (newSettings) =>
        set((state) => ({
          mainPortfolioSettings: { ...state.mainPortfolioSettings, ...newSettings },
        })),
      // ── HISTORICAL INDIVIDUAL PURCHASES ──
      purchasePortfolios: [{ id: "hist_default", name: "Compras Principales" }],
      individualPurchases: [],
      initFetchPurchases: async () => {
        try {
          const res = await fetchPurchasesData();
          const localPorts = get().purchasePortfolios;
          const localLots = get().individualPurchases;

          const hasLocalData =
            localPorts.length > 1 ||
            (localPorts.length === 1 && localPorts[0].id !== "hist_default") ||
            localLots.length > 0;
          const backendEmpty =
            res.purchasePortfolios.length === 0 && res.individualPurchases.length === 0;

          if (backendEmpty && hasLocalData) {
            // 🚨 MIGRATE LOCAL DATA TO DUCKDB 🚨
            console.log("Migrando datos locales a DuckDB...");
            await syncPurchasesMigration(localPorts, localLots);
            toast.success(
              "¡Tus compras fueron migradas a la base de datos de DuckDB exitosamente!",
            );
            const refetched = await fetchPurchasesData();
            set({
              purchasePortfolios: refetched.purchasePortfolios,
              individualPurchases: refetched.individualPurchases,
            });
          } else if (res.purchasePortfolios.length > 0) {
            set({
              purchasePortfolios: res.purchasePortfolios,
              individualPurchases: res.individualPurchases,
            });
          }
        } catch (err) {
          console.error("Error fetching purchases from backend:", err);
        }
      },
      addPurchase: async (purchase) => {
        try {
          await createPurchaseLot(purchase);
          set((state) => ({ individualPurchases: [...state.individualPurchases, purchase] }));
        } catch (e) {
          toast.error("Error guardando la compra en BD");
        }
      },
      removePurchase: async (id) => {
        try {
          await deletePurchaseLot(id);
          set((state) => ({
            individualPurchases: state.individualPurchases.filter((p) => p.id !== id),
          }));
        } catch (e) {
          toast.error("Error eliminando la compra de BD");
        }
      },
      updatePurchase: async (updated) => {
        try {
          await updatePurchaseLots([updated]);
          set((state) => ({
            individualPurchases: state.individualPurchases.map((p) =>
              p.id === updated.id ? { ...p, ...updated } : p,
            ),
          }));
        } catch (e) {
          toast.error("Error actualizando la compra en BD");
        }
      },
      updateMultiplePurchases: async (updates) => {
        try {
          await updatePurchaseLots(updates);
          set((state) => {
            const updateMap = new Map(updates.map((u) => [u.id, u]));
            return {
              individualPurchases: state.individualPurchases.map((p) =>
                updateMap.has(p.id) ? { ...p, ...updateMap.get(p.id) } : p,
              ),
            };
          });
        } catch (e) {
          toast.error("Error actualizando múltiples compras en BD");
        }
      },
      addPurchasePortfolio: async (name) => {
        const newPort = {
          id: `hist_${Date.now()}`,
          name: name.trim() || "Nuevo Histórico",
        };
        try {
          await createPurchasePortfolio(newPort.id, newPort.name);
          set((state) => ({
            purchasePortfolios: [...state.purchasePortfolios, newPort],
            mode: newPort.id,
          }));
          return newPort;
        } catch (e) {
          toast.error("Error creando portafolio en BD");
        }
      },
      deletePurchasePortfolio: async (id) => {
        try {
          await deletePurchasePortfolioApi(id);
          set((state) => ({
            purchasePortfolios: state.purchasePortfolios.filter((p) => p.id !== id),
            individualPurchases: state.individualPurchases.filter((p) => p.portfolioId !== id),
            mode: state.mode === id ? "historical" : state.mode,
          }));
        } catch (e) {
          toast.error("Error eliminando portafolio de BD");
        }
      },
      togglePortfolioPlan: async (id, isPlan, planConfig = null) => {
        try {
          await togglePortfolioPlanApi(id, isPlan, planConfig);
          set((state) => ({
            purchasePortfolios: state.purchasePortfolios.map((p) =>
              p.id === id ? { ...p, isPlan, planConfig } : p,
            ),
          }));
          if (isPlan) {
            toast.success("El histórico ha sido marcado como Plan de Inversión", { icon: "🤖" });
          } else {
            toast.success("El Plan de Inversión ha sido desactivado");
          }
        } catch (e) {
          toast.error("Error actualizando estado del plan en BD");
        }
      },
      updatePortfolioSettings: async (
        id,
        assetCurrency,
        localCurrency,
        inflationRate,
        useAutoColInflation,
      ) => {
        try {
          await updatePortfolioSettingsApi(
            id,
            assetCurrency,
            localCurrency,
            inflationRate,
            useAutoColInflation,
          );
          set((state) => ({
            purchasePortfolios: state.purchasePortfolios.map((p) =>
              p.id === id
                ? { ...p, assetCurrency, localCurrency, inflationRate, useAutoColInflation }
                : p,
            ),
          }));
          toast.success("Configuración del portafolio actualizada");
        } catch (e) {
          toast.error("Error actualizando configuración del portafolio");
        }
      },
      // ── BATCH RECALCULATE STATE ──
      batchUpdateStatus: {}, // { [portfolioId]: { isUpdating: true, abort: false, progress: { current: 0, total: 0 } } }
      setAbortBatch: (portfolioId) =>
        set((state) => ({
          batchUpdateStatus: {
            ...state.batchUpdateStatus,
            [portfolioId]: { ...state.batchUpdateStatus[portfolioId], abort: true },
          },
        })),
      runBatchRecalculate: async (portfolioId, purchases) => {
        set((state) => ({
          batchUpdateStatus: {
            ...state.batchUpdateStatus,
            [portfolioId]: {
              isUpdating: true,
              abort: false,
              progress: { current: 0, total: purchases.length },
            },
          },
        }));
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < purchases.length; i++) {
          if (get().batchUpdateStatus[portfolioId]?.abort) {
            toast(`Recálculo detenido manualmente para ${portfolioId}.`, {
              icon: "🛑",
              duration: 4000,
            });
            break;
          }
          const p = purchases[i];
          set((state) => ({
            batchUpdateStatus: {
              ...state.batchUpdateStatus,
              [portfolioId]: {
                ...state.batchUpdateStatus[portfolioId],
                progress: { current: i + 1, total: purchases.length },
              },
            },
          }));
          try {
            const res = await fetchHistoricalPrice(p.ticker, p.date);
            if (res && res.price) {
              const newPrice = res.price;
              const invested = p.investedAmount ?? p.shares * p.purchasePrice;
              get().updateMultiplePurchases([
                {
                  ...p,
                  purchasePrice: newPrice,
                  shares: invested / newPrice,
                  manualCurrentPrice: null,
                },
              ]);
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            failCount++;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        if (get().batchUpdateStatus[portfolioId]?.abort) {
          // Handled
        } else if (failCount > 0) {
          toast(`Recálculo terminado: ${successCount} OK, ${failCount} fallidos.`, {
            icon: "⚠️",
            duration: 5000,
          });
        } else {
          toast.success(`Recálculo terminado: ${successCount} actualizados correctamente.`, {
            duration: 4000,
          });
        }
        set((state) => {
          const newStatus = { ...state.batchUpdateStatus };
          delete newStatus[portfolioId];
          return { batchUpdateStatus: newStatus };
        });
      },

      customStrategies: [
        {
          id: "strat_mm20",
          name: "MM20 Mid-caps PRO",
          country: "🇺🇸",
          numSlots: 20,
          capital: 1000,
          activeInvested: 250, // Replaces mm20ActiveInvested
          benchmark: "S&P 500",
          color: "#10b981", // Replaces hardcoded COLORS.mm20
          createdAt: new Date().toISOString(),
          isSystem: true, // Cannot be deleted
        },
      ], // User-created dynamic strategies

      // ── Actions ──────────────────────────────────────
      addTicker: (ticker) => {
        const upper = ticker.toUpperCase();
        const mode = get().mode in get().settingsByMode ? get().mode : "historical";
        if (!get().settingsByMode[mode].tickers.includes(upper)) {
          set((s) => ({
            settingsByMode: {
              ...s.settingsByMode,
              [mode]: {
                ...s.settingsByMode[mode],
                tickers: [...s.settingsByMode[mode].tickers, upper],
              },
            },
          }));
        }
      },

      removeTicker: (ticker) => {
        const mode = get().mode in get().settingsByMode ? get().mode : "historical";
        set((s) => ({
          settingsByMode: {
            ...s.settingsByMode,
            [mode]: {
              ...s.settingsByMode[mode],
              tickers: s.settingsByMode[mode].tickers.filter((t) => t !== ticker),
            },
          },
        }));
      },

      setInvestment: (amount) =>
        set((state) => {
          const mode = state.mode in state.settingsByMode ? state.mode : "historical";
          return {
            settingsByMode: {
              ...state.settingsByMode,
              [mode]: { ...state.settingsByMode[mode], investment: Number(amount) },
            },
          };
        }),

      setPeriod: (period) =>
        set((state) => {
          const mode = state.mode in state.settingsByMode ? state.mode : "historical";
          return {
            period,
            settingsByMode: {
              ...state.settingsByMode,
              [mode]: { ...state.settingsByMode[mode], period },
            },
          };
        }),

      setMode: (mode) =>
        set((state) => {
          const targetMode = mode in state.settingsByMode ? mode : "historical";
          const currentPeriod = state.settingsByMode[targetMode].period;
          return { mode, period: currentPeriod };
        }),

      toggleSeries: (key) =>
        set((s) => ({
          visibleSeries: {
            ...s.visibleSeries,
            [key]: !s.visibleSeries[key],
          },
        })),

      addCustomStrategy: ({ name, country, numSlots, capital, benchmark, color }) => {
        const newStrat = {
          id: `strat_${Date.now()}`,
          name: name.trim() || "Nueva Estrategia",
          country: country || "🌎",
          numSlots: Number(numSlots) || 15,
          capital: Number(capital) || 1000,
          activeInvested: Number(capital) || 1000, // Starts fully invested or equivalent
          benchmark: benchmark || "S&P 500",
          color: color || "#a855f7", // Default to purple if no color provided
          createdAt: new Date().toISOString(),
          isSystem: false, // User created -> CAN be deleted
        };
        set((s) => ({
          customStrategies: [...s.customStrategies, newStrat],
          visibleSeries: { ...s.visibleSeries, [newStrat.id]: true }, // Show in NavChart by default
          mode: newStrat.id, // Immediately switch to new strategy window
        }));
        return newStrat;
      },

      deleteCustomStrategy: (id) => {
        const strat = get().customStrategies.find((s) => s.id === id);
        if (!strat || strat.isSystem) return; // Prevent deleting system strategies
        set((s) => {
          const nextSeries = { ...s.visibleSeries };
          delete nextSeries[id];
          return {
            customStrategies: s.customStrategies.filter((str) => str.id !== id),
            visibleSeries: nextSeries,
            mode: s.mode === id ? "historical" : s.mode, // Return to Titanes if active
          };
        });
      },

      updateStrategyCapital: (id, capital, activeInvested) => {
        set((s) => ({
          customStrategies: s.customStrategies.map((str) =>
            str.id === id
              ? { ...str, capital: Number(capital), activeInvested: Number(activeInvested) }
              : str,
          ),
        }));
      },

      resetToDefaults: () =>
        set({
          settingsByMode: {
            historical: {
              tickers: DEFAULT_TICKERS,
              investment: 2000,
              period: "1Y",
              numSlots: 15,
            },
            live: {
              tickers: DEFAULT_TICKERS,
              investment: 2000,
              period: "1Y",
              numSlots: 15,
            },
          },
          visibleSeries: { nav: true, sp500: true, nasdaq: true, base: true, strat_mm20: true },
        }),
      getSettingsForMode: (mode) => {
        const state = get();
        return state.settingsByMode[mode] || state.settingsByMode.historical;
      },
    }),
    {
      name: "titanes-portfolio",
      partialState: (s) => ({
        tickers: s.tickers,
        investment: s.investment,
        period: s.period,
        numSlots: s.numSlots,
        mode: s.mode,
        visibleSeries: s.visibleSeries,
        customStrategies: s.customStrategies,
        customStrategies: s.customStrategies,
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        if (!merged.settingsByMode) {
          const legacyTickers = persistedState.tickers || currentState.tickers;
          const legacyInvestment = persistedState.investment ?? currentState.investment;
          const legacyPeriod = persistedState.period || currentState.period;
          const legacyNumSlots = persistedState.numSlots ?? currentState.numSlots;
          merged.settingsByMode = {
            historical: {
              tickers: legacyTickers,
              investment: legacyInvestment,
              period: legacyPeriod,
              numSlots: legacyNumSlots,
            },
            live: {
              tickers: legacyTickers,
              investment: legacyInvestment,
              period: legacyPeriod,
              numSlots: legacyNumSlots,
            },
          };
        }
        // Ensure system strategies (like MM20) are never lost due to old cached state
        if (
          !merged.customStrategies ||
          !merged.customStrategies.find((s) => s.id === "strat_mm20")
        ) {
          const sysStrat = currentState.customStrategies.find((s) => s.id === "strat_mm20");
          merged.customStrategies = [...(merged.customStrategies || []), sysStrat].filter(Boolean);
        }
        // Reset transient state
        merged.isBatchUpdating = false;
        merged.abortBatch = false;
        merged.batchProgress = { current: 0, total: 0 };
        return merged;
      },
    },
  ),
);
