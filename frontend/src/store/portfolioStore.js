/**
 * Zustand store — portfolio state.
 * Persists to localStorage so the user's ticker list and chart settings survive page refreshes and tab switches.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_TICKERS = [
  'AMD', 'AMAT', 'HPQ', 'INTC', 'ON',
  'ORCL', 'POWI', 'QCOM', 'TXN', 'MRVL',
  'HIMX', 'NTAP', 'KD', 'ARM',
];

export const usePortfolioStore = create(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      midcapsCapital: 1000, // Simulated capital for Mid-caps MM20 PRO
      period: '1Y',
      numSlots: 15,          // fixed denominator — weight = 1/15 per ticker
      mode: 'historical',    // 'historical' | 'midcaps' | 'live' | custom strategy ID
      visibleSeries: {
        nav: true,
        sp500: true,
        nasdaq: true,
        mm20: true,
        base: true,
      },
      customStrategies: [], // User-created dynamic strategies

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

      setMidcapsCapital: (amount) => set({ midcapsCapital: Number(amount) }),

      setPeriod: (period) => set({ period }),

      setMode: (mode) => set({ mode }),

      toggleSeries: (key) =>
        set((s) => ({
          visibleSeries: {
            ...s.visibleSeries,
            [key]: !s.visibleSeries[key],
          },
        })),

      addCustomStrategy: ({ name, country, numSlots, capital, benchmark }) => {
        const newStrat = {
          id: `strat_${Date.now()}`,
          name: name.trim() || 'Nueva Estrategia',
          country: country || '🌎',
          numSlots: Number(numSlots) || 15,
          capital: Number(capital) || 1000,
          benchmark: benchmark || 'S&P 500',
          createdAt: new Date().toISOString(),
          isSystem: false, // User created -> CAN be deleted
        };
        set((s) => ({
          customStrategies: [...s.customStrategies, newStrat],
          mode: newStrat.id, // Immediately switch to new strategy window
        }));
        return newStrat;
      },

      deleteCustomStrategy: (id) => {
        const strat = get().customStrategies.find((s) => s.id === id);
        if (!strat || strat.isSystem) return; // Prevent deleting system strategies
        set((s) => ({
          customStrategies: s.customStrategies.filter((s) => s.id !== id),
          mode: s.mode === id ? 'historical' : s.mode, // Return to Titanes if active
        }));
      },

      resetToDefaults: () =>
        set({
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: '1Y',
          visibleSeries: { nav: true, sp500: true, nasdaq: true, mm20: true, base: true },
        }),
    }),
    {
      name: 'titanes-portfolio',
      partialState: (s) => ({
        tickers: s.tickers,
        investment: s.investment,
        period: s.period,
        numSlots: s.numSlots,
        mode: s.mode,
        visibleSeries: s.visibleSeries,
        customStrategies: s.customStrategies,
      }),
    }
  )
);

