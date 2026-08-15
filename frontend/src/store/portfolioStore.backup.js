import toast from "react-hot-toast";
/**
 * Zustand store — portfolio state.
 * Persists to localStorage so the user's ticker list and chart settings survive page refreshes and tab switches.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fetchHistoricalPrice } from "../api/client";

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
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      period: "1Y",
      numSlots: 15, // fixed denominator — weight = 1/15 per ticker
      mode: "historical", // 'historical' | 'live' | custom strategy ID
      visibleSeries: {
        nav: true,
        sp500: true,
        nasdaq: true,
        base: true,
        strat_mm20: true, // Auto-show the default system strategy
      },
      // ── HISTORICAL INDIVIDUAL PURCHASES ──
      purchasePortfolios: [{ id: "hist_default", name: "Compras Principales" }],
      individualPurchases: [],
      addPurchase: (purchase) =>
        set((state) => ({
          individualPurchases: [...state.individualPurchases, purchase],
        })),
      removePurchase: (id) =>
        set((state) => ({
          individualPurchases: state.individualPurchases.filter((p) => p.id !== id),
        })),
      updatePurchase: (updated) =>
        set((state) => ({
          individualPurchases: state.individualPurchases.map((p) =>
            p.id === updated.id ? { ...p, ...updated } : p,
          ),
        })),
      updateMultiplePurchases: (updates) =>
        set((state) => {
          const updateMap = new Map(updates.map((u) => [u.id, u]));
          return {
            individualPurchases: state.individualPurchases.map((p) =>
              updateMap.has(p.id) ? { ...p, ...updateMap.get(p.id) } : p,
            ),
          };
        }),
      addPurchasePortfolio: (name) => {
        const newPort = {
          id: `hist_${Date.now()}`,
          name: name.trim() || "Nuevo Histórico",
        };
        set((state) => ({
          purchasePortfolios: [...state.purchasePortfolios, newPort],
          mode: newPort.id,
        }));
        return newPort;
      },
      deletePurchasePortfolio: (id) => {
        set((state) => ({
          purchasePortfolios: state.purchasePortfolios.filter((p) => p.id !== id),
          individualPurchases: state.individualPurchases.filter((p) => p.portfolioId !== id),
          mode: state.mode === id ? "historical" : state.mode,
        }));
      },

      // ── BATCH RECALCULATE STATE ──
      isBatchUpdating: false,
      batchProgress: { current: 0, total: 0 },
      abortBatch: false,
      setAbortBatch: () => set({ abortBatch: true }),
      runBatchRecalculate: async (purchases) => {
        set({
          isBatchUpdating: true,
          abortBatch: false,
          batchProgress: { current: 0, total: purchases.length },
        });
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < purchases.length; i++) {
          if (get().abortBatch) {
            toast("Recálculo detenido manualmente.", { icon: "🛑", duration: 4000 });
            break;
          }
          const p = purchases[i];
          set({ batchProgress: { current: i + 1, total: purchases.length } });
          try {
            const res = await fetchHistoricalPrice(p.ticker, p.date);
            if (res && res.price) {
              const newPrice = res.price;
              const invested = p.investedAmount ?? p.shares * p.purchasePrice;
              get().updateMultiplePurchases([
                {
                  id: p.id,
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

        if (get().abortBatch) {
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
        set({ isBatchUpdating: false, abortBatch: false });
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
        if (!get().tickers.includes(upper)) {
          set((s) => ({ tickers: [...s.tickers, upper] }));
        }
      },

      removeTicker: (ticker) => {
        set((s) => ({ tickers: s.tickers.filter((t) => t !== ticker) }));
      },

      setInvestment: (amount) => set({ investment: Number(amount) }),

      setPeriod: (period) => set({ period }),

      setMode: (mode) => set({ mode }),

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
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          visibleSeries: { nav: true, sp500: true, nasdaq: true, base: true, strat_mm20: true },
        }),
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
        purchasePortfolios: s.purchasePortfolios,
        individualPurchases: s.individualPurchases,
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        // Migrate old purchases to have hist_default if missing
        if (merged.individualPurchases) {
          merged.individualPurchases = merged.individualPurchases.map((p) =>
            p.portfolioId ? p : { ...p, portfolioId: "hist_default" },
          );
        }
        if (!merged.purchasePortfolios) {
          merged.purchasePortfolios = currentState.purchasePortfolios;
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
