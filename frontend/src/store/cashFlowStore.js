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
  fetchCashFlowData,
  syncCashFlowStateApi,
} from "../api/client";
import { getCurrentPeriod } from "../utils/periodUtils";

const DEFAULT_RATIOS = {
  needs: 35,
  wants: 30,
  savings: 35,
};

const DEFAULT_PAYROLL_ACCOUNT = {
  entityId: "nu",
  name: "Nu Colombia (Cuenta Nu Débito)",
  accountType: "Ahorros / Débito",
  accountNumber: "*1234",
  color: "#820ad1",
  icon: "💜",
  payDay: 25,
  targetCycle: "next_month",
  paymentFrequency: "monthly",
};

const DEFAULT_CREDIT_CARDS = [
  {
    id: "cc_nu",
    name: "Tarjeta Nu Mastercard",
    bankId: "nu",
    color: "#820ad1",
    icon: "💜",
    totalLimit: 5000000.0,
    closingDay: 15,
    paymentDay: 2,
    rateEA: 24.5,
    currency: "COP",
    cardType: "Gold / Platinum",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cc_rappi",
    name: "RappiCard Visa (MSI)",
    bankId: "rappi",
    color: "#ff441f",
    icon: "🧡",
    totalLimit: 3500000.0,
    closingDay: 20,
    paymentDay: 5,
    rateEA: 24.0,
    currency: "COP",
    cardType: "Cashback / MSI",
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_CREDIT_PURCHASES = [
  {
    id: "cp_1",
    cardId: "cc_rappi",
    cardName: "RappiCard Visa (MSI)",
    description: "Compra Mercado Libre (0% Interés)",
    totalAmount: 600000.0,
    installmentsCount: 6,
    startPeriod: "2026-08",
    interestType: "zero_interest", // 'zero_interest' (MSI) | 'standard_interest'
    rateEA: 0,
    monthlyInstallment: 100000.0,
    totalInterest: 0,
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_INFLOWS = [
  {
    id: "in_salary",
    name: "Salario Neto (Nómina)",
    category: "salary",
    amount: 3662854.0,
    currency: "COP",
    isPassive: false,
    frequency: "monthly",
    paymentSource: { type: "payroll", targetName: "Nu Colombia (Cuenta Nu Débito)" },
    icon: "💼",
    createdAt: new Date().toISOString(),
  },
  {
    id: "in_fixed_yield",
    name: "Rendimientos Cajitas Nu & CDTs",
    category: "passive_fixed",
    amount: 385000.0,
    currency: "COP",
    isPassive: true,
    isAutoSynced: true,
    linkedModule: "fixed_income",
    frequency: "monthly",
    paymentSource: { type: "fixed_pocket", targetName: "Cajitas Nu & CDTs" },
    icon: "⚡",
    createdAt: new Date().toISOString(),
  },
  {
    id: "in_stock_div",
    name: "Dividendos Titanes Tech ETF",
    category: "passive_equity",
    amount: 150000.0,
    currency: "COP",
    isPassive: true,
    isAutoSynced: true,
    linkedModule: "variable_income",
    frequency: "monthly",
    paymentSource: { type: "investment_cash", targetName: "Portafolio Titanes Tech" },
    icon: "📈",
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_NEEDS = [
  {
    id: "need_housing",
    name: "Arriendo / Vivienda & Admin",
    category: "housing",
    amount: 1200000.0,
    currency: "COP",
    dueDate: null,
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🏠",
    createdAt: new Date().toISOString(),
  },
  {
    id: "need_utilities",
    name: "Servicios Públicos, Luz & Fibra Óptica",
    category: "utilities",
    amount: 280000.0,
    currency: "COP",
    dueDate: null,
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "💡",
    createdAt: new Date().toISOString(),
  },
  {
    id: "need_groceries",
    name: "Alimentación & Supermercado",
    category: "groceries",
    amount: 700000.0,
    currency: "COP",
    dueDate: null,
    paymentSource: { type: "credit_card", targetId: "cc_nu", targetName: "Tarjeta Nu (1 cuota 0%)", installments: 1 },
    icon: "🛒",
    createdAt: new Date().toISOString(),
  },
  {
    id: "need_health_transport",
    name: "Salud, EPS & Transporte",
    category: "health_transport",
    amount: 320000.0,
    currency: "COP",
    dueDate: null,
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🏥",
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_WANTS = [
  {
    id: "want_dining",
    name: "Restaurantes, Cafés & Salidas",
    category: "dining",
    amount: 350000.0,
    currency: "COP",
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🍷",
    createdAt: new Date().toISOString(),
  },
  {
    id: "want_subs",
    name: "Suscripciones (Netflix, Spotify, Gym)",
    category: "subscriptions",
    amount: 150000.0,
    currency: "COP",
    paymentSource: { type: "credit_card", targetId: "cc_rappi", targetName: "RappiCard (1 cuota)", installments: 1 },
    icon: "🍿",
    createdAt: new Date().toISOString(),
  },
  {
    id: "want_leisure",
    name: "Ocio, Hobbies & Compras",
    category: "leisure",
    amount: 200000.0,
    currency: "COP",
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🎮",
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_WEALTH = [
  {
    id: "wealth_emergency",
    name: "Fondo de Emergencia (6 Meses)",
    category: "emergency_fund",
    targetAmount: 15000000.0,
    monthlyContribution: 500000.0,
    currentBalance: 8500000.0,
    currency: "COP",
    linkedModule: "fixed_income",
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🛡️",
    createdAt: new Date().toISOString(),
  },
  {
    id: "wealth_tech_etf",
    name: "Aporte Titanes Tech ETF (15 Acciones)",
    category: "equity_investment",
    targetAmount: 30000000.0,
    monthlyContribution: 500000.0,
    currentBalance: 6200000.0,
    currency: "COP",
    linkedModule: "variable_income",
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🚀",
    createdAt: new Date().toISOString(),
  },
  {
    id: "wealth_high_yield",
    name: "Ahorro Alto Rendimiento (Nu / Plenti / CDTs)",
    category: "fixed_savings",
    targetAmount: 15000000.0,
    monthlyContribution: 300000.0,
    currentBalance: 4900000.0,
    currency: "COP",
    linkedModule: "fixed_income",
    paymentSource: { type: "payroll", targetName: "Cuenta Nu Débito" },
    icon: "🏦",
    createdAt: new Date().toISOString(),
  },
  {
    id: "wealth_travel_goal",
    name: "Meta Viaje / Estudio",
    category: "medium_term_goal",
    targetAmount: 8000000.0,
    monthlyContribution: 150000.0,
    currentBalance: 1500000.0,
    currency: "COP",
    linkedModule: "custom",
    paymentSource: { type: "fixed_pocket", targetName: "Cajita Viaje Nu" },
    icon: "✈️",
    createdAt: new Date().toISOString(),
  },
];

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
    startPeriod: getCurrentPeriod(), // Dynamic start month for the user (e.g. "2026-08")
    activePeriod: getCurrentPeriod(), // Currently viewed period
    currency: "COP", // 'COP' | 'USD'
    allocationModel: "50_30_20", // '50_30_20' | 'pay_yourself_first' | 'envelope'
    customRatios: DEFAULT_RATIOS,
    emergencyFundTargetMonths: 6,
    payrollAccount: DEFAULT_PAYROLL_ACCOUNT,
    creditCards: DEFAULT_CREDIT_CARDS,
    creditPurchases: DEFAULT_CREDIT_PURCHASES,
    creditCardPayments: [],
    expensesLog: [],
    inflows: DEFAULT_INFLOWS,
    needs: DEFAULT_NEEDS,
    wants: DEFAULT_WANTS,
    wealth: DEFAULT_WEALTH,
    salaryHistory: [],
    periodsData: {}, // Multi-month snapshots: { [period]: { inflows, needs, wants, wealth, customRatios, allocationModel } }
    isInitialized: false,
    isSyncing: false,

    // ── Initialization directly from Local Backend Database (SSOT) ──
    initFetchCashFlow: async () => {
      try {
        const res = await fetchCashFlowData();
        if (!res) {
          set({ isInitialized: true });
          return;
        }

        const startP = res.startPeriod || getCurrentPeriod();
        let activeP = res.activePeriod || getCurrentPeriod();
        if (activeP < startP) {
          activeP = startP;
        }

        set({
          startPeriod: startP,
          activePeriod: activeP,
          currency: res.currency || "COP",
          allocationModel: res.allocationModel || "50_30_20",
          customRatios: res.customRatios || DEFAULT_RATIOS,
          emergencyFundTargetMonths: res.emergencyFundTargetMonths ?? 6,
          payrollAccount: res.payrollAccount || DEFAULT_PAYROLL_ACCOUNT,
          creditCards: res.creditCards?.length > 0 ? res.creditCards : DEFAULT_CREDIT_CARDS,
          creditPurchases: res.creditPurchases || DEFAULT_CREDIT_PURCHASES,
          creditCardPayments: res.creditCardPayments || [],
          expensesLog: res.expensesLog || [],
          inflows: res.inflows?.length > 0 ? res.inflows : DEFAULT_INFLOWS,
          needs: res.needs?.length > 0 ? res.needs : DEFAULT_NEEDS,
          wants: res.wants?.length > 0 ? res.wants : DEFAULT_WANTS,
          wealth: res.wealth?.length > 0 ? res.wealth : DEFAULT_WEALTH,
          salaryHistory: res.salaryHistory || [],
          periodsData: res.periodsData || {},
          isInitialized: true,
        });
      } catch (err) {
        console.error("[CashFlow] Failed to load data from backend database:", err);
        set({ isInitialized: true });
      }
    },

      syncStateWithBackend: async () => {
        const state = get();
        set({ isSyncing: true });
        try {
          await syncCashFlowStateApi({
            activePeriod: state.activePeriod,
            currency: state.currency,
            allocationModel: state.allocationModel,
            customRatios: state.customRatios,
            emergencyFundTargetMonths: state.emergencyFundTargetMonths,
            payrollAccount: state.payrollAccount,
            creditCards: state.creditCards,
            creditPurchases: state.creditPurchases,
            creditCardPayments: state.creditCardPayments,
            expensesLog: state.expensesLog,
            inflows: state.inflows,
            needs: state.needs,
            wants: state.wants,
            wealth: state.wealth,
            periodsData: state.periodsData,
          });
        } catch (err) {
          console.error("[CashFlow] Error syncing to backend:", err);
        } finally {
          set({ isSyncing: false });
        }
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

          return {
            expensesLog: (state.expensesLog || []).filter((tx) => tx.id !== id),
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        toast.success("Gasto real eliminado", { icon: "🗑️" });
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
          const updatedCards = state.creditCards.map((c) => {
            if (c.id === payment.cardId) {
              const currentUsed = Number(c.usedLimit) || 0;
              return { ...c, usedLimit: Math.max(0, currentUsed - Number(payment.amount)) };
            }
            return c;
          });

          return {
            creditCardPayments: [payment, ...(state.creditCardPayments || [])],
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        toast.success(`Pago de ${payment.cardName} por $${Math.round(payment.amount).toLocaleString("es-CO")} registrado. ¡Cupo liberado!`, { icon: "💵" });
      },

      deleteCreditCardPayment: (id) => {
        set((state) => {
          const paymentToDelete = (state.creditCardPayments || []).find((p) => p.id === id);
          let updatedCards = state.creditCards;

          if (paymentToDelete) {
            updatedCards = state.creditCards.map((c) => {
              if (c.id === paymentToDelete.cardId) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + Number(paymentToDelete.amount) };
              }
              return c;
            });
          }

          return {
            creditCardPayments: (state.creditCardPayments || []).filter((p) => p.id !== id),
            creditCards: updatedCards,
          };
        });
        get().syncStateWithBackend();
        toast.success("Pago de tarjeta revertido", { icon: "🗑️" });
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

        const roundedYield = Math.round(totalMonthlyYieldCOP);
        const roundedBalance = Math.round(totalCashBalanceCOP);

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
              name: "Rendimientos Cajitas Nu & CDTs",
              category: "passive_fixed",
              amount: roundedYield,
              currency: "COP",
              isPassive: true,
              isAutoSynced: true,
              linkedModule: "fixed_income",
              frequency: "monthly",
              icon: "⚡",
              createdAt: new Date().toISOString(),
            });
          }

          const nextWealth = state.wealth.map((w) => {
            if (w.linkedModule === "fixed_income" || w.category === "fixed_savings") {
              return {
                ...w,
                currentBalance: roundedBalance > 0 ? roundedBalance : w.currentBalance,
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
                amount: monthlyDividendCOP > 0 ? monthlyDividendCOP : i.amount,
                isPassive: true,
                isAutoSynced: true,
                linkedModule: "variable_income",
              };
            }
            return i;
          });

          const nextWealth = state.wealth.map((w) => {
            if (w.linkedModule === "variable_income" || w.category === "equity_investment") {
              return {
                ...w,
                currentBalance: valInCOP,
              };
            }
            return w;
          });
          return { inflows: nextInflows, wealth: nextWealth };
        });

        get().syncStateWithBackend();
      },
    })
);
