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
  getAuthHeaders,
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
          const res = await fetchFixedIncomeData({ bypassCache: true });
          let rates = { entities: {} };
          try {
            rates = await fetchHistoricalRates();
          } catch (err) {
            console.error("[FixedIncome] Failed fetching rates database:", err);
          }

          // Estado actual en localStorage (Zustand persist)
          const localState = get();
          const isAuthenticated = Boolean(getAuthHeaders().Authorization);

          // ── Lossless Union Merge ───────────────────────────────────────
          // Combine remote and local data by unique ID so changes made either on
          // the public site (Render) or locally are NEVER dropped or overwritten.

          // 1. Entities
          const entityMap = new Map();
          (res?.entities || []).forEach((e) => { if (e && e.id) entityMap.set(e.id, e); });
          (localState.entities || []).forEach((e) => {
            if (e && e.id && !entityMap.has(e.id)) entityMap.set(e.id, e);
          });
          const finalEntities = Array.from(entityMap.values());

          // 2. CDTs
          const cdtMap = new Map();
          (res?.cdts || []).forEach((c) => { if (c && c.id) cdtMap.set(c.id, c); });
          (localState.cdts || []).forEach((c) => {
            if (c && c.id && !cdtMap.has(c.id)) cdtMap.set(c.id, c);
          });
          const finalCDTs = Array.from(cdtMap.values());

          // 3. Transactions (lossless union: keeps all unique IDs from remote and local)
          const txMap = new Map();
          (res?.transactions || []).forEach((t) => { if (t && t.id) txMap.set(t.id, t); });
          let localHadExtraTx = false;
          (localState.transactions || []).forEach((t) => {
            if (t && t.id && !txMap.has(t.id)) {
              txMap.set(t.id, t);
              localHadExtraTx = true;
            }
          });
          const finalTransactions = Array.from(txMap.values()).sort(
            (a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")
          );

          // 4. Accounts
          const accMap = new Map();
          (res?.accounts || []).forEach((a) => { if (a && a.id) accMap.set(a.id, a); });
          (localState.accounts || []).forEach((a) => {
            if (a && a.id) {
              if (!accMap.has(a.id)) {
                accMap.set(a.id, a);
              } else {
                const remoteAcc = accMap.get(a.id);
                accMap.set(a.id, { ...a, ...remoteAcc });
              }
            }
          });
          let finalAccounts = Array.from(accMap.values()).map((acc) => {
            const { disableDailyCompounding, ...rest } = acc;
            return rest;
          });

          // If local had new transactions that remote lacked, push them upstream
          if (localHadExtraTx && finalTransactions.length > (res?.transactions?.length || 0)) {
            syncFixedIncomeStateApi({
              entities: finalEntities,
              accounts: finalAccounts,
              cdts: finalCDTs,
              transactions: finalTransactions,
            }).catch((e) => console.warn("[FixedIncome] Background sync of merged tx failed:", e));
          }

          // Normalize Plenti Bolsillo a la vista, Finandina FlexiDigital+ pocket, and Daviplata Principal
          const accountsToSync = [];
          finalAccounts = finalAccounts.map((acc) => {
            const isDaviplata =
              acc.id === "acc_daviplata_disp" ||
              acc.entityId === "ent_daviplata" ||
              (acc.name || "").toLowerCase().includes("daviplata");
            if (isDaviplata && Number(acc.balance || 0) === 0) {
              const updated = { ...acc, balance: 2200.03 };
              accountsToSync.push(updated);
              return updated;
            }

            const isPlentiPocket =
              acc.id === "acc_1786777955489" ||
              (acc.currency === "USD" && (acc.name || "").toLowerCase().includes("bolsillo"));
            if (isPlentiPocket && (Number(acc.interestRateEA || 0) < 4.0 || acc.fallbackAccountId !== "acc_plenti_principal")) {
              const updated = {
                ...acc,
                name: "Bolsillo a la vista",
                fallbackAccountId: "acc_plenti_principal",
                interestRateEA: 4.0,
                rateHistory: [
                  { date: "2026-05-01", rateEA: 3.0 },
                  { date: "2026-08-01", rateEA: 4.0 },
                ],
                tieredRates: [
                  { maxBalance: 500, rateEA: 4.0, label: "Hasta $500 USD (4.0% EA)" },
                  { maxBalance: 1000, rateEA: 4.0, label: "$500 a $1,000 USD (4.0% EA)" },
                  { maxBalance: 5000, rateEA: 4.5, label: "$1,000 a $5,000 USD (4.5% EA)" },
                  { maxBalance: 9999999, rateEA: 6.0, label: "Más de $5,000 USD (6.0% EA)" },
                ],
              };
              accountsToSync.push(updated);
              return updated;
            }

            // Finandina Bolsillo de Ahorro — Fondo de Emergencia (FlexiDigital +)
            if (acc.id === "acc_1786771927434") {
              const targetName = "Bolsillo de Ahorro — Fondo de Emergencia (FlexiDigital +)";
              if (
                acc.name !== targetName ||
                Number(acc.interestRateEA || 0) !== 10.5 ||
                acc.fallbackAccountId !== "acc_finandina_principal" ||
                !Array.isArray(acc.rateHistory) ||
                acc.rateHistory.length < 2
              ) {
                const updated = {
                  ...acc,
                  name: targetName,
                  accountCategory: "high_yield",
                  interestRateEA: 10.5,
                  fallbackAccountId: "acc_finandina_principal",
                  rateHistory: [
                    { date: "2024-01-01", rateEA: 10.0 },
                    { date: "2026-08-01", rateEA: 10.5 },
                  ],
                };
                accountsToSync.push(updated);
                return updated;
              }
            }

            return acc;
          });

          // Ensure Plenti Principal (0%) and Finandina's 3 products exist
          const requiredAccounts = [
            {
              id: "acc_plenti_principal",
              entityId: "ent_1786777900826",
              name: "Cuenta Plenti (Principal)",
              type: "savings",
              accountCategory: "digital_wallet",
              currency: "USD",
              balance: 0,
              interestRateEA: 0,
              isTaxExempt: false,
              createdAt: 1786777950000,
            },
            {
              id: "acc_finandina_principal",
              entityId: "ent_1786771791285",
              name: "FlexiDigital + (Principal)",
              type: "savings",
              accountCategory: "digital_wallet",
              currency: "COP",
              balance: 0,
              interestRateEA: 0,
              isTaxExempt: false,
              createdAt: 1786771920000,
            },
            {
              id: "acc_finandina_flexidigital",
              entityId: "ent_1786771791285",
              name: "Cuenta FlexiDigital",
              type: "savings",
              accountCategory: "high_yield",
              currency: "COP",
              balance: 913.64,
              interestRateEA: 0.15,
              isTaxExempt: false,
              rateHistory: [{ date: "2025-02-01", rateEA: 0.15 }],
              transactions: [
                {
                  id: "tx_finandina_flexidigital_init",
                  date: "2025-02-01",
                  type: "deposit",
                  amount: 913.64,
                  note: "Saldo en Cuenta FlexiDigital (Clásica)",
                },
              ],
              createdAt: 1786771928000,
            },
            {
              id: "acc_finandina_ahorro_puro",
              entityId: "ent_1786771791285",
              name: "Cuenta Ahorro Puro",
              type: "savings",
              accountCategory: "high_yield",
              currency: "COP",
              balance: 114.38,
              interestRateEA: 0.15,
              isTaxExempt: false,
              rateHistory: [{ date: "2025-02-01", rateEA: 0.15 }],
              tieredRates: [
                { maxBalance: 1000000, rateEA: 0.15, label: "Hasta $1,000,000 COP (0.15% E.A.)" },
                { maxBalance: 100000000, rateEA: 7.5, label: "$1.1M a $100M COP (IBR - 2% ≈ 7.5% E.A.)" },
              ],
              transactions: [
                {
                  id: "tx_finandina_ahorropuro_init",
                  date: "2025-02-01",
                  type: "deposit",
                  amount: 114.38,
                  note: "Saldo en Cuenta Ahorro Puro",
                },
              ],
              createdAt: 1786771929000,
            },
          ];

          const newAccountsToCreate = [];
          for (const reqAcc of requiredAccounts) {
            if (!finalAccounts.some((a) => a.id === reqAcc.id)) {
              finalAccounts.push(reqAcc);
              newAccountsToCreate.push(reqAcc);
            }
          }

          for (const upd of accountsToSync) {
            updateFixedIncomeAccountApi(upd.id, upd).catch(() => {});
          }
          for (const nw of newAccountsToCreate) {
            createFixedIncomeAccount(nw).catch(() => {});
          }

          set({
            entities: finalEntities,
            accounts: finalAccounts,
            cdts: finalCDTs,
            transactions: finalTransactions,
            historicalRates: rates || { entities: {} },
            isInitialized: true,
          });

          // Solo sincronizar a backend si es un usuario autenticado que ya tenía datos legítimos locales antes de la creación
          // o si deliberadamente hay un delta sin pisar carteras vacías.
          const backendNeedsSync =
            isAuthenticated &&
            !res?.accounts?.length &&
            !res?.cdts?.length &&
            (localState.accounts?.length > 0 || localState.cdts?.length > 0) &&
            false; // Safeguard: nunca subir ciegamente cuentas residuales de localStorage al registrarse
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
          id: accountData.id || `acc_${Date.now()}`,
          entityId: accountData.entityId,
          name: accountData.name.trim(),
          type: accountData.type || "savings",
          syncType: accountData.syncType || "api",
          accountCategory: accountData.accountCategory || (accountData.type === "wallet" || rate === 0 ? "digital_wallet" : "high_yield"),
          fallbackAccountId: accountData.fallbackAccountId || null,
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
            deletedTxIds: [txId],
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
            deletedTxIds: Array.from(idSet),
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

      // ── Inter-account Money Movements ─────────────────
      /**
       * Acredita un movimiento proveniente del Flujo de Caja (p.ej. transferencia de
       * nómina asignada al Fondo de Emergencia) en la cuenta principal elegida.
       * Idempotente: usa `tx_cf_<movementId>` para no duplicar el abono.
       */
      creditAccountFromCashFlow: async ({ accountId, amount, date, description, movementId }) => {
        const amt = Math.abs(Number(amount || 0));
        const state = get();
        const acc = state.accounts.find((a) => a.id === accountId);
        if (!acc || amt <= 0) return;
        const txId = `tx_cf_${movementId || Date.now()}`;
        if ((state.transactions || []).some((t) => t.id === txId)) {
          toast("Este movimiento ya estaba abonado en la cuenta", { icon: "ℹ️" });
          return;
        }
        const newTx = {
          id: txId,
          accountId: acc.id,
          entityId: acc.entityId,
          date: date || new Date().toISOString().slice(0, 10),
          description: description || "Transferencia recibida",
          amount: amt,
          currency: acc.currency || "COP",
          type: "credit",
          category: "Transferencia desde Flujo de Caja",
          source: "cashflow_assignment",
          createdAt: new Date().toISOString(),
        };
        const updatedAcc = { ...acc, balance: Number(acc.balance || 0) + amt };
        const updatedAccounts = state.accounts.map((a) => (a.id === acc.id ? updatedAcc : a));
        const updatedTx = [newTx, ...(state.transactions || [])];
        set({ accounts: updatedAccounts, transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: state.entities,
            accounts: updatedAccounts,
            cdts: state.cdts,
            transactions: updatedTx,
          });
        } catch (e) {
          console.warn("[FixedIncome] creditAccountFromCashFlow sync failed:", e);
        }
        toast.success(`+$${amt.toLocaleString("es-CO")} abonados en ${acc.name}`, { icon: "🏦" });
      },

      /**
       * Movimiento interno entre cuentas de la misma entidad
       * (p.ej. FlexiDigital + Principal ➔ Bolsillo Fondo de Emergencia).
       */
      transferBetweenAccounts: async ({ fromAccountId, toAccountId, amount, date, note }) => {
        const amt = Math.abs(Number(amount || 0));
        const state = get();
        const from = state.accounts.find((a) => a.id === fromAccountId);
        const to = state.accounts.find((a) => a.id === toAccountId);
        if (!from || !to || amt <= 0) return false;
        if (amt > Number(from.balance || 0) + 0.01) {
          toast.error(`Saldo insuficiente en ${from.name}`);
          return false;
        }
        const stamp = Date.now();
        const txDate = date || new Date().toISOString().slice(0, 10);
        const nowIso = new Date().toISOString();
        const debitTx = {
          id: `tx_int_${stamp}_out`,
          accountId: from.id,
          entityId: from.entityId,
          date: txDate,
          description: `Movimiento interno ➔ ${to.name}${note ? ` (${note})` : ""}`,
          amount: -amt,
          currency: from.currency || "COP",
          type: "debit",
          category: "Movimiento Interno",
          source: "internal_transfer",
          linkedTxId: `tx_int_${stamp}_in`,
          createdAt: nowIso,
        };
        const creditTx = {
          id: `tx_int_${stamp}_in`,
          accountId: to.id,
          entityId: to.entityId,
          date: txDate,
          description: `Depósito desde ${from.name}${note ? ` (${note})` : ""}`,
          amount: amt,
          currency: to.currency || "COP",
          type: "credit",
          category: "Movimiento Interno",
          source: "internal_transfer",
          linkedTxId: debitTx.id,
          createdAt: nowIso,
        };
        const updatedAccounts = state.accounts.map((a) => {
          if (a.id === from.id) return { ...a, balance: Math.max(0, Number(a.balance || 0) - amt) };
          if (a.id === to.id) return { ...a, balance: Number(a.balance || 0) + amt };
          return a;
        });
        const updatedTx = [creditTx, debitTx, ...(state.transactions || [])];
        set({ accounts: updatedAccounts, transactions: updatedTx });
        try {
          await syncFixedIncomeStateApi({
            entities: state.entities,
            accounts: updatedAccounts,
            cdts: state.cdts,
            transactions: updatedTx,
          });
        } catch (e) {
          console.warn("[FixedIncome] transferBetweenAccounts sync failed:", e);
        }
        toast.success(`$${amt.toLocaleString("es-CO")} movidos de ${from.name} a ${to.name}`, { icon: "🔁" });
        return true;
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
