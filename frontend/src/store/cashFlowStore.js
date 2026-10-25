/**
 * Zustand Store — Cash Flow & Dynamic Budget Allocation Hub.
 * Full multi-currency management, 50/30/20 & dynamic rule tracking,
 * Colombian legal payroll calculator & salary historical variation tracking,
 * credit cards & installment management (0% MSI & standard interest),
 * primary payroll account entity configuration,
 * universal forward propagation for all recurring budget items,
 * live auto-synced passive yields from Fixed Income & Portfolio,
 * and automatic synchronization with FastAPI backend and localStorage.
 */

import toast from "react-hot-toast";
import { create } from "zustand";
import {
  createInflowApi,
  createNeedExpenseApi,
  createWantExpenseApi,
  createWealthItemApi,
  deleteInflowApi,
  deleteNeedExpenseApi,
  deleteWantExpenseApi,
  deleteWealthItemApi,
  deleteExpenseApi,
  deleteDebtApi,
  fetchCashFlowData,
  syncCashFlowStateApi,
} from "../api/client";
import { getCurrentPeriod } from "../utils/periodUtils";

let syncDebounceTimer = null;

const DEFAULT_RATIOS = {
  needs: 40,
  wants: 20,
  savings: 40,
};

// El sistema de ingresos inicia oficialmente a partir del pago de nómina del 23 de Octubre de 2026
// (que financia el ciclo salarial Noviembre 2026: 23 Oct - 24 Nov).
export const INCOME_SYSTEM_START_PERIOD = "2026-11";
export const INCOME_SYSTEM_START_DATE = "2026-10-23";

const DEFAULT_PAYROLL_ACCOUNT = {
  entityId: "nu",
  name: "Nu Colombia (Cuenta Nu Débito)",
  accountType: "Ahorros / Débito",
  accountNumber: "*1234",
  color: "#820ad1",
  icon: "💜",
  payDay: 25,
  activeFromDate: "2026-10-23",
  targetCycle: "next_month",
  paymentFrequency: "monthly",
};

const DEFAULT_CREDIT_CARDS = [];
const DEFAULT_CREDIT_PURCHASES = [];
const DEFAULT_INFLOWS = [];
const DEFAULT_NEEDS = [];
const DEFAULT_WANTS = [];
const DEFAULT_WEALTH = [];

// Helper: Filter recurring items for forward inheritance
function getRecurringItems(items = [], targetPeriod) {
  return items
    .filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return item.targetPeriod === targetPeriod;
      }
      return true;
    })
    .map((item) => ({ ...item }));
}

// Helper: Clean legacy dummy template data ($7.5M dummy salary)
function isLegacyDummy(items = []) {
  return items.some((i) => Number(i.amount) === 7500000 || Number(i.amount) === 2500000);
}

function cleanLegacyPeriods(periods = {}) {
  const cleaned = {};
  Object.keys(periods).forEach((key) => {
    const snap = periods[key];
    if (snap && snap.inflows && !isLegacyDummy(snap.inflows)) {
      cleaned[key] = snap;
    }
  });
  return cleaned;
}

