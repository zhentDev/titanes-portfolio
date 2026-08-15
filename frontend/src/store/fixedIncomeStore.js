/**
 * Zustand Store — Fixed Income, Savings Accounts & CDTs.
 * Full multi-currency management, compound interest calculation,
 * and automatic synchronization with FastAPI backend and localStorage.
 */

import toast from "react-hot-toast";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createFixedIncomeAccount,
  createFixedIncomeCDT,
  createFixedIncomeEntity,
  deleteFixedIncomeAccountApi,
  deleteFixedIncomeCDTApi,
  deleteFixedIncomeEntityApi,
  fetchFixedIncomeData,
  fetchHistoricalRates,
  syncFixedIncomeStateApi,
  updateFixedIncomeAccountApi,
  updateFixedIncomeCDTApi,
  updateFixedIncomeEntityApi,
} from "../api/client";

const DEFAULT_ENTITIES = [];

const DEFAULT_ACCOUNTS = [];

const DEFAULT_CDTS = [];

export const useFixedIncomeStore = create(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────
      entities: DEFAULT_ENTITIES,
      accounts: DEFAULT_ACCOUNTS,
      cdts: DEFAULT_CDTS,
      transactions: [],
      historicalRates: { entities: {} },
      preferredCurrency: "COP", // 'COP' | 'USD'
      projectionTimeline: "ALL", // '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
      projectionMode: "NOMINAL", // 'NOMINAL' | 'REAL'
      monthlyDepositContribution: 0,
      isInitialized: false,

      // ── Initialization & Backend Sync ───────────────
      initFetchFixedIncome: async () => {
        try {
          const res = await fetchFixedIncomeData();
          let rates = { entities: {} };
          try {
            rates = await fetchHistoricalRates();
          } catch (err) {
            console.error("[FixedIncome] Failed fetching rates database:", err);
          }

          // Estado actual en localStorage (Zustand persist)
          const localState = get();
          console.log("[FixedIncome] ── Estado LOCAL (localStorage) ──");
          console.log("  entities:", localState.entities.length, localState.entities.map(e => e.name));
          console.log("  accounts:", localState.accounts.length, localState.accounts.map(a => `${a.name} ($${a.balance})`));
          console.log("  cdts:", localState.cdts.length, localState.cdts.map(c => `${c.name} [${c.startDate}]`));
          console.log("  transactions:", localState.transactions.length);

          console.log("[FixedIncome] ── Estado BACKEND (API) ──");
          console.log("  entities:", res?.entities?.length || 0);
          console.log("  accounts:", res?.accounts?.length || 0);
          console.log("  cdts:", res?.cdts?.length || 0);
          console.log("  transactions:", res?.transactions?.length || 0);

          // Source of truth: prefer backend data if available; fallback to localStorage only if backend is empty
          const finalEntities = res?.entities && res.entities.length > 0 ? res.entities : (localState.entities || []);
          const finalAccounts = res?.accounts && res.accounts.length > 0 ? res.accounts : (localState.accounts || []);
          const finalCDTs = res?.cdts && res.cdts.length > 0 ? res.cdts : (localState.cdts || []);
          const finalTransactions = res?.transactions && Array.isArray(res.transactions) && res.transactions.length > 0
            ? res.transactions
            : (localState.transactions || []);

          set({
            entities: finalEntities,
            accounts: finalAccounts,
            cdts: finalCDTs,
            transactions: finalTransactions,
            historicalRates: rates || { entities: {} },
            isInitialized: true,
          });

          // Si el backend tiene menos datos que localStorage, sincronizar
          const backendNeedsSync =
            (!res?.accounts?.length && localState.accounts.length > 0) ||
            (!res?.cdts?.length && localState.cdts.length > 0) ||
            (!res?.transactions?.length && localState.transactions.length > 0);

          if (backendNeedsSync) {
            console.log("[FixedIncome] Backend vacío, sincronizando localStorage → Backend...");
            try {
              await syncFixedIncomeStateApi({
                entities: mergedEntities,
                accounts: mergedAccounts,
                cdts: mergedCDTs,
                transactions: mergedTransactions,
              });
              console.log("[FixedIncome] ✅ Sync localStorage → Backend completado");
            } catch (syncErr) {
              console.warn("[FixedIncome] ⚠️ Sync falló (datos solo en localStorage):", syncErr);
            }
          }
        } catch (e) {
          console.error("[FixedIncome] Backend offline, usando localStorage:", e);
          set({ isInitialized: true });
        }
      },

      // ── Entity Actions ───────────────────────────────
      addEntity: async (entityData) => {
        const newEntity = {
          id: `ent_${Date.now()}`,
          name: entityData.name.trim(),
          country: entityData.country || "🇨🇴",
          color: entityData.color || "#10b981",
          icon: entityData.icon || "🏦",
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
          toast.success("Entidad actualizada");
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
          toast.success("Entidad eliminada");
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
          type: accountData.type || "savings",
          currency: accountData.currency || "COP",
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
        if (!account || !account.id) {
          console.error("[FixedIncomeStore] updateAccount abortado: falta account.id", account);
          return;
        }
        try {
          await updateFixedIncomeAccountApi(account.id, account);
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id && a.id === account.id ? { ...a, ...account } : a)),
          }));
          toast.success("Cuenta actualizada");
        } catch (e) {
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id && a.id === account.id ? { ...a, ...account } : a)),
          }));
        }
      },

      deleteAccount: async (accountId) => {
        try {
          await deleteFixedIncomeAccountApi(accountId);
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
          }));
          toast.success("Cuenta eliminada");
        } catch (e) {
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
          }));
        }
      },

      // ── CDT Actions ──────────────────────────────────
      addCDT: async (cdtData) => {
        const newCDT = {
          id: cdtData.id || `cdt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          entityId: cdtData.entityId,
          name: cdtData.name.trim(),
          capital: Number(cdtData.capital || 0),
          currency: cdtData.currency || "COP",
          interestRateEA: Number(cdtData.interestRateEA || 0),
          termDays: Number(cdtData.termDays || 180),
          startDate: cdtData.startDate || new Date().toISOString().slice(0, 10),
          maturityDate: cdtData.maturityDate,
          reteFuentePct: Number(cdtData.reteFuentePct ?? 4.0),
          isAutoRenew: !!cdtData.isAutoRenew,
          status: cdtData.status || "active",
          category: cdtData.category || undefined,
          ...(cdtData.status === "matured" ? {
            payoutAmount: Number(cdtData.payoutAmount || 0),
            payoutDate: cdtData.payoutDate || cdtData.maturityDate,
            netProfit: Number(cdtData.payoutAmount || 0) - Number(cdtData.capital || 0),
          } : {}),
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
        if (!cdt || !cdt.id) {
          console.error("[FixedIncomeStore] updateCDT abortado: falta cdt.id", cdt);
          return;
        }
        try {
          await updateFixedIncomeCDTApi(cdt.id, cdt);
          set((state) => ({
            cdts: state.cdts.map((c) => (c.id && c.id === cdt.id ? { ...c, ...cdt } : c)),
          }));
          toast.success("CDT actualizado");
        } catch (e) {
          set((state) => ({
            cdts: state.cdts.map((c) => (c.id && c.id === cdt.id ? { ...c, ...cdt } : c)),
          }));
        }
      },

      deleteCDT: async (cdtId) => {
        try {
          await deleteFixedIncomeCDTApi(cdtId);
          set((state) => ({
            cdts: state.cdts.filter((c) => c.id !== cdtId),
          }));
          toast.success("CDT eliminado");
        } catch (e) {
          set((state) => ({
            cdts: state.cdts.filter((c) => c.id !== cdtId),
          }));
        }
      },

      // ── Transaction Actions ───────────────────────────
      addTransaction: async (txData) => {
        const newTx = {
          id: txData.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          accountId: txData.accountId,
          date: txData.date || new Date().toISOString().slice(0, 10),
          description: txData.description || "Movimiento",
          amount: Number(txData.amount || 0),
          currency: txData.currency || "COP",
          type: txData.type || (Number(txData.amount) >= 0 ? "credit" : "debit"),
          createdAt: new Date().toISOString(),
        };
        const currentTx = get().transactions || [];
        const updatedTx = [newTx, ...currentTx];
        set({ transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: get().entities,
            accounts: get().accounts,
            cdts: get().cdts,
            transactions: updatedTx,
          });
          toast.success("Movimiento registrado");
        } catch (e) {
          toast.success("Movimiento guardado localmente");
        }
      },

      deleteTransaction: async (txId) => {
        const updatedTx = (get().transactions || []).filter((t) => t.id !== txId);
        set({ transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: get().entities,
            accounts: get().accounts,
            cdts: get().cdts,
            transactions: updatedTx,
          });
          toast.success("Movimiento eliminado");
        } catch (e) {
          toast.success("Movimiento eliminado localmente");
        }
      },

      updateTransaction: async (txData) => {
        if (!txData || !txData.id) {
          console.error("[FixedIncomeStore] updateTransaction abortado: falta txData.id", txData);
          return;
        }
        const updatedTx = (get().transactions || []).map((t) =>
          t.id === txData.id ? { ...t, ...txData } : t
        );
        set({ transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: get().entities,
            accounts: get().accounts,
            cdts: get().cdts,
            transactions: updatedTx,
          });
          toast.success("Movimiento actualizado");
        } catch (e) {
          toast.success("Movimiento actualizado localmente");
        }
      },

      deleteTransactions: async (txIds) => {
        const idSet = new Set(txIds);
        const updatedTx = (get().transactions || []).filter((t) => !idSet.has(t.id));
        set({ transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: get().entities,
            accounts: get().accounts,
            cdts: get().cdts,
            transactions: updatedTx,
          });
          toast.success(`${idSet.size} movimiento(s) eliminado(s)`);
        } catch (e) {
          toast.success(`${idSet.size} movimiento(s) eliminado(s) localmente`);
        }
      },

      updateTransactionsYear: async (txIds, targetYear) => {
        const idSet = new Set(txIds);
        const updatedTx = (get().transactions || []).map((t) => {
          if (!idSet.has(t.id)) return t;
          const oldDate = t.date || new Date().toISOString().slice(0, 10);
          const parts = oldDate.split("-");
          const newDate = `${targetYear}-${parts[1] || "01"}-${parts[2] || "01"}`;
          return { ...t, date: newDate };
        });
        set({ transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: get().entities,
            accounts: get().accounts,
            cdts: get().cdts,
            transactions: updatedTx,
          });
          toast.success(`Año de ${idSet.size} movimiento(s) cambiado a ${targetYear}`);
        } catch (e) {
          toast.success(`Año cambiado a ${targetYear} localmente`);
        }
      },

      // ── View Settings Actions ─────────────────────────
      setPreferredCurrency: (curr) => set({ preferredCurrency: curr }),
      setProjectionTimeline: (timeline) => set({ projectionTimeline: timeline }),
      setProjectionMode: (mode) => set({ projectionMode: mode }),
      setMonthlyDepositContribution: (val) => set({ monthlyDepositContribution: Number(val) }),

      // ── Migration Action ───────────────────────────────
      migrateEntityProducts: async (fromEntityId, toEntityId) => {
        const state = get();
        const updatedAccounts = state.accounts.map(a =>
          a.entityId === fromEntityId ? { ...a, entityId: toEntityId } : a
        );
        const updatedCDTs = state.cdts.map(c =>
          c.entityId === fromEntityId ? { ...c, entityId: toEntityId } : c
        );
        set({ accounts: updatedAccounts, cdts: updatedCDTs });
        try {
          await syncFixedIncomeStateApi({
            entities: state.entities,
            accounts: updatedAccounts,
            cdts: updatedCDTs,
            transactions: state.transactions,
          });
          toast.success("Productos migrados exitosamente");
        } catch (e) {
          toast.success("Productos migrados localmente");
        }
      },
      // Resetar todo el estado (útil para depuración y eliminar datos fantasma)
      resetStore: () => {
        // Elimina el estado persistido de localStorage
        localStorage.removeItem('titanes_fixed_income_store');
        // Restablece a los valores predeterminados vacíos
        set({
          entities: [],
          accounts: [],
          cdts: [],
          transactions: [],
          historicalRates: { entities: {} },
          isInitialized: false,
        });
      },
    }),
    {
      name: "titanes_fixed_income_store",
    },
  ),
);
