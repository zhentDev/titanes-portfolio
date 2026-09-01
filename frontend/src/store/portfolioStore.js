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
  deleteCustomStrategyApi,
  deletePurchaseLot,
  deletePurchasePortfolioApi,
  fetchCustomStrategiesApi,
  fetchHistoricalPrice,
  fetchPurchasesData,
  saveCustomStrategyApi,
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
          activeInvested: 250,
          benchmark: "S&P 500",
          color: "#10b981",
          createdAt: new Date().toISOString(),
          isSystem: true,
        },
      ],
      strategyRebalances: {},

      initFetchCustomStrategies: async () => {
        try {
          const backendStrats = await fetchCustomStrategiesApi();
          if (Array.isArray(backendStrats) && backendStrats.length > 0) {
            set((state) => {
              const sysStrat = state.customStrategies.find((s) => s.id === "strat_mm20");
              const existingMap = new Map(state.customStrategies.map((s) => [s.id, s]));
              backendStrats.forEach((bs) => {
                existingMap.set(bs.id, { ...existingMap.get(bs.id), ...bs });
              });
              if (sysStrat && !existingMap.has("strat_mm20")) {
                existingMap.set("strat_mm20", sysStrat);
              }
              const mergedStrats = Array.from(existingMap.values());
              const updatedSettings = { ...state.settingsByMode };
              mergedStrats.forEach((st) => {
                if (!updatedSettings[st.id]) {
                  updatedSettings[st.id] = {
                    tickers: [],
                    investment: st.capital || 1000,
                    period: "1Y",
                    numSlots: st.numSlots || 20,
                  };
                }
              });
              return {
                customStrategies: mergedStrats,
                settingsByMode: updatedSettings,
              };
            });
          }
        } catch (e) {
          console.error("Error fetching custom strategies from backend:", e);
        }
      },

      // ── Actions ──────────────────────────────────────
      addTicker: (ticker) => {
        const upper = ticker.toUpperCase();
        const mode = get().mode in get().settingsByMode ? get().mode : "historical";
        const currentModeSettings = get().settingsByMode[mode] || {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        };
        if (!currentModeSettings.tickers.includes(upper)) {
          set((s) => ({
            settingsByMode: {
              ...s.settingsByMode,
              [mode]: {
                ...currentModeSettings,
                tickers: [...currentModeSettings.tickers, upper],
              },
            },
          }));
        }
      },

      removeTicker: (ticker) => {
        const mode = get().mode in get().settingsByMode ? get().mode : "historical";
        const currentModeSettings = get().settingsByMode[mode] || {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        };
        set((s) => ({
          settingsByMode: {
            ...s.settingsByMode,
            [mode]: {
              ...currentModeSettings,
              tickers: currentModeSettings.tickers.filter((t) => t !== ticker),
            },
          },
        }));
      },

      setInvestment: (amount) =>
        set((state) => {
          const mode = state.mode in state.settingsByMode ? state.mode : "historical";
          const currentModeSettings = state.settingsByMode[mode] || {
            tickers: DEFAULT_TICKERS,
            investment: 2000,
            period: "1Y",
            numSlots: 15,
          };
          return {
            settingsByMode: {
              ...state.settingsByMode,
              [mode]: { ...currentModeSettings, investment: Number(amount) },
            },
          };
        }),

      setPeriod: (period) =>
        set((state) => {
          const mode = state.mode in state.settingsByMode ? state.mode : "historical";
          const currentModeSettings = state.settingsByMode[mode] || {
            tickers: DEFAULT_TICKERS,
            investment: 2000,
            period: "1Y",
            numSlots: 15,
          };
          return {
            period,
            settingsByMode: {
              ...state.settingsByMode,
              [mode]: { ...currentModeSettings, period },
            },
          };
        }),

      setMode: (mode) =>
        set((state) => {
          const targetMode = mode in state.settingsByMode ? mode : "historical";
          const currentPeriod = state.settingsByMode[targetMode]?.period || "1Y";
          return { mode, period: currentPeriod };
        }),

      toggleSeries: (key) =>
        set((s) => ({
          visibleSeries: {
            ...s.visibleSeries,
            [key]: !s.visibleSeries[key],
          },
        })),

      addCustomStrategy: async ({ name, country, numSlots, capital, benchmark, color }) => {
        const newStrat = {
          id: `strat_${Date.now()}`,
          name: name.trim() || "Nueva Estrategia",
          country: country || "🌎",
          numSlots: Number(numSlots) || 20,
          capital: Number(capital) || 1000,
          activeInvested: Number(capital) || 1000,
          benchmark: benchmark || "S&P 500",
          color: color || "#a855f7",
          createdAt: new Date().toISOString(),
          isSystem: false,
        };
        set((s) => ({
          customStrategies: [...s.customStrategies, newStrat],
          settingsByMode: {
            ...s.settingsByMode,
            [newStrat.id]: {
              tickers: [],
              investment: Number(capital) || 1000,
              period: "1Y",
              numSlots: Number(numSlots) || 20,
            },
          },
          visibleSeries: { ...s.visibleSeries, [newStrat.id]: true },
          mode: newStrat.id,
        }));
        await saveCustomStrategyApi(newStrat);
        return newStrat;
      },

      updateCustomStrategy: async (id, updates) => {
        let updatedStrat = null;
        set((s) => {
          const nextStrats = s.customStrategies.map((str) => {
            if (str.id === id) {
              updatedStrat = { ...str, ...updates };
              return updatedStrat;
            }
            return str;
          });
          const nextSettings = { ...s.settingsByMode };
          if (nextSettings[id]) {
            nextSettings[id] = {
              ...nextSettings[id],
              numSlots:
                updates.numSlots !== undefined ? Number(updates.numSlots) : nextSettings[id].numSlots,
              investment:
                updates.capital !== undefined ? Number(updates.capital) : nextSettings[id].investment,
            };
          }
          return {
            customStrategies: nextStrats,
            settingsByMode: nextSettings,
          };
        });
        if (updatedStrat) {
          await saveCustomStrategyApi(updatedStrat);
        }
      },

      deleteCustomStrategy: async (id) => {
        const strat = get().customStrategies.find((s) => s.id === id);
        if (!strat || strat.isSystem) return;
        set((s) => {
          const nextSeries = { ...s.visibleSeries };
          delete nextSeries[id];
          const nextSettings = { ...s.settingsByMode };
          delete nextSettings[id];
          const nextRebal = { ...s.strategyRebalances };
          delete nextRebal[id];
          return {
            customStrategies: s.customStrategies.filter((str) => str.id !== id),
            settingsByMode: nextSettings,
            strategyRebalances: nextRebal,
            visibleSeries: nextSeries,
            mode: s.mode === id ? "historical" : s.mode,
          };
        });
        await deleteCustomStrategyApi(id);
      },

      setStrategyRebalances: (strategyId, rebalances) => {
        const latestTickers =
          rebalances.length > 0 ? rebalances[rebalances.length - 1].tickers || [] : [];
        set((s) => ({
          strategyRebalances: {
            ...s.strategyRebalances,
            [strategyId]: rebalances,
          },
          settingsByMode: {
            ...s.settingsByMode,
            [strategyId]: {
              ...(s.settingsByMode[strategyId] || { investment: 1000, period: "1Y", numSlots: 20 }),
              tickers: latestTickers,
            },
          },
        }));
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
      partialize: (s) => ({
        settingsByMode: s.settingsByMode,
        mode: s.mode,
        period: s.period,
        visibleSeries: s.visibleSeries,
        mainPortfolioSettings: s.mainPortfolioSettings,
        purchasePortfolios: s.purchasePortfolios,
        individualPurchases: s.individualPurchases,
        customStrategies: s.customStrategies,
        strategyRebalances: s.strategyRebalances,
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        if (!merged.settingsByMode) {
          merged.settingsByMode = currentState.settingsByMode;
        } else {
          merged.settingsByMode.historical =
            merged.settingsByMode.historical || currentState.settingsByMode.historical;
          merged.settingsByMode.live =
            merged.settingsByMode.live || currentState.settingsByMode.live;
        }
        if (
          !merged.customStrategies ||
          !merged.customStrategies.find((s) => s.id === "strat_mm20")
        ) {
          const sysStrat = currentState.customStrategies.find((s) => s.id === "strat_mm20");
          merged.customStrategies = [...(merged.customStrategies || []), sysStrat].filter(Boolean);
        }
        (merged.customStrategies || []).forEach((st) => {
          if (!merged.settingsByMode[st.id]) {
            merged.settingsByMode[st.id] = {
              tickers: [],
              investment: st.capital || 1000,
              period: "1Y",
              numSlots: st.numSlots || 20,
            };
          }
        });
        merged.batchUpdateStatus = {};
        return merged;
      },
    },
  ),
);