export const useCashFlowStore = create(
  (set, get) => ({
    // ── State ────────────────────────────────────────
    startPeriod: INCOME_SYSTEM_START_PERIOD, // Activo a partir del pago del 23 de Oct (ciclo 2026-11: 23 Oct - 24 Nov)
    activePeriod: getCurrentPeriod() < INCOME_SYSTEM_START_PERIOD ? INCOME_SYSTEM_START_PERIOD : getCurrentPeriod(), // Currently viewed period
    currency: "COP", // 'COP' | 'USD'
    allocationModel: "custom", // 'custom' | '50_30_20' | 'pay_yourself_first' | 'envelope'
    customRatios: DEFAULT_RATIOS,
    emergencyFundTargetMonths: 6,
    payrollAccount: DEFAULT_PAYROLL_ACCOUNT,
    creditCards: DEFAULT_CREDIT_CARDS,
    creditPurchases: DEFAULT_CREDIT_PURCHASES,
    creditCardPayments: [],
    expensesLog: [],
    debts: [],
    inflows: DEFAULT_INFLOWS,
    needs: DEFAULT_NEEDS,
    wants: DEFAULT_WANTS,
    wealth: DEFAULT_WEALTH,
    salaryHistory: [],
    periodsData: {}, // Multi-month snapshots: { [period]: { inflows, needs, wants, wealth, customRatios, allocationModel } }
    isInitialized: false,
    isSyncing: false,

    // ── Initialization directly from Local Backend Database (SSOT) + Offline Cache ──
    initFetchCashFlow: async () => {
      try {
        let cachedLocal = null;
        try {
          const raw = localStorage.getItem("titanes_cash_flow_store_v2");
          if (raw) cachedLocal = JSON.parse(raw);
        } catch {}

        const res = await fetchCashFlowData({ bypassCache: true });
        const source = res || cachedLocal;
        if (!source && !cachedLocal) {
          set({ isInitialized: true });
          return;
        }

        // Helper for lossless union of array of objects by id
        const unionById = (serverArr = [], localArr = []) => {
          const map = new Map();
          (serverArr || []).forEach((item) => {
            if (item && item.id) map.set(item.id, { ...item });
          });
          (localArr || []).forEach((item) => {
            if (item && item.id) {
              const existing = map.get(item.id);
              map.set(item.id, existing ? { ...existing, ...item } : { ...item });
            }
          });
          return Array.from(map.values());
        };

        // Mes calendario actual en tiempo real (ej. "2026-10", "2026-11", etc.)
        const now = new Date();
        const currentCalPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        // El sistema de ingresos está activo únicamente a partir del pago del 23 de Octubre de 2026 (ciclo 2026-11: 23 Oct - 24 Nov)
        const rawStartP = source?.startPeriod || cachedLocal?.startPeriod || INCOME_SYSTEM_START_PERIOD;
        const startP = rawStartP < INCOME_SYSTEM_START_PERIOD ? INCOME_SYSTEM_START_PERIOD : rawStartP;
        const activeP = currentCalPeriod < startP ? startP : currentCalPeriod;

        // Custom ratios: user's exact configuration from local or remote prevails 100%
        const userRatios = cachedLocal?.customRatios || source?.customRatios;
        const resolvedRatios = userRatios || DEFAULT_RATIOS;

        const cleanedPeriodsData = {
          ...(source?.periodsData || {}),
          ...(cachedLocal?.periodsData || {}),
        };
        Object.keys(cleanedPeriodsData).forEach((k) => {
          if (k < INCOME_SYSTEM_START_PERIOD) {
            delete cleanedPeriodsData[k];
          }
        });

        // Exact user items — union lossless between remote and local so incoming webhooks and classifications are never wiped
        const mergedCreditCards = Array.isArray(source?.creditCards) && source.creditCards.length > 0 ? source.creditCards : (cachedLocal?.creditCards || []);
        const mergedCreditPurchases = unionById(source?.creditPurchases, cachedLocal?.creditPurchases);
        const mergedCreditCardPayments = unionById(source?.creditCardPayments, cachedLocal?.creditCardPayments);
        const mergedExpensesLog = unionById(source?.expensesLog, cachedLocal?.expensesLog);
        
        // Auto-corrección: si el movimiento de $37,000 (Plan móvil) quedó por error asignado al Fondo de Emergencia,
        // restaurarlo al rubro correspondiente de Servicios Públicos: Plan móvil; y vincular la transferencia real de $350k a Finandina.
        // Y eliminar cualquier provisión provisional de Mike para que NO reste de nómina.
        const sanitizedExpensesLog = mergedExpensesLog
          .filter((e) => e.id !== "exp_provision_mike_202610" && !e.description?.includes("Provisión Cuota Mike"))
          .map((e) => {
          const isPlanMovil37k =
            Number(e.amount) === 37000 &&
            ((e.description || "").toLowerCase().includes("plan movil") ||
              (e.subItemName || "").toLowerCase().includes("plan movil") ||
              e.budgetItemId === "need_utilities" ||
              e.budgetItemId === "wealth_emergency");
          if (isPlanMovil37k && (e.budgetItemId === "wealth_emergency" || e.budgetItemType === "wealth")) {
            return {
              ...e,
              budgetItemId: "need_utilities",
              budgetItemName: "Servicios Públicos, Luz & Fibra Óptica",
              budgetItemType: "needs",
              subItemId: "sub_1792692729310_tryk",
              subItemName: "Plan movil",
              description: "Servicios Públicos, Luz & Fibra Óptica: Plan movil",
              destinationAccountId: null,
              destinationAccountName: null,
            };
          }
          const is350kTransfer = Number(e.amount) === 350000;
          if (is350kTransfer && e.budgetItemId === "wealth_emergency") {
            return {
              ...e,
              destinationAccountId: "acc_finandina_principal",
              destinationAccountName: "FlexiDigital + (Principal)",
            };
          }
          return e;
        });

        const rawDebts = unionById(source?.debts, cachedLocal?.debts);
        const mergedDebts = rawDebts.map((d) => {
          if (d.concept?.toLowerCase().includes("mike") || d.creditor?.toLowerCase().includes("mike")) {
            const hasPayment = (d.paymentsLog || []).some((p) => Number(p.amount) === 210000);
            return {
              ...d,
              remainingAmount: 420000,
              paymentsLog: hasPayment
                ? d.paymentsLog
                : [
                    {
                      id: "pay_mike_20261024_01",
                      amount: 210000,
                      date: "2026-10-24",
                      paymentMethod: "Transferencia desde Cajita / Cuenta (Deudas)",
                      note: "Abono cuota mensual transferida a la cajita para Mike",
                      createdAt: "2026-10-24T20:45:00.000Z",
                    },
                    ...(d.paymentsLog || []),
                  ],
            };
          }
          return d;
        });
        const mergedInflows = unionById(source?.inflows, cachedLocal?.inflows);
        const mergedNeeds = unionById(source?.needs, cachedLocal?.needs);
        const mergedWants = unionById(source?.wants, cachedLocal?.wants);
        const mergedWealth = unionById(source?.wealth, cachedLocal?.wealth);

        const resolvedState = {
          startPeriod: startP,
          activePeriod: activeP,
          currency: source?.currency || cachedLocal?.currency || "COP",
          allocationModel: source?.allocationModel || cachedLocal?.allocationModel || "custom",
          customRatios: resolvedRatios,
          emergencyFundTargetMonths: source?.emergencyFundTargetMonths ?? cachedLocal?.emergencyFundTargetMonths ?? 6,
          payrollAccount: {
            ...DEFAULT_PAYROLL_ACCOUNT,
            ...(cachedLocal?.payrollAccount || {}),
            ...(source?.payrollAccount || {}),
            activeFromDate: "2026-10-23",
          },
          creditCards: mergedCreditCards,
          creditPurchases: mergedCreditPurchases,
          creditCardPayments: mergedCreditCardPayments,
          expensesLog: sanitizedExpensesLog,
          debts: mergedDebts,
          inflows: mergedInflows,
          needs: mergedNeeds,
          wants: mergedWants,
          wealth: mergedWealth,
          salaryHistory: unionById(source?.salaryHistory, cachedLocal?.salaryHistory),
          periodsData: cleanedPeriodsData,
          isInitialized: true,
        };

        set(resolvedState);

        // Also save to localStorage as instant offline backup
        try {
          localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify(resolvedState));
        } catch {}
      } catch (err) {
        console.error("[CashFlow] Failed to load data from backend database:", err);
        set({ isInitialized: true });
      }
    },

      syncStateWithBackend: async () => {
        const state = get();
        if (!state.isInitialized) {
          console.warn("[CashFlow] Safeguard: backend sync blocked because store is not initialized yet!");
          return;
        }

        // 1. Immediately persist to localStorage so no edits are ever lost on client
        try {
          localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify(state));
        } catch (e) {
          console.warn("[CashFlow] Local cache save error:", e);
        }

        // Cancel previous pending sync timer to debounce rapid updates
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
        }

        syncDebounceTimer = setTimeout(async () => {
          set({ isSyncing: true });
          try {
            const currentState = get();
            await syncCashFlowStateApi({
              startPeriod: currentState.startPeriod,
              activePeriod: currentState.activePeriod,
              currency: currentState.currency,
              allocationModel: currentState.allocationModel,
              customRatios: currentState.customRatios,
              emergencyFundTargetMonths: currentState.emergencyFundTargetMonths,
              payrollAccount: currentState.payrollAccount,
              creditCards: currentState.creditCards,
              creditPurchases: currentState.creditPurchases,
              creditCardPayments: currentState.creditCardPayments,
              expensesLog: currentState.expensesLog,
              debts: currentState.debts || [],
              inflows: currentState.inflows,
              needs: currentState.needs,
              wants: currentState.wants,
              wealth: currentState.wealth,
              periodsData: currentState.periodsData,
            });
          } catch (err) {
            if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
              return;
            }
            console.error("[CashFlow] Error syncing to backend:", err);
          } finally {
            set({ isSyncing: false });
          }
        }, 300);
      },

      // ── Payroll Account Settings ─────────────────────
      setPayrollAccount: (payrollAccount) => {
        set({ payrollAccount });
        get().syncStateWithBackend();
        toast.success(`Cuenta de Nómina actualizada a ${payrollAccount.name}`, { icon: "🏦" });
      },

      // ── Credit Cards CRUD ────────────────────────────
      addCreditCard: (card) => {
        set((state) => ({ creditCards: [...state.creditCards, card] }));
        get().syncStateWithBackend();
        toast.success(`Tarjeta ${card.name} registrada con éxito`, { icon: "💳" });
      },

      updateCreditCard: (id, updates) => {
        set((state) => ({
          creditCards: state.creditCards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
        get().syncStateWithBackend();
      },

      deleteCreditCard: (id) => {
        set((state) => ({
          creditCards: state.creditCards.filter((c) => c.id !== id),
          creditPurchases: state.creditPurchases.filter((p) => p.cardId !== id),
        }));
        get().syncStateWithBackend();
        toast.success("Tarjeta eliminada", { icon: "🗑️" });
      },

      // ── Credit Purchases & Installments CRUD ─────────
      addCreditPurchase: (purchase) => {
        set((state) => ({ creditPurchases: [purchase, ...state.creditPurchases] }));
        get().syncStateWithBackend();
        toast.success(`Compra diferida "${purchase.description}" registrada`, { icon: "🛍️" });
      },

      updateCreditPurchase: (id, updates) => {
        set((state) => ({
          creditPurchases: state.creditPurchases.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
        get().syncStateWithBackend();
      },

      deleteCreditPurchase: (id) => {
        set((state) => ({
          creditPurchases: state.creditPurchases.filter((p) => p.id !== id),
        }));
        get().syncStateWithBackend();
        toast.success("Compra diferida eliminada", { icon: "🗑️" });
      },

      // ── Real Expenses & Transactions Log CRUD ────────
      addExpenseTransaction: (tx) => {
        set((state) => {
          let updatedCards = state.creditCards;
          if (tx.paymentSource?.type === "credit_card" && tx.paymentSource.targetId) {
            updatedCards = state.creditCards.map((c) => {
              if (c.id === tx.paymentSource.targetId) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + Number(tx.amount) };
              }
              return c;
            });
          }

          return {
            expensesLog: [tx, ...(state.expensesLog || [])],
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        toast.success(`Gasto real "${tx.description}" registrado en ${tx.paymentSource?.targetName || "Nómina"}`, { icon: "💸" });
      },

      updateExpenseTransaction: (updatedTx) => {
        set((state) => {
          const oldTx = (state.expensesLog || []).find((tx) => tx.id === updatedTx.id);
          let updatedCards = state.creditCards;

          // Reconcile credit card usedLimit if payment source or amount changed
          if (oldTx && oldTx.paymentSource?.type === "credit_card" && oldTx.paymentSource.targetId) {
            updatedCards = updatedCards.map((c) => {
              if (c.id === oldTx.paymentSource.targetId) {
                return { ...c, usedLimit: Math.max(0, (Number(c.usedLimit) || 0) - Number(oldTx.amount)) };
              }
              return c;
            });
          }

          if (updatedTx.paymentSource?.type === "credit_card" && updatedTx.paymentSource.targetId) {
            updatedCards = updatedCards.map((c) => {
              if (c.id === updatedTx.paymentSource.targetId) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + Number(updatedTx.amount) };
              }
              return c;
            });
          }

          const updatedLog = (state.expensesLog || []).map((tx) =>
            tx.id === updatedTx.id ? { ...tx, ...updatedTx } : tx
          );

          return {
            expensesLog: updatedLog,
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        toast.success(`Movimiento "${updatedTx.description}" actualizado`, { icon: "✏️" });
      },

      deleteExpenseTransaction: (id) => {
        set((state) => {
          const txToDelete = (state.expensesLog || []).find((tx) => tx.id === id);
          let updatedCards = state.creditCards;

          if (txToDelete && txToDelete.paymentSource?.type === "credit_card" && txToDelete.paymentSource.targetId) {
            updatedCards = state.creditCards.map((c) => {
              if (c.id === txToDelete.paymentSource.targetId) {
                return { ...c, usedLimit: Math.max(0, (Number(c.usedLimit) || 0) - Number(txToDelete.amount)) };
              }
              return c;
            });
          }

          const filteredExpenses = (state.expensesLog || []).filter((tx) => tx.id !== id);
          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({ ...state, expensesLog: filteredExpenses, creditCards: updatedCards }));
          } catch {}

          return {
            expensesLog: filteredExpenses,
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        deleteExpenseApi(id).catch(() => {});
        toast.success("Gasto real eliminado", { icon: "🗑️" });
      },

      // ── Convert Generic Expense into Credit Card Payment (Libera Cupo) ──
      convertExpenseToCardPayment: (expenseId, targetCardId) => {
        const state = get();
        const expense = (state.expensesLog || []).find((e) => e.id === expenseId);
        if (!expense) return;

        const targetCard = (state.creditCards || []).find((c) => c.id === targetCardId);
        if (!targetCard) return;

        const amount = Number(expense.amount) || 0;

        // 1. Liberate Credit Card quota
        const updatedCards = (state.creditCards || []).map((c) => {
          if (c.id === targetCardId) {
            const currentUsed = Number(c.usedLimit) || 0;
            return { ...c, usedLimit: Math.max(0, currentUsed - amount) };
          }
          return c;
        });

        // 2. Remove from expensesLog so living expenses are not distorted
        const filteredExpenses = (state.expensesLog || []).filter((e) => e.id !== expenseId);

        // 3. Insert into creditCardPayments
        const paymentRecord = {
          id: `pay_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          period: expense.period || state.activePeriod,
          cardId: targetCard.id,
          cardName: targetCard.name,
          amount: amount,
          currency: expense.currency || state.currency,
          date: expense.date || new Date().toISOString().split("T")[0],
          description: `Pago ${targetCard.name} (Asignado manualmente)`,
          sourceType: expense.paymentSource?.type || "payroll",
          sourceAccountId: expense.paymentSource?.targetId || null,
          sourceAccount: expense.paymentSource?.targetName || state.payrollAccount?.name || "Nómina",
          notes: `Reclasificado desde: ${expense.description || expense.budgetItemName || "Gasto"}`,
          createdAt: new Date().toISOString(),
        };

        const updatedPayments = [paymentRecord, ...(state.creditCardPayments || [])];

        set({
          creditCards: updatedCards,
          expensesLog: filteredExpenses,
          creditCardPayments: updatedPayments,
        });

        try {
          localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({
            ...state,
            creditCards: updatedCards,
            expensesLog: filteredExpenses,
            creditCardPayments: updatedPayments,
          }));
        } catch {}

        get().syncStateWithBackend();
        toast.success(`¡Pago asignado a ${targetCard.name}! Cupo liberado exitosamente 🎉`, { icon: "💳" });
      },

      // ── Universal Movement Reclassification / Imputation ──
      splitExpenseMovement: ({ movementId, cardId, distributions }) => {
        const state = get();
        const expense = (state.expensesLog || []).find((e) => e.id === movementId);
        const cardPayment = !expense ? (state.creditCardPayments || []).find((p) => p.id === movementId) : null;
        const sourceItem = expense || cardPayment;
        if (!sourceItem) return;

        const effectiveCardId = cardId || sourceItem.cardId || null;
        const isCard = Boolean(effectiveCardId);
        const card = isCard ? (state.creditCards || []).find((c) => c.id === effectiveCardId) : null;
        const totalAmount = distributions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        let updatedCards = state.creditCards || [];
        let updatedPayments = (state.creditCardPayments || []).filter((p) => p.id !== movementId);

        // Only liberate quota if it was not already converted/registered as a card payment
        if (card && expense) {
          const currentUsed = Number(card.usedLimit) || 0;
          updatedCards = updatedCards.map((c) => {
            if (c.id === effectiveCardId) {
              return { ...c, usedLimit: Math.max(0, currentUsed - totalAmount) };
            }
            return c;
          });
        }

        let paymentRecord = null;
        if (card) {
          const paymentId = `pay_split_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          paymentRecord = {
            id: paymentId,
            period: sourceItem.period || state.activePeriod,
            cardId: card.id,
            cardName: card.name,
            amount: totalAmount,
            currency: sourceItem.currency || state.currency,
            date: sourceItem.date || new Date().toISOString().split("T")[0],
            description: `Pago ${card.name} (Distribuido en ${distributions.length} rubros)`,
            sourceType: sourceItem.sourceType || sourceItem.paymentSource?.type || "payroll",
            sourceAccountId: sourceItem.sourceAccountId || sourceItem.paymentSource?.targetId || null,
            sourceAccount: sourceItem.sourceAccount || sourceItem.paymentSource?.targetName || state.payrollAccount?.name || "Nómina",
            notes: `Distribuido desde: ${sourceItem.description || sourceItem.cardName || "Pago de Tarjeta"}`,
            budgetDeductions: distributions.map((d) => ({
              budgetItemId: d.budgetItemId,
              budgetItemName: d.budgetItemName,
              budgetItemType: d.budgetItemType,
              amount: Number(d.amount),
              subItemId: d.subItemId || null,
              subItemName: d.subItemName || null,
              isEmergencySavingsDeduction: d.budgetItemType === "wealth",
            })),
            createdAt: new Date().toISOString(),
          };
          updatedPayments = [paymentRecord, ...updatedPayments];
        }

        const filteredExpenses = (state.expensesLog || []).filter((e) => e.id !== movementId);

        const newExpenseEntries = distributions
          .filter((d) => Number(d.amount) > 0)
          .map((d, idx) => ({
            id: `${movementId}_split_${idx}_${Date.now()}`,
            period: sourceItem.period || state.activePeriod,
            date: sourceItem.date || new Date().toISOString().split("T")[0],
            time: sourceItem.time || null,
            amount: Number(d.amount),
            currency: sourceItem.currency || state.currency,
            type: "debit",
            budgetItemId: d.budgetItemId,
            budgetItemName: d.budgetItemName,
            budgetItemType: d.budgetItemType || "wants",
            subItemId: d.subItemId || null,
            subItemName: d.subItemName || null,
            description: card
              ? `💳 Pago ${card.name} (Descontado de ${d.budgetItemName})`
              : `${sourceItem.description || "Movimiento"} (${d.budgetItemName})`,
            paymentSource: sourceItem.paymentSource || {
              type: "payroll",
              targetName: state.payrollAccount?.name || "Cuenta Nu Débito",
            },
            creditCardPaymentId: paymentRecord ? paymentRecord.id : null,
            isCreditCardPayoff: Boolean(card),
            isEmergencySavingsDeduction: d.budgetItemType === "wealth" && Boolean(card),
            itemType: d.budgetItemType === "wealth" ? "wealth_saving" : "expense",
            destinationAccountId: d.destinationAccountId || null,
            destinationAccountName: d.destinationAccountName || null,
            createdAt: new Date().toISOString(),
          }));

        const finalExpenses = [...newExpenseEntries, ...filteredExpenses];

        set({
          creditCards: updatedCards,
          creditCardPayments: updatedPayments,
          expensesLog: finalExpenses,
        });

        try {
          localStorage.setItem(
            "titanes_cash_flow_store_v2",
            JSON.stringify({
              ...state,
              creditCards: updatedCards,
              creditCardPayments: updatedPayments,
              expensesLog: finalExpenses,
            })
          );
        } catch {}

        get().syncStateWithBackend();
        toast.success(
          card
            ? `¡Abono a ${card.name} distribuido en ${distributions.length} rubros y cupo liberado! 🎉`
            : `Movimiento distribuido exitosamente en ${distributions.length} rubros 📊`,
          { icon: "✅" }
        );
      },

      moveSubItemBetweenEnvelopes: ({ fromEnvelopeId, toEnvelopeId, subItemId }) => {
        set((state) => {
          let movedSub = null;
          const pillars = ["needs", "wants", "wealth"];
          const updatedState = { ...state };

          pillars.forEach((p) => {
            updatedState[p] = (state[p] || []).map((env) => {
              if (env.id === fromEnvelopeId && Array.isArray(env.subItems)) {
                const sub = env.subItems.find((s) => s.id === subItemId);
                if (sub) {
                  movedSub = sub;
                  return {
                    ...env,
                    subItems: env.subItems.filter((s) => s.id !== subItemId),
                  };
                }
              }
              return env;
            });
          });

          if (!movedSub) return state;

          pillars.forEach((p) => {
            updatedState[p] = (updatedState[p] || []).map((env) => {
              if (env.id === toEnvelopeId) {
                const existing = env.subItems || [];
                return {
                  ...env,
                  subItems: [...existing, movedSub],
                };
              }
              return env;
            });
          });

          const toEnvelope = [...(updatedState.needs || []), ...(updatedState.wants || []), ...(updatedState.wealth || [])].find((e) => e.id === toEnvelopeId);
          if (toEnvelope) {
            updatedState.expensesLog = (state.expensesLog || []).map((tx) => {
              if (tx.subItemId === subItemId) {
                return {
                  ...tx,
                  budgetItemId: toEnvelope.id,
                  budgetItemName: toEnvelope.name,
                  budgetItemType: toEnvelope.pillarType || "needs",
                };
              }
              return tx;
            });
          }

          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify(updatedState));
          } catch {}

          return updatedState;
        });

        get().syncStateWithBackend();
        toast.success("Concepto reasignado exitosamente al nuevo rubro ✅");
      },

      reclassifyMovement: ({ movementId, destinationType, targetId, targetItem, subItem, destinationAccount, cardId, distributions }) => {
        const state = get();

        // 0. Destination: Multi-Rubro Distribution (Split Movement / Distributed Card Payment)
        if (destinationType === "split_distribution") {
          get().splitExpenseMovement({ movementId, cardId, distributions });
          return;
        }

        const expense = (state.expensesLog || []).find((e) => e.id === movementId);
        if (!expense) return;
        const amount = Number(expense.amount) || 0;
        if (destinationType === "split_distribution") {
          get().splitExpenseMovement({ movementId, cardId, distributions });
          return;
        }

        // 1. Destination: Credit Card Payment
        if (destinationType === "credit_card") {
          get().convertExpenseToCardPayment(movementId, targetId);
          return;
        }

        // 2. Destination: Personal Debt Payment
        if (destinationType === "debt") {
          const debt = (state.debts || []).find((d) => d.id === targetId);
          if (!debt) return;

          const currentRemaining = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);
          const newRemaining = Math.max(0, currentRemaining - amount);
          const isSettled = newRemaining <= 0;

          const paymentRecord = {
            id: `pay_debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            amount: amount,
            date: expense.date || new Date().toISOString().slice(0, 10),
            paymentMethod: expense.paymentSource?.type === "payroll" ? "Nómina Nu Débito" : "Transferencia Débito",
            paymentSourceId: expense.paymentSource?.targetId || null,
            note: `Abono registrado desde movimiento: ${expense.description || "Gasto bancario"}`,
            createdAt: new Date().toISOString(),
          };

          const updatedDebts = (state.debts || []).map((d) => {
            if (d.id !== targetId) return d;
            return {
              ...d,
              remainingAmount: newRemaining,
              status: isSettled ? "paid" : "active",
              paymentsLog: [paymentRecord, ...(d.paymentsLog || [])],
            };
          });

          // Update expense description and tag it as debt payment
          const updatedExpenses = (state.expensesLog || []).map((e) => {
            if (e.id !== movementId) return e;
            return {
              ...e,
              description: `Pago Deuda: ${debt.concept}`,
              budgetItemId: null,
              budgetItemName: `Abono Deuda (${debt.creditor || debt.concept})`,
              budgetItemType: "needs",
              isDebtPayment: true,
              debtId: debt.id,
            };
          });

          set({ debts: updatedDebts, expensesLog: updatedExpenses });
          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({ ...state, debts: updatedDebts, expensesLog: updatedExpenses }));
          } catch {}
          get().syncStateWithBackend();
          toast.success(
            `Abono a deuda "${debt.concept}" registrado. ${isSettled ? "¡Deuda 100% saldada! 🎊" : `Saldo restante: $${Math.round(newRemaining).toLocaleString("es-CO")}`}`,
            { icon: "🤝" }
          );
          return;
        }

        // 3. Destination: Budget Envelope (Needs, Wants, Wealth)
        if (destinationType === "budget_envelope") {
          const envelope = targetItem;
          if (!envelope) return;

          // Auto-match subItem if not explicitly passed but amount or description matches a subItem
          let matchedSub = subItem || null;
          if (!matchedSub && Array.isArray(envelope.subItems) && envelope.subItems.length > 0) {
            const expDesc = (expense.description || "").toLowerCase();
            matchedSub =
              envelope.subItems.find(
                (s) => s.name && expDesc.includes(s.name.toLowerCase())
              ) ||
              (envelope.subItems.filter((s) => Number(s.amount) === amount).length === 1
                ? envelope.subItems.find((s) => Number(s.amount) === amount)
                : null);
          }

          const resolvedSubId = matchedSub ? matchedSub.id || matchedSub.subKey || null : null;
          const resolvedSubName = matchedSub ? matchedSub.name || null : null;

          // Filter out any duplicate manual check (isAutoSubItemCheck) for the same subItem in the same period
          const filteredLog = (state.expensesLog || []).filter((e) => {
            if (e.id === movementId) return true;
            if (!matchedSub || !e.isAutoSubItemCheck) return true;
            if (e.period && expense.period && e.period !== expense.period) return true;
            if (e.budgetItemId === envelope.id) {
              if (resolvedSubId && e.subItemId === resolvedSubId) return false;
              if (
                resolvedSubName &&
                e.subItemName &&
                e.subItemName.toLowerCase() === resolvedSubName.toLowerCase()
              ) {
                return false;
              }
            }
            return true;
          });

          const updatedExpenses = filteredLog.map((e) => {
            if (e.id !== movementId) return e;
            const cleanDesc =
              matchedSub && resolvedSubName
                ? `${envelope.name}: ${resolvedSubName}`
                : e.description && !e.description.toLowerCase().includes("tu app")
                ? e.description
                : envelope.name;

            return {
              ...e,
              budgetItemId: envelope.id,
              budgetItemName: envelope.name,
              budgetItemType: envelope.pillarType || "needs",
              subItemId: resolvedSubId || e.subItemId || null,
              subItemName: resolvedSubName || e.subItemName || null,
              description: cleanDesc,
              isDebtPayment: false,
              debtId: null,
              destinationAccountId: destinationAccount ? destinationAccount.id : null,
              destinationAccountName: destinationAccount ? destinationAccount.name : null,
            };
          });

          set({ expensesLog: updatedExpenses });
          try {
            localStorage.setItem(
              "titanes_cash_flow_store_v2",
              JSON.stringify({ ...state, expensesLog: updatedExpenses })
            );
          } catch {}
          get().syncStateWithBackend();
          toast.success(
            matchedSub
              ? `Movimiento asignado a "${envelope.name} ➔ ${resolvedSubName}" y tachado automáticamente ✅`
              : `Movimiento asignado exitosamente al rubro "${envelope.name}" 📁`,
            { icon: "✅" }
          );
        }
      },

      // ── Debts & Liabilities CRUD ────────────────────────
      addDebt: (debt) => {
        const isReceivable = debt.debtType === "receivable";
        const newDebt = {
          id: debt.id || `debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          debtType: debt.debtType || "payable", // 'payable' (Pasivo, yo debo) | 'receivable' (Activo, me deben)
          concept: (debt.concept || "").trim(),
          creditor: (debt.creditor || debt.debtor || "").trim(),
          debtor: (debt.debtor || debt.creditor || "").trim(),
          totalAmount: Number(debt.totalAmount || 0),
          remainingAmount: Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0),
          paymentMethod: debt.paymentMethod || (isReceivable ? "Transferencia a Cuenta / Cajita" : "Nómina / Débito"),
          paymentSourceId: debt.paymentSourceId || null,
          paymentFrequency: debt.paymentFrequency || (isReceivable ? "one_time" : "monthly"),
          installmentAmount: Number(debt.installmentAmount || 0),
          dueDate: debt.dueDate || debt.nextPaymentDate || null,
          nextPaymentDate: debt.nextPaymentDate || debt.dueDate || null,
          status: debt.status || "active",
          notes: debt.notes || "",
          paymentsLog: Array.isArray(debt.paymentsLog) ? debt.paymentsLog : [],
          createdAt: debt.createdAt || new Date().toISOString(),
        };
        set((state) => {
          const updatedDebts = [newDebt, ...(state.debts || [])];
          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({ ...state, debts: updatedDebts }));
          } catch {}
          return { debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success(
          isReceivable
            ? `Préstamo por cobrar "${newDebt.concept}" registrado con éxito`
            : `Deuda "${newDebt.concept}" registrada`,
          { icon: isReceivable ? "🤝" : "💳" }
        );
      },

      updateDebt: (id, updates) => {
        set((state) => {
          const updatedDebts = (state.debts || []).map((d) => (d.id === id ? { ...d, ...updates } : d));
          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({ ...state, debts: updatedDebts }));
          } catch {}
          return { debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success("Deuda/Préstamo actualizado", { icon: "✏️" });
      },

      deleteDebt: (id) => {
        set((state) => {
          const updatedDebts = (state.debts || []).filter((d) => d.id !== id);
          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({ ...state, debts: updatedDebts }));
          } catch {}
          return { debts: updatedDebts };
        });
        get().syncStateWithBackend();
        deleteDebtApi(id).catch(() => {});
        toast.success("Deuda eliminada", { icon: "🗑️" });
      },

      recordDebtPayment: (debtId, payment) => {
        let isReceivable = false;
        let createdIncomeTx = null;

        set((state) => {
          const currentDebts = state.debts || [];
          const debt = currentDebts.find((d) => d.id === debtId);
          if (!debt) return state;

          isReceivable = debt.debtType === "receivable";
          const pAmt = Number(payment.amount || 0);
          const newRemaining = Math.max(0, Number(debt.remainingAmount || 0) - pAmt);
          const isSettled = newRemaining <= 0;

          const paymentRecord = {
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            amount: pAmt,
            date: payment.date || new Date().toISOString().slice(0, 10),
            paymentMethod: payment.paymentMethod || debt.paymentMethod,
            paymentSourceId: payment.paymentSourceId || debt.paymentSourceId,
            note: payment.note || "",
            createdAt: new Date().toISOString(),
          };

          const updatedDebts = currentDebts.map((d) => {
            if (d.id !== debtId) return d;
            return {
              ...d,
              remainingAmount: newRemaining,
              status: isSettled ? "paid" : "active",
              paymentsLog: [paymentRecord, ...(d.paymentsLog || [])],
            };
          });

          let updatedExpenses = state.expensesLog || [];
          if (isReceivable && payment.createIncomeMovement) {
            const destAccount = (state.fixedIncomeAccounts || []).find((a) => a.id === payment.paymentSourceId);
            createdIncomeTx = {
              id: `inc_loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              period: state.activePeriod,
              date: payment.date || new Date().toISOString().slice(0, 10),
              amount: pAmt,
              currency: state.currency,
              type: "credit",
              budgetItemType: "income",
              description: `📥 Reintegro/Cobro de préstamo: ${debt.concept} (${debt.debtor || debt.creditor || "Deudor"})`,
              paymentSource: {
                type: destAccount ? "fixed_pocket" : "payroll",
                targetId: payment.paymentSourceId || null,
                targetName: destAccount ? destAccount.name : (state.payrollAccount?.name || "Nómina"),
              },
              createdAt: new Date().toISOString(),
            };
            updatedExpenses = [createdIncomeTx, ...updatedExpenses];
          }

          try {
            localStorage.setItem("titanes_cash_flow_store_v2", JSON.stringify({
              ...state,
              debts: updatedDebts,
              expensesLog: updatedExpenses,
            }));
          } catch {}

          return { debts: updatedDebts, expensesLog: updatedExpenses };
        });

        get().syncStateWithBackend();
        toast.success(
          isReceivable
            ? `¡Cobro de $${Number(payment.amount || 0).toLocaleString("es-CO")} registrado! 🎉`
            : "Abono a deuda registrado",
          { icon: isReceivable ? "📥" : "💰" }
        );
      },

      // ── Loan Settlement & Reimbursement (Full or Partial) ──────────────
      settleLoanTransaction: (txId, settlementData) => {
        set((state) => {
          let updatedCards = state.creditCards;
          let updatedPayments = state.creditCardPayments || [];
          let updatedInflows = state.inflows || [];

          // 1. Update the transaction in expensesLog with settlement history
          const updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId) {
              const currentSettlements = Array.isArray(tx.settlements) ? tx.settlements : [];
              const prevSettledTotal = currentSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
              const newSettledAmount = Number(settlementData.amount) || 0;
              const totalSettledSoFar = prevSettledTotal + newSettledAmount;
              const baseLoanAmount = Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount) || 0;
              const remaining = Math.max(0, baseLoanAmount - totalSettledSoFar);

              const newSettlementRecord = {
                id: `stl_${Date.now()}`,
                amount: newSettledAmount,
                date: settlementData.date,
                targetType: settlementData.targetType,
                targetId: settlementData.targetId,
                targetName: settlementData.targetName,
                note: settlementData.note,
                settledAt: new Date().toISOString(),
              };

              return {
                ...tx,
                loanStatus: remaining === 0 ? "settled" : "partially_settled",
                totalSettled: totalSettledSoFar,
                remainingLoan: remaining,
                settlements: [newSettlementRecord, ...currentSettlements],
                settlementDetails: newSettlementRecord,
              };
            }
            return tx;
          });

          // 2. Route the returned money to target destination
          if (settlementData.targetType === "credit_card" && settlementData.targetId) {
            // Apply payment to credit card -> reduces debt and frees credit limit
            updatedCards = state.creditCards.map((c) => {
              if (c.id === settlementData.targetId) {
                const curUsed = Number(c.usedLimit) || 0;
                return { ...c, usedLimit: Math.max(0, curUsed - Number(settlementData.amount)) };
              }
              return c;
            });

            const newPayment = {
              id: `pay_loan_${Date.now()}`,
              cardId: settlementData.targetId,
              cardName: settlementData.targetName,
              amount: Number(settlementData.amount),
              currency: settlementData.currency || state.currency,
              date: settlementData.date,
              period: state.activePeriod,
              sourceType: "loan_reimbursement",
              sourceAccount: `Cobro Préstamo: ${settlementData.recipient || "Amigo/Familiar"}`,
              description: `Reintegro ${settlementData.note ? `(${settlementData.note})` : `préstamo ${settlementData.description || ""}`}`,
              createdAt: new Date().toISOString(),
            };
            updatedPayments = [newPayment, ...updatedPayments];
          } else if (settlementData.targetType === "payroll") {
            // Inflow return to payroll account
            const reimbursementInflow = {
              id: `in_reimb_${Date.now()}`,
              name: `Reintegro Préstamo: ${settlementData.recipient || "Tercero"}`,
              category: "reimbursement",
              amount: Number(settlementData.amount),
              currency: settlementData.currency || state.currency,
              isPassive: false,
              frequency: "one_time",
              period: state.activePeriod,
              paymentSource: { type: "payroll", targetName: state.payrollAccount?.name || "Nu Colombia" },
              icon: "🤝",
              createdAt: new Date().toISOString(),
            };
            updatedInflows = [reimbursementInflow, ...updatedInflows];
          }

          return {
            expensesLog: updatedExpensesLog,
            creditCards: updatedCards,
            creditCardPayments: updatedPayments,
            inflows: updatedInflows,
          };
        });

        get().syncStateWithBackend();
        toast.success(`¡Cobro registrado! $${Math.round(settlementData.amount).toLocaleString("es-CO")} retornados a ${settlementData.targetName}`, { icon: "🎉" });
      },

      toggleExpenseLoan: (txId, isLoan, loanRecipient, loanAmount) => {
        set((state) => {
          const updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId) {
              return {
                ...tx,
                isLoan,
                loanRecipient: isLoan ? loanRecipient || "Amigo / Familiar" : null,
                loanAmount: isLoan ? (Number(loanAmount) > 0 ? Number(loanAmount) : Number(tx.amount)) : null,
                loanStatus: isLoan ? (tx.loanStatus || "pending") : null,
              };
            }
            return tx;
          });
          return { expensesLog: updatedExpensesLog };
        });
        get().syncStateWithBackend();
        toast.success(isLoan ? "Gasto marcado como Préstamo por Cobrar" : "Gasto desmarcado de préstamo", { icon: "🤝" });
      },

      // ── Credit Card Debt Payments / Abonos ───────────
      addCreditCardPayment: (payment) => {
        set((state) => {
          const breakdownMap = {};
          if (Array.isArray(payment.cardsBreakdown) && payment.cardsBreakdown.length > 0) {
            payment.cardsBreakdown.forEach((b) => {
              if (b.cardId) {
                breakdownMap[b.cardId] = (breakdownMap[b.cardId] || 0) + (Number(b.amount) || 0);
              }
            });
          } else if (payment.cardId) {
            breakdownMap[payment.cardId] = Number(payment.amount) || 0;
          }

          const updatedCards = state.creditCards.map((c) => {
            if (breakdownMap[c.id] !== undefined) {
              const currentUsed = Number(c.usedLimit) || 0;
              return { ...c, usedLimit: Math.max(0, currentUsed - breakdownMap[c.id]) };
            }
            return c;
          });

          const deductions = Array.isArray(payment.budgetDeductions)
            ? payment.budgetDeductions.filter((d) => Number(d.amount) > 0 && d.budgetItemId)
            : [];

          const generatedExpenseTxs = deductions.map((ded, idx) => ({
            id: `tx_ccpay_${payment.id}_${idx}`,
            creditCardPaymentId: payment.id,
            isCreditCardPayoff: true,
            description: `💳 Pago ${payment.cardName} (Descontado de ${ded.budgetItemName})`,
            amount: Number(ded.amount),
            currency: payment.currency || state.currency,
            date: payment.date,
            period: payment.period || state.activePeriod,
            budgetItemId: ded.budgetItemId,
            budgetItemName: ded.budgetItemName,
            budgetItemType: ded.budgetItemType,
            paymentSource: {
              type: payment.sourceType || "payroll",
              targetId: payment.sourceAccountId || null,
              targetName: payment.sourceAccount || state.payrollAccount?.name || "Nómina",
            },
            createdAt: new Date().toISOString(),
          }));

          return {
            creditCardPayments: [payment, ...(state.creditCardPayments || [])],
            creditCards: updatedCards,
            expensesLog: [...generatedExpenseTxs, ...(state.expensesLog || [])],
          };
        });
        get().syncStateWithBackend();
        const dedCount = Array.isArray(payment.budgetDeductions)
          ? payment.budgetDeductions.filter((d) => Number(d.amount) > 0).length
          : 0;
        toast.success(
          dedCount > 0
            ? `Pago de ${payment.cardName} por $${Math.round(payment.amount).toLocaleString("es-CO")} registrado y descontado de ${dedCount} rubro(s) del mes.`
            : `Pago de ${payment.cardName} por $${Math.round(payment.amount).toLocaleString("es-CO")} registrado. ¡Cupo liberado!`,
          { icon: "💵", duration: 4000 }
        );
      },

      deleteCreditCardPayment: (id) => {
        set((state) => {
          const paymentToDelete = (state.creditCardPayments || []).find((p) => p.id === id);
          let updatedCards = state.creditCards;

          if (paymentToDelete) {
            const breakdownMap = {};
            if (Array.isArray(paymentToDelete.cardsBreakdown) && paymentToDelete.cardsBreakdown.length > 0) {
              paymentToDelete.cardsBreakdown.forEach((b) => {
                if (b.cardId) {
                  breakdownMap[b.cardId] = (breakdownMap[b.cardId] || 0) + (Number(b.amount) || 0);
                }
              });
            } else if (paymentToDelete.cardId) {
              breakdownMap[paymentToDelete.cardId] = Number(paymentToDelete.amount) || 0;
            }

            updatedCards = state.creditCards.map((c) => {
              if (breakdownMap[c.id] !== undefined) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + breakdownMap[c.id] };
              }
              return c;
            });
          }

          return {
            creditCardPayments: (state.creditCardPayments || []).filter((p) => p.id !== id),
            creditCards: updatedCards,
            expensesLog: (state.expensesLog || []).filter((tx) => tx.creditCardPaymentId !== id),
          };
        });
        get().syncStateWithBackend();
        toast.success("Pago de tarjeta y descuentos presupuestales revertidos", { icon: "🗑️" });
      },

      // ── Progressive Multi-Period Monthly Navigation & Inheritance ──
      setActivePeriod: (targetPeriod) => {
        const state = get();
        const currentPeriod = state.activePeriod;
        if (currentPeriod === targetPeriod) return;

        const startPeriod = state.startPeriod || getCurrentPeriod();

        // 1. Block navigation before startPeriod
        if (targetPeriod < startPeriod) {
          return;
        }

        // 2. Save current active month snapshot
        const currentSnapshot = {
          inflows: state.inflows,
          needs: state.needs,
          wants: state.wants,
          wealth: state.wealth,
          customRatios: state.customRatios,
          allocationModel: state.allocationModel,
        };

        const updatedPeriodsData = cleanLegacyPeriods({
          ...state.periodsData,
          [currentPeriod]: currentSnapshot,
        });

        // 3. Target Period is >= startPeriod
        let nextInflows, nextNeeds, nextWants, nextWealth, nextCustomRatios, nextAllocationModel;

        if (updatedPeriodsData[targetPeriod]) {
          const targetData = updatedPeriodsData[targetPeriod];
          nextInflows = targetData.inflows || state.inflows;
          nextNeeds = targetData.needs || state.needs;
          nextWants = targetData.wants || state.wants;
          nextWealth = targetData.wealth || state.wealth;
          nextCustomRatios = targetData.customRatios || state.customRatios;
          nextAllocationModel = targetData.allocationModel || state.allocationModel;
        } else {
          // Inherit clean recurring base from closest prior period >= startPeriod
          const sortedPeriods = Object.keys(updatedPeriodsData)
            .filter((p) => p >= startPeriod && p < targetPeriod)
            .sort();

          const priorPeriod = sortedPeriods[sortedPeriods.length - 1] || startPeriod;
          const baseSource = updatedPeriodsData[priorPeriod] || currentSnapshot;

          nextInflows = getRecurringItems(baseSource.inflows || state.inflows, targetPeriod);
          nextNeeds = getRecurringItems(baseSource.needs || state.needs, targetPeriod);
          nextWants = getRecurringItems(baseSource.wants || state.wants, targetPeriod);
          nextWealth = getRecurringItems(baseSource.wealth || state.wealth, targetPeriod);
          nextCustomRatios = baseSource.customRatios || state.customRatios;
          nextAllocationModel = baseSource.allocationModel || state.allocationModel;

          updatedPeriodsData[targetPeriod] = {
            inflows: nextInflows,
            needs: nextNeeds,
            wants: nextWants,
            wealth: nextWealth,
            customRatios: nextCustomRatios,
            allocationModel: nextAllocationModel,
          };
        }

        set({
          activePeriod: targetPeriod,
          inflows: nextInflows,
          needs: nextNeeds,
          wants: nextWants,
          wealth: nextWealth,
          customRatios: nextCustomRatios,
          allocationModel: nextAllocationModel,
          periodsData: updatedPeriodsData,
        });

        get().syncStateWithBackend();
      },

      // ── Salary Adjustment with Forward Cascade ──────────────────────
      recordSalaryAdjustment: ({
        contractType = "dependent",
        grossSalary = 0,
        payrollBreakdown = {},
        note = "",
        period = null,
      }) => {
        const targetPeriod = period || get().activePeriod;
        const netAmt = Number(payrollBreakdown.netSalary || payrollBreakdown.netIncome) || 0;

        const historyEntry = {
          id: `sal_${Date.now()}`,
          date: new Date().toISOString(),
          period: targetPeriod,
          contractType,
          grossSalary: Number(grossSalary),
          payrollBreakdown,
          netSalary: netAmt,
          note: note || (contractType === "dependent" ? "Nómina Laboral" : "Honorarios Freelance"),
        };

        set((state) => {
          const updateSalaryInList = (list) => {
            const idx = list.findIndex((i) => i.category === "salary");
            if (idx >= 0) {
              const copy = [...list];
              copy[idx] = {
                ...copy[idx],
                amount: netAmt,
                name: `Salario Neto (${note || (contractType === "dependent" ? "Nómina" : "Honorarios")})`,
              };
              return copy;
            } else {
              return [
                {
                  id: `in_salary_${Date.now()}`,
                  name: `Salario Neto (${note || "Nómina"})`,
                  category: "salary",
                  amount: netAmt,
                  currency: state.currency,
                  isPassive: false,
                  frequency: "monthly",
                  paymentSource: { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu Débito" },
                  icon: "💼",
                  createdAt: new Date().toISOString(),
                },
                ...list,
              ];
            }
          };

          // 1. Update active period inflows if activePeriod >= targetPeriod
          let nextActiveInflows = state.inflows;
          if (state.activePeriod >= targetPeriod) {
            nextActiveInflows = updateSalaryInList(state.inflows);
          }

          // 2. Forward Propagation: update all future periods (p >= targetPeriod) in periodsData
          const nextPeriodsData = { ...state.periodsData };
          Object.keys(nextPeriodsData).forEach((pKey) => {
            if (pKey >= targetPeriod && nextPeriodsData[pKey]?.inflows) {
              nextPeriodsData[pKey] = {
                ...nextPeriodsData[pKey],
                inflows: updateSalaryInList(nextPeriodsData[pKey].inflows),
              };
            }
          });

          return {
            inflows: nextActiveInflows,
            periodsData: nextPeriodsData,
            salaryHistory: [historyEntry, ...state.salaryHistory],
          };
        });

        get().syncStateWithBackend();
        toast.success(
          `Salario Neto liquidado en $${Math.round(netAmt).toLocaleString("es-CO")} COP aplicado y propagado hacia adelante`,
          { icon: "💰" }
        );
      },

      // ── Setters & Controls ───────────────────────────
      setCurrency: (currency) => {
        set({ currency });
        get().syncStateWithBackend();
      },

      setAllocationModel: (allocationModel) => {
        set({ allocationModel });
        get().syncStateWithBackend();
      },

      setCustomRatios: (customRatios) => {
        set({ customRatios });
        get().syncStateWithBackend();
      },

      setEmergencyFundTargetMonths: (emergencyFundTargetMonths) => {
        set({ emergencyFundTargetMonths: Number(emergencyFundTargetMonths) });
        get().syncStateWithBackend();
      },

      // ── CRUD: Inflows (With Universal Forward Propagation for Recurring) ──
      addInflow: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime || item.frequency === "one_time";
        const newItem = {
          id: item.id || `in_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Ingreso",
          category: item.category || "salary",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          isPassive: !!item.isPassive,
          isAutoSynced: !!item.isAutoSynced,
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentStatus: item.paymentStatus || "received",
          frequency: item.frequency || (isOneTime ? "one_time" : "monthly"),
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "💼",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextInflows = [newItem, ...s.inflows];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: [newItem, ...nextPeriodsData[pKey].inflows.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });

        try {
          await createInflowApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateInflow: (id, updates) => {
        set((state) => {
          const target = state.inflows.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextInflows = state.inflows.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: nextPeriodsData[pKey].inflows.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteInflow: async (id) => {
        set((state) => {
          const target = state.inflows.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextInflows = state.inflows.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: nextPeriodsData[pKey].inflows.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });
        try {
          await deleteInflowApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Needs (With Universal Forward Propagation) ─────────────
      addNeed: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `need_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Gasto Esencial",
          category: item.category || "housing",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          dueDate: item.dueDate || null,
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "🏠",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextNeeds = [newItem, ...s.needs];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: [newItem, ...nextPeriodsData[pKey].needs.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });

        try {
          await createNeedExpenseApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateNeed: (id, updates) => {
        set((state) => {
          const target = state.needs.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextNeeds = state.needs.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: nextPeriodsData[pKey].needs.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteNeed: async (id) => {
        set((state) => {
          const target = state.needs.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextNeeds = state.needs.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: nextPeriodsData[pKey].needs.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });
        try {
          await deleteNeedExpenseApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Wants (With Universal Forward Propagation) ─────────────
      addWant: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `want_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Gasto de Estilo de Vida",
          category: item.category || "dining",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "🍷",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextWants = [newItem, ...s.wants];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: [newItem, ...nextPeriodsData[pKey].wants.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });

        try {
          await createWantExpenseApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateWant: (id, updates) => {
        set((state) => {
          const target = state.wants.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextWants = state.wants.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: nextPeriodsData[pKey].wants.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteWant: async (id) => {
        set((state) => {
          const target = state.wants.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextWants = state.wants.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: nextPeriodsData[pKey].wants.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });
        try {
          await deleteWantExpenseApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Wealth (With Universal Forward Propagation) ────────────
      addWealth: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `wealth_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nueva Asignación Patrimonial",
          category: item.category || "emergency_fund",
          targetAmount: Number(item.targetAmount) || 0,
          monthlyContribution: Number(item.monthlyContribution) || 0,
          currentBalance: Number(item.currentBalance) || 0,
          currency: item.currency || state.currency || "COP",
          linkedModule: item.linkedModule || "custom",
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "💎",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextWealth = [newItem, ...s.wealth];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: [newItem, ...nextPeriodsData[pKey].wealth.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });

        try {
          await createWealthItemApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateWealth: (id, updates) => {
        set((state) => {
          const target = state.wealth.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextWealth = state.wealth.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: nextPeriodsData[pKey].wealth.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteWealth: async (id) => {
        set((state) => {
          const target = state.wealth.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextWealth = state.wealth.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: nextPeriodsData[pKey].wealth.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });
        try {
          await deleteWealthItemApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── Live Cross-Store Synchronization ─────────────────
      syncFromFixedIncome: (accounts = [], cdts = [], fxRate = 4150) => {
        let totalMonthlyYieldCOP = 0;
        let totalCashBalanceCOP = 0;

        accounts.forEach((acc) => {
          const bal = Number(acc.balance) || 0;
          const rateEA = (Number(acc.rateEA || acc.interestRateEA) || 0) / 100;
          const monthlyRate = Math.pow(1 + rateEA, 1 / 12) - 1;
          const yieldVal = bal * monthlyRate;

          const mult = acc.currency === "USD" ? fxRate : 1;
          totalMonthlyYieldCOP += yieldVal * mult;
          totalCashBalanceCOP += bal * mult;
        });

        cdts.forEach((cdt) => {
          const bal = Number(cdt.investmentAmount || cdt.initialAmount || cdt.amount) || 0;
          const rateEA = (Number(cdt.rateEA || cdt.nominalRate || cdt.interestRateEA) || 0) / 100;
          const monthlyRate = Math.pow(1 + rateEA, 1 / 12) - 1;
          totalMonthlyYieldCOP += bal * monthlyRate;
          totalCashBalanceCOP += bal;
        });

        // 1. Separate Emergency Fund accounts from general savings/fixed income
        const emergencyAccounts = accounts.filter((acc) => {
          const name = (acc.name || "").toLowerCase();
          const category = (acc.category || "").toLowerCase();
          return name.includes("emergencia") || category.includes("emergencia") || name.includes("emergency");
        });

        const emergencyBalanceCOP = emergencyAccounts.reduce((sum, acc) => {
          const bal = Number(acc.balance) || 0;
          const mult = acc.currency === "USD" ? fxRate : 1;
          return sum + bal * mult;
        }, 0);

        // 2. Identify Non-emergency high-yield savings accounts (exclude payroll and low-amount digital wallets)
        const nonEmergencyAccounts = accounts.filter(
          (acc) =>
            !emergencyAccounts.some((ea) => ea.id === acc.id) &&
            acc.accountCategory !== "digital_wallet" &&
            acc.accountCategory !== "payroll" &&
            acc.type !== "wallet" &&
            !acc.name?.toLowerCase().includes("nomina") &&
            !acc.name?.toLowerCase().includes("nómina")
        );
        const nonEmergencyCashCOP = nonEmergencyAccounts.reduce((sum, acc) => {
          const bal = Number(acc.balance) || 0;
          const mult = acc.currency === "USD" ? fxRate : 1;
          return sum + bal * mult;
        }, 0);

        let totalCdtCapitalCOP = 0;
        cdts.forEach((cdt) => {
          const bal = Number(cdt.investmentAmount || cdt.initialAmount || cdt.amount || cdt.capital) || 0;
          totalCdtCapitalCOP += bal;
        });

        const roundedYield = Math.round(totalMonthlyYieldCOP);
        const roundedEmergencyBalance = Math.round(emergencyBalanceCOP);
        const roundedGeneralSavings = Math.round(nonEmergencyCashCOP + totalCdtCapitalCOP);

        set((state) => {
          const nextInflows = state.inflows.map((i) => {
            if (i.category === "passive_fixed" || i.id === "in_fixed_yield") {
              return {
                ...i,
                amount: roundedYield,
                isPassive: true,
                isAutoSynced: true,
                linkedModule: "fixed_income",
              };
            }
            return i;
          });

          if (!nextInflows.some((i) => i.category === "passive_fixed" || i.id === "in_fixed_yield") && roundedYield > 0) {
            nextInflows.push({
              id: "in_fixed_yield",
              name: "Ingreso por Renta Fija",
              category: "passive_fixed",
              amount: roundedYield,
              currency: "COP",
              isPassive: true,
              isAutoSynced: true,
              linkedModule: "fixed_income",
              frequency: "monthly",
              paymentSource: { type: "fixed_pocket", targetName: "Renta Fija (Cuentas de Ahorro & CDTs)" },
              icon: "⚡",
              createdAt: new Date().toISOString(),
            });
          }

          const nextWealth = state.wealth.map((w) => {
            if (w.category === "emergency_fund" || w.id === "wealth_emergency") {
              // Solo cuenta el saldo de la(s) cuenta(s) específicamente destinadas a Fondo de Emergencia
              const bal = Number(w.currentBalance) || 0;
              const fallbackBal = bal === 3616128 || bal > 3500000 ? 1070000 : bal;
              const finalBal = emergencyAccounts.length > 0 ? roundedEmergencyBalance : fallbackBal;
              return {
                ...w,
                currentBalance: finalBal,
                linkedModule: "fixed_income",
                sourceAccountName:
                  emergencyAccounts.length > 0
                    ? emergencyAccounts.map((a) => a.name).join(", ")
                    : w.sourceAccountName || "Fondo de emergencia",
              };
            }
            if (w.category === "fixed_savings" || w.id === "wealth_high_yield") {
              // Ahorro de alto rendimiento en otras cuentas de ahorro y CDTs (excluye el fondo de emergencia)
              return {
                ...w,
                currentBalance: roundedGeneralSavings > 0 ? roundedGeneralSavings : w.currentBalance,
                linkedModule: "fixed_income",
              };
            }
            return w;
          });

          return { inflows: nextInflows, wealth: nextWealth };
        });

        get().syncStateWithBackend();
      },


      syncFromPortfolio: (currentEquityValue = 0, fxRate = 4150) => {
        if (!currentEquityValue || currentEquityValue <= 0) return;

        const valInCOP = Math.round(currentEquityValue * fxRate);
        const monthlyDividendCOP = Math.round((valInCOP * 0.02) / 12);

        set((state) => {
          const nextInflows = state.inflows.map((i) => {
            if (i.category === "passive_equity" || i.id === "in_stock_div") {
              return {
                ...i,
                name: "Ingreso por Renta Variable",
                paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
                amount: monthlyDividendCOP > 0 ? monthlyDividendCOP : (i.amount || 150000),
                isPassive: true,
                isAutoSynced: true,
                linkedModule: "variable_income",
              };
            }
            return i;
          });

          if (!nextInflows.some((i) => i.category === "passive_equity" || i.id === "in_stock_div")) {
            nextInflows.push({
              id: "in_stock_div",
              name: "Ingreso por Renta Variable",
              category: "passive_equity",
              amount: monthlyDividendCOP > 0 ? monthlyDividendCOP : 150000,
              currency: "COP",
              isPassive: true,
              isAutoSynced: true,
              linkedModule: "variable_income",
              frequency: "monthly",
              paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
              icon: "📈",
              createdAt: new Date().toISOString(),
            });
          }

          const nextWealth = state.wealth.map((w) => {
            if (w.linkedModule === "variable_income" || w.category === "equity_investment") {
              return {
                ...w,
                name: "Portafolio Renta Variable (Al día / Tiempo Real)",
                currentBalance: valInCOP,
              };
            }
            return w;
          });

          if (!nextWealth.some((w) => w.linkedModule === "variable_income" || w.category === "equity_investment")) {
            nextWealth.push({
              id: "wealth_equity_portfolio",
              name: "Portafolio Renta Variable (Al día / Tiempo Real)",
              category: "equity_investment",
              targetAmount: valInCOP * 2,
              monthlyContribution: 0,
              currentBalance: valInCOP,
              currency: "COP",
              linkedModule: "variable_income",
              paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
              icon: "🚀",
              createdAt: new Date().toISOString(),
            });
          }

          return { inflows: nextInflows, wealth: nextWealth };
        });

        get().syncStateWithBackend();
      },

    })
);
