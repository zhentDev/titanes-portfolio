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
  createPurchaseSale,
  deleteCustomStrategyApi,
  deletePurchaseLot,
  deletePurchasePortfolioApi,
  deletePurchaseSale,
  fetchCustomStrategiesApi,
  fetchHistoricalPrice,
  fetchPurchasesData,
  fetchRebalances,
  saveCustomStrategyApi,
  syncPurchasesMigration,
  togglePortfolioPlanApi,
  updatePortfolioSettingsApi,
  updatePurchaseLots,
} from "../api/client";
import { getMarketOpenTime } from "../utils/marketHours";

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
          period: "3M",
          numSlots: 15,
        },
        live: {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "3M",
          numSlots: 15,
        },
        strat_mm20: {
          tickers: ["ARLP", "ACLS", "BHC", "DIOD", "HAE", "NSIT", "POWI", "VECO", "OSK", "SM"],
          investment: 1000,
          period: "1Y",
          numSlots: 20,
        },
      },
      mode: "historical", // 'historical' | 'live' | custom strategy ID
      period: "3M", // Shared top-level period for backward compatibility with StrategyChart and DynamicStrategyView
      visibleSeries: {
        nav: true,
        sp500: true,
        nasdaq: true,
        base: true,
        strat_mm20: true,
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
      purchaseSales: [],
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
            // Migrate local data to DuckDB
            await syncPurchasesMigration(localPorts, localLots);
            toast.success(
              "¡Tus compras fueron migradas a la base de datos de DuckDB exitosamente!",
            );
            const refetched = await fetchPurchasesData();
            set({
              purchasePortfolios: refetched.purchasePortfolios,
              individualPurchases: refetched.individualPurchases,
              purchaseSales: refetched.purchaseSales || [],
            });
          } else if (res.purchasePortfolios.length > 0) {
            set({
              purchasePortfolios: res.purchasePortfolios,
              individualPurchases: res.individualPurchases,
              purchaseSales: res.purchaseSales || [],
            });
          }
        } catch (err) {
          if (err.name === "AbortError" || (err.message && err.message.toLowerCase().includes("abort"))) {
            return;
          }
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
      addPurchaseSale: async (sale, updatedLot) => {
        try {
          await createPurchaseSale(sale);
          if (updatedLot) {
            if (updatedLot.shares <= 0) {
              await deletePurchaseLot(updatedLot.id);
              set((state) => ({
                purchaseSales: [sale, ...state.purchaseSales],
                individualPurchases: state.individualPurchases.filter((p) => p.id !== updatedLot.id),
              }));
            } else {
              await updatePurchaseLots([updatedLot]);
              set((state) => ({
                purchaseSales: [sale, ...state.purchaseSales],
                individualPurchases: state.individualPurchases.map((p) =>
                  p.id === updatedLot.id ? { ...p, ...updatedLot } : p,
                ),
              }));
            }
          } else {
            set((state) => ({
              purchaseSales: [sale, ...state.purchaseSales],
            }));
          }
          toast.success("¡Venta registrada exitosamente!");
        } catch (e) {
          console.error("Error al registrar venta:", e);
          toast.error("Error registrando la venta en BD");
        }
      },
      removePurchaseSale: async (id) => {
        try {
          await deletePurchaseSale(id);
          set((state) => ({
            purchaseSales: state.purchaseSales.filter((s) => s.id !== id),
          }));
          toast.success("Registro de venta eliminado");
        } catch (e) {
          console.error("Error al eliminar venta:", e);
          toast.error("Error eliminando la venta de BD");
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
            const timeToQuery = p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange);
            const res = await fetchHistoricalPrice(p.ticker, p.date, timeToQuery);
            if (res && res.price) {
              const newPrice = res.price;
              const invested = p.investedAmount ?? p.shares * p.purchasePrice;
              get().updateMultiplePurchases([
                {
                  ...p,
                  purchaseTime: timeToQuery,
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
          benchmark: "S&P MidCap 400",
          color: "#10b981",
          createdAt: "2026-08-01T00:00:00.000Z",
          isSystem: true,
          isRealMoney: false,
        },
        {
          id: "strat_1788304141581",
          name: "Mejores acciones - sept 2026",
          country: "🇺🇸",
          numSlots: 20,
          capital: 1010,
          activeInvested: 353.5,
          benchmark: "S&P 500",
          color: "#a855f7",
          createdAt: "2026-09-02T00:00:00.000Z",
          isSystem: false,
          isRealMoney: true,
        },
      ],
      strategyRebalances: {
        strat_mm20: [
          {
            date: "2026-08-01",
            rebalance_date: "2026-08-01",
            cash_added: 0,
            tickers: ["ARLP", "ACLS", "BHC", "DIOD", "HAE", "NSIT", "POWI", "VECO", "OSK", "SM"],
          },
        ],
        strat_1788304141581: [
          {
            date: "2026-09-02",
            rebalance_date: "2026-09-02",
            cash_added: 0,
            tickers: ["OSIS", "PAYC", "DK", "HALO"],
          },
          {
            date: "2026-09-03",
            rebalance_date: "2026-09-03",
            cash_added: 0,
            tickers: ["OSIS", "PAYC", "DK", "HALO", "MCK"],
          },
          {
            date: "2026-10-01",
            rebalance_date: "2026-10-01",
            cash_added: 0,
            tickers: ["OSIS", "PAYC", "MCK", "ENS", "AYI", "ANF", "CRM"],
          },
        ],
      },
      // ── Persistent Last-Known Market Quotes & Strategy/Portfolio Summaries ──
      lastKnownQuotes: {
        SPCX: { ticker: "SPCX", name: "Space Exploration Technologies Corp.", price: 147.79, change_pct: -0.6654 },
        SMH: { ticker: "SMH", name: "VanEck Semiconductor ETF", price: 546.36, change_pct: -0.4248 },
        NVDA: { ticker: "NVDA", name: "NVIDIA Corporation", price: 216.47, change_pct: -0.3269 },
        "SMH.L": { ticker: "SMH.L", name: "VanEck Semiconductor UCITS ETF", price: 101.08, change_pct: -1.9212 },
        "GDX.L": { ticker: "GDX.L", name: "VanEck Gold Miners UCITS ETF", price: 98.55, change_pct: 0.3258 },
        "IPLT.L": { ticker: "IPLT.L", name: "WisdomTree Physical Platinum", price: 23.5688, change_pct: 0.0161 },
        "CNDX.L": { ticker: "CNDX.L", name: "iShares NASDAQ 100 UCITS ETF", price: 1696.6, change_pct: -0.7836 },
        "CSPX.L": { ticker: "CSPX.L", name: "iShares Core S&P 500 UCITS ETF", price: 832.77, change_pct: -0.1008 },
        "CNYA.L": { ticker: "CNYA.L", name: "iShares MSCI China A UCITS ETF", price: 5.3975, change_pct: -0.3692 },
        "KWEB.L": { ticker: "KWEB.L", name: "KraneShares CSI China Internet ETF", price: 18.348, change_pct: -0.1469 },
        "3CP.F": { ticker: "3CP.F", name: "WisdomTree Physical Platinum (Xetra)", price: 3.02, change_pct: -1.3072 },
        "NNND.F": { ticker: "NNND.F", name: "iShares NASDAQ 100 UCITS ETF (Xetra)", price: 45.5, change_pct: -3.0987 },
        "EMIM.L": { ticker: "EMIM.L", name: "iShares Core MSCI Emerging Markets IMI ETF", price: 3897.0, change_pct: -1.0411 },
        "PAXG-USD": { ticker: "PAXG-USD", name: "PAX Gold (PAXG)", price: 4116.6699, change_pct: -0.0172 },
      },
      lastStrategySummaries: {
        historical: {
          summary: {
            start_value: 2000,
            end_value: 1946.06,
            invested_value: 2000,
            active_invested: 1066.67,
            active_stock_value: 1012.73,
            active_return: -53.94,
            active_return_pct: -5.06,
            total_realized_pnl: 23.42,
            unrealized_pnl: -53.94,
            total_strategy_pnl: -30.52,
            total_strategy_return_pct: -2.86,
            closed_count: 1,
            num_holdings: 8,
            num_slots: 15,
          },
          closed_holdings: [
            {
              ticker: "NTAP",
              name: "NetApp, Inc.",
              sector: "Almacenamiento Híbrido & Nube",
              exchange: "NASDAQ",
              shares: 0.73056,
              entry_date: "2026-08-03",
              entry_price: 182.5083,
              exit_date: "2026-10-01",
              exit_price: 214.566,
              cost_basis: 133.33,
              exit_value: 156.75,
              realized_pnl: 23.42,
              realized_return_pct: 17.57,
              holding_days: 59,
            },
          ],
          updatedAt: "2026-10-21T06:00:00.000Z",
        },
        strat_1788304141581: {
          summary: {
            start_value: 1010,
            end_value: 1026.21,
            invested_value: 1010,
            active_invested: 353.5,
            active_stock_value: 369.71,
            active_return: 16.21,
            active_return_pct: 4.59,
            total_realized_pnl: 0.79,
            unrealized_pnl: 16.21,
            total_strategy_pnl: 17.0,
            total_strategy_return_pct: 4.81,
            closed_count: 2,
            num_holdings: 7,
            num_slots: 20,
          },
          closed_holdings: [
            {
              ticker: "DK",
              name: "Delek US Holdings, Inc.",
              sector: "Energy",
              exchange: "NYQ",
              shares: 0.706788,
              entry_date: "2026-09-02",
              entry_price: 71.45,
              exit_date: "2026-10-01",
              exit_price: 74.34,
              cost_basis: 50.5,
              exit_value: 52.54,
              realized_pnl: 2.04,
              realized_return_pct: 4.04,
              holding_days: 29,
            },
            {
              ticker: "HALO",
              name: "Halozyme Therapeutics, Inc.",
              sector: "Healthcare",
              exchange: "NMS",
              shares: 0.460514,
              entry_date: "2026-09-02",
              entry_price: 109.66,
              exit_date: "2026-10-01",
              exit_price: 106.94,
              cost_basis: 50.5,
              exit_value: 49.25,
              realized_pnl: -1.25,
              realized_return_pct: -2.48,
              holding_days: 29,
            },
          ],
          updatedAt: "2026-10-21T06:00:00.000Z",
        },
      },
      lastPortfolioSummaries: {},
      saveLastKnownQuotes: (quotesMapOrArray) => {
        if (!quotesMapOrArray) return;
        set((state) => {
          const next = { ...(state.lastKnownQuotes || {}) };
          if (Array.isArray(quotesMapOrArray)) {
            quotesMapOrArray.forEach((q) => {
              if (q?.ticker && q?.price != null) {
                next[q.ticker] = { ...next[q.ticker], ...q, updatedAt: new Date().toISOString() };
              }
            });
          } else if (typeof quotesMapOrArray === "object") {
            Object.entries(quotesMapOrArray).forEach(([k, q]) => {
              if (q && q.price != null) {
                next[k] = { ...next[k], ...q, ticker: k, updatedAt: new Date().toISOString() };
              }
            });
          }
          return { lastKnownQuotes: next };
        });
      },
      saveStrategySummary: (strategyId, navData) => {
        if (!strategyId || !navData?.summary) return;
        set((state) => ({
          lastStrategySummaries: {
            ...(state.lastStrategySummaries || {}),
            [strategyId]: {
              summary: navData.summary,
              closed_holdings: navData.closed_holdings || state.lastStrategySummaries?.[strategyId]?.closed_holdings || [],
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },
      savePortfolioSummary: (portfolioId, summaryData) => {
        if (!portfolioId || !summaryData) return;
        set((state) => ({
          lastPortfolioSummaries: {
            ...(state.lastPortfolioSummaries || {}),
            [portfolioId]: {
              ...summaryData,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

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
              const allStrats = mergedStrats;
              return {
                customStrategies: mergedStrats,
                settingsByMode: updatedSettings,
              };
            });

            // Pre-fetch rebalances for all custom strategies asynchronously to populate active tickers
            const strats = get().customStrategies;
            strats.forEach(async (st) => {
              try {
                const rebs = await fetchRebalances(st.id);
                if (Array.isArray(rebs) && rebs.length > 0) {
                  get().setStrategyRebalances(st.id, rebs);
                }
              } catch (err) {
                console.warn(`Could not pre-fetch rebalances for ${st.id}`, err);
              }
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

      setMultipleSeries: (updates) =>
        set((s) => ({
          visibleSeries: {
            ...s.visibleSeries,
            ...updates,
          },
        })),

      addCustomStrategy: async ({
        name,
        country,
        numSlots,
        capital,
        benchmark,
        color,
        isRealMoney = false,
      }) => {
        const newStrat = {
          id: `strat_${Date.now()}`,
          name: name.trim() || "Nueva Estrategia",
          country: country || "🌎",
          numSlots: Number(numSlots) || 20,
          capital: Number(capital) || 1000,
          activeInvested: Number(capital) || 1000,
          benchmark: benchmark || "S&P 500",
          color: color || "#a855f7",
          isRealMoney: Boolean(isRealMoney),
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
          visibleSeries: { nav: true, sp500: true, nasdaq: true, base: true },
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
        purchaseSales: s.purchaseSales,
        customStrategies: s.customStrategies,
        strategyRebalances: s.strategyRebalances,
        lastKnownQuotes: s.lastKnownQuotes,
        lastStrategySummaries: s.lastStrategySummaries,
        lastPortfolioSummaries: s.lastPortfolioSummaries,
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        merged.lastKnownQuotes = {
          ...(currentState.lastKnownQuotes || {}),
          ...(persistedState?.lastKnownQuotes || {}),
        };
        merged.lastStrategySummaries = {
          ...(currentState.lastStrategySummaries || {}),
          ...(persistedState?.lastStrategySummaries || {}),
        };
        merged.lastPortfolioSummaries = {
          ...(currentState.lastPortfolioSummaries || {}),
          ...(persistedState?.lastPortfolioSummaries || {}),
        };
        if (!merged.settingsByMode) {
          merged.settingsByMode = currentState.settingsByMode;
        } else {
          merged.settingsByMode.historical =
            merged.settingsByMode.historical || currentState.settingsByMode.historical;
          merged.settingsByMode.live =
            merged.settingsByMode.live || currentState.settingsByMode.live;
        }
        if (!merged.customStrategies) {
          merged.customStrategies = [];
        }
        if (!merged.customStrategies.find((s) => s.id === "strat_mm20")) {
          const sysStrat = currentState.customStrategies.find((s) => s.id === "strat_mm20") || {
            id: "strat_mm20",
            name: "MM20 Mid-caps PRO",
            country: "🇺🇸",
            numSlots: 20,
            capital: 1000,
            activeInvested: 250,
            benchmark: "S&P MidCap 400",
            color: "#10b981",
            createdAt: "2026-08-01T00:00:00.000Z",
            isSystem: true,
            isRealMoney: false,
          };
          merged.customStrategies = [sysStrat, ...merged.customStrategies];
        }
        if (!merged.customStrategies.find((s) => s.id === "strat_1788304141581")) {
          const realStrat = currentState.customStrategies.find((s) => s.id === "strat_1788304141581");
          if (realStrat) {
            merged.customStrategies = [...merged.customStrategies, realStrat];
          }
        }
        if (!merged.strategyRebalances?.strat_mm20 || merged.strategyRebalances.strat_mm20.length === 0) {
          merged.strategyRebalances = {
            ...merged.strategyRebalances,
            strat_mm20: [
              {
                date: "2026-08-01",
                rebalance_date: "2026-08-01",
                cash_added: 0,
                tickers: ["ARLP", "ACLS", "BHC", "DIOD", "HAE", "NSIT", "POWI", "VECO", "OSK", "SM"],
              },
            ],
          };
        }
        if (!merged.strategyRebalances?.strat_1788304141581 || merged.strategyRebalances.strat_1788304141581.length === 0) {
          merged.strategyRebalances = {
            ...merged.strategyRebalances,
            strat_1788304141581: currentState.strategyRebalances.strat_1788304141581,
          };
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
