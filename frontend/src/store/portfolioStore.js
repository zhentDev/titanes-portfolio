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
      period: '1Y',
      numSlots: 15,          // fixed denominator — weight = 1/15 per ticker
      mode: 'historical',    // 'historical' | 'midcaps' | 'live'
      visibleSeries: {
        nav: true,
        sp500: true,
        nasdaq: true,
        mm20: true,
        base: true,
      },

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
      }),
    }
  )
);

