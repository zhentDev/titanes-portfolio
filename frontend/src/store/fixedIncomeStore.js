/**
 * Zustand Store — Fixed Income, Savings Accounts & CDTs.
 * Full multi-currency management, compound interest calculation,
 * and automatic synchronization with FastAPI backend and localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchFixedIncomeData,
  createFixedIncomeEntity,
  updateFixedIncomeEntityApi,
  deleteFixedIncomeEntityApi,
  createFixedIncomeAccount,
  updateFixedIncomeAccountApi,
  deleteFixedIncomeAccountApi,
  createFixedIncomeCDT,
  updateFixedIncomeCDTApi,
  deleteFixedIncomeCDTApi,
  syncFixedIncomeStateApi
} from '../api/client';
import toast from 'react-hot-toast';

const DEFAULT_ENTITIES = [
  {
    id: 'ent_nu',
    name: 'Nu Colombia',
    country: '🇨🇴',
    color: '#820ad1',
    icon: '💜',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'ent_lulo',
    name: 'Lulo Bank',
    country: '🇨🇴',
    color: '#00e5ff',
    icon: '⚡',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'ent_pibank',
    name: 'Pibank',
    country: '🇨🇴',
    color: '#f59e0b',
    icon: '🏦',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'ent_ibkr',
    name: 'Interactive Brokers',
    country: '🇺🇸',
    color: '#e11d48',
    icon: '💵',
    createdAt: '2025-01-01T00:00:00Z'
  }
];

const DEFAULT_ACCOUNTS = [
  {
    id: 'acc_nu_cajita',
    entityId: 'ent_nu',
    name: 'Cajita de Ahorro Nu',
    type: 'pocket',
    currency: 'COP',
    balance: 5000000.0,
    interestRateEA: 12.0,
    isTaxExemptGMF: true,
    rateHistory: [
      { date: '2024-10-01', rateEA: 13.0 },
      { date: '2025-01-15', rateEA: 12.0 }
    ],
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'acc_lulo_pocket',
    entityId: 'ent_lulo',
    name: 'Bolsillo Lulo',
    type: 'pocket',
    currency: 'COP',
    balance: 2500000.0,
    interestRateEA: 13.0,
    isTaxExemptGMF: true,
    rateHistory: [
      { date: '2024-11-01', rateEA: 13.0 }
    ],
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'acc_ibkr_cash',
    entityId: 'ent_ibkr',
    name: 'USD Cash Yield',
    type: 'wallet',
    currency: 'USD',
    balance: 1500.0,
    interestRateEA: 4.83,
    isTaxExemptGMF: false,
    rateHistory: [
      { date: '2025-01-01', rateEA: 4.83 }
    ],
    createdAt: '2025-01-01T00:00:00Z'
  }
];

const DEFAULT_CDTS = [
  {
    id: 'cdt_pibank_180',
    entityId: 'ent_pibank',
    name: 'CDT Digital 180 Días',
    capital: 10000000.0,
    currency: 'COP',
    interestRateEA: 11.5,
    termDays: 180,
    startDate: '2025-01-15',
    maturityDate: '2025-07-14',
    reteFuentePct: 4.0,
    isAutoRenew: false,
    createdAt: '2025-01-15T00:00:00Z'
  }
];

export const useFixedIncomeStore = create(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────
      entities: DEFAULT_ENTITIES,
      accounts: DEFAULT_ACCOUNTS,
      cdts: DEFAULT_CDTS,
      transactions: [],
      preferredCurrency: 'COP', // 'COP' | 'USD'
      projectionTimeline: '1Y', // '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y'
      projectionMode: 'NOMINAL', // 'NOMINAL' | 'REAL'
      monthlyDepositContribution: 0,
      isInitialized: false,

      // ── Initialization & Backend Sync ───────────────
      initFetchFixedIncome: async () => {
        try {
          const res = await fetchFixedIncomeData();
          if (res && (res.entities?.length || res.accounts?.length || res.cdts?.length)) {
            set({
              entities: res.entities?.length ? res.entities : get().entities,
              accounts: res.accounts?.length ? res.accounts : get().accounts,
              cdts: res.cdts?.length ? res.cdts : get().cdts,
              transactions: res.transactions || [],
              isInitialized: true,
            });
          }
        } catch (e) {
          // Backend offline or local first boot — fallback to state
          set({ isInitialized: true });
        }
      },

      // ── Entity Actions ───────────────────────────────
      addEntity: async (entityData) => {
        const newEntity = {
          id: `ent_${Date.now()}`,
          name: entityData.name.trim(),
          country: entityData.country || '🇨🇴',
          color: entityData.color || '#10b981',
          icon: entityData.icon || '🏦',
          createdAt: new Date().toISOString(),
        };
        try {
          await createFixedIncomeEntity(newEntity);
          set((state) => ({ entities: [...state.entities, newEntity] }));
          toast.success(`Entidad ${newEntity.name} creada`);
          return newEntity;
        } catch (e) {
          set((state) => ({ entities: [...state.entities, newEntity] }));
          toast.success(`Entidad guardada localmente`);
        }
      },

      updateEntity: async (entity) => {
        try {
          await updateFixedIncomeEntityApi(entity.id, entity);
          set((state) => ({
            entities: state.entities.map((e) => (e.id === entity.id ? { ...e, ...entity } : e)),
          }));
          toast.success('Entidad actualizada');
        } catch (e) {
          set((state) => ({
            entities: state.entities.map((e) => (e.id === entity.id ? { ...e, ...entity } : e)),
          }));
        }
      },

      deleteEntity: async (entityId) => {
        try {
          await deleteFixedIncomeEntityApi(entityId);
          set((state) => ({
            entities: state.entities.filter((e) => e.id !== entityId),
            accounts: state.accounts.filter((a) => a.entityId !== entityId),
            cdts: state.cdts.filter((c) => c.entityId !== entityId),
          }));
          toast.success('Entidad eliminada');
        } catch (e) {
          set((state) => ({
            entities: state.entities.filter((e) => e.id !== entityId),
            accounts: state.accounts.filter((a) => a.entityId !== entityId),
            cdts: state.cdts.filter((c) => c.entityId !== entityId),
          }));
        }
      },

      // ── Account Actions ──────────────────────────────
      addAccount: async (accountData) => {
        const rate = Number(accountData.interestRateEA || 0);
        const newAccount = {
          id: `acc_${Date.now()}`,
          entityId: accountData.entityId,
          name: accountData.name.trim(),
          type: accountData.type || 'savings',
          currency: accountData.currency || 'COP',
          balance: Number(accountData.balance || 0),
          interestRateEA: rate,
          isTaxExemptGMF: accountData.isTaxExemptGMF ?? true,
          rateHistory: [{ date: new Date().toISOString().slice(0, 10), rateEA: rate }],
          createdAt: new Date().toISOString(),
        };
        try {
          await createFixedIncomeAccount(newAccount);
          set((state) => ({ accounts: [...state.accounts, newAccount] }));
          toast.success(`Cuenta ${newAccount.name} agregada`);
        } catch (e) {
          set((state) => ({ accounts: [...state.accounts, newAccount] }));
          toast.success(`Cuenta guardada localmente`);
        }
      },

      updateAccount: async (account) => {
        try {
          await updateFixedIncomeAccountApi(account.id, account);
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id === account.id ? { ...a, ...account } : a)),
          }));
          toast.success('Cuenta actualizada');
        } catch (e) {
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id === account.id ? { ...a, ...account } : a)),
          }));
        }
      },

      deleteAccount: async (accountId) => {
        try {
          await deleteFixedIncomeAccountApi(accountId);
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
          }));
          toast.success('Cuenta eliminada');
        } catch (e) {
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
          }));
        }
      },

      // ── CDT Actions ──────────────────────────────────
      addCDT: async (cdtData) => {
        const newCDT = {
          id: `cdt_${Date.now()}`,
          entityId: cdtData.entityId,
          name: cdtData.name.trim(),
          capital: Number(cdtData.capital || 0),
          currency: cdtData.currency || 'COP',
          interestRateEA: Number(cdtData.interestRateEA || 0),
          termDays: Number(cdtData.termDays || 180),
          startDate: cdtData.startDate || new Date().toISOString().slice(0, 10),
          maturityDate: cdtData.maturityDate,
          reteFuentePct: Number(cdtData.reteFuentePct ?? 4.0),
          isAutoRenew: !!cdtData.isAutoRenew,
          createdAt: new Date().toISOString(),
        };
        try {
          await createFixedIncomeCDT(newCDT);
          set((state) => ({ cdts: [...state.cdts, newCDT] }));
          toast.success(`CDT ${newCDT.name} registrado`);
        } catch (e) {
          set((state) => ({ cdts: [...state.cdts, newCDT] }));
          toast.success(`CDT guardado localmente`);
        }
      },

      updateCDT: async (cdt) => {
        try {
          await updateFixedIncomeCDTApi(cdt.id, cdt);
          set((state) => ({
            cdts: state.cdts.map((c) => (c.id === cdt.id ? { ...c, ...cdt } : c)),
          }));
          toast.success('CDT actualizado');
        } catch (e) {
          set((state) => ({
            cdts: state.cdts.map((c) => (c.id === cdt.id ? { ...c, ...cdt } : c)),
          }));
        }
      },

      deleteCDT: async (cdtId) => {
        try {
          await deleteFixedIncomeCDTApi(cdtId);
          set((state) => ({
            cdts: state.cdts.filter((c) => c.id !== cdtId),
          }));
          toast.success('CDT eliminado');
        } catch (e) {
          set((state) => ({
            cdts: state.cdts.filter((c) => c.id !== cdtId),
          }));
        }
      },

      // ── View Settings Actions ─────────────────────────
      setPreferredCurrency: (curr) => set({ preferredCurrency: curr }),
      setProjectionTimeline: (timeline) => set({ projectionTimeline: timeline }),
      setProjectionMode: (mode) => set({ projectionMode: mode }),
      setMonthlyDepositContribution: (val) => set({ monthlyDepositContribution: Number(val) }),
    }),
    {
      name: 'titanes_fixed_income_store',
    }
  )
);
