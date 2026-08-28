import React, { useState } from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function RealCashLiquidityCard({
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", color: "#820ad1", icon: "💜" },
  totalInflow = 0,
  inflows = [],
  needs = [],
  wants = [],
  wealth = [],
  creditCards = [],
  creditPurchases = [],
  creditCardPayments = [],
  expensesLog = [],
  fixedIncomeAccounts = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  onOpenPayrollModal,
  onOpenExpenseModal,
  onOpenPaymentModal,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [viewMode, setViewMode] = useState("real_today"); // 'real_today' | 'projected_month'

  // 1. Total Inflow received in Payroll Account
  const payrollInflows = inflows
    .filter((i) => {
      const srcType = i.paymentSource?.type;
      return srcType === "payroll" || !srcType || i.category === "salary" || i.category === "overtime";
    })
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const salaryItem = inflows.find(
    (i) =>
      i.category === "salary" ||
      i.name?.toLowerCase().includes("salario") ||
      i.name?.toLowerCase().includes("nómina")
  );
  const netSalaryAmount =
    payrollInflows > 0 ? payrollInflows : salaryItem ? Number(salaryItem.amount) || 0 : totalInflow;

  // 2. Real Outflows executed from Payroll (Debit) Account (Dinero que YA salió de la cuenta)
  const executedExpensesFromPayroll = (expensesLog || [])
    .filter((tx) => {
      const srcType = tx.paymentSource?.type;
      return (
        srcType === "payroll" ||
        srcType === "debit" ||
        (!srcType && tx.budgetItemType === "needs")
      );
    })
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const executedCardPaymentsFromPayroll = (creditCardPayments || [])
    .filter((p) => {
      const srcType = p.paymentSource?.type;
      return srcType === "payroll" || !srcType;
    })
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const totalExecutedPayrollOutflow =
    executedExpensesFromPayroll + executedCardPaymentsFromPayroll;

  // Real Cash in Payroll Account Right Now (Dinero Líquido Real en Banco Hoy)
  const realCashInPayroll = netSalaryAmount - totalExecutedPayrollOutflow;

  // 3. Pending Commitments for the Rest of the Month (Gastos y Aportes planeados que aún NO han salido)
  let pendingExpensesFromPayroll = 0;
  [...needs, ...wants].forEach((item) => {
    const srcType = item.paymentSource?.type || "payroll";
    if (srcType === "payroll") {
      const itemAmt = Number(item.amount) || 0;
      const itemSpent = (expensesLog || [])
        .filter((tx) => tx.budgetItemId === item.id || tx.budgetItemName === item.name)
        .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
      const remaining = Math.max(0, itemAmt - itemSpent);
      pendingExpensesFromPayroll += remaining;
    }
  });

  let pendingSavingsFromPayroll = 0;
  wealth.forEach((w) => {
    const srcType = w.paymentSource?.type || "payroll";
    if (srcType === "payroll") {
      const targetContribution = Number(w.monthlyContribution) || 0;
      const contributed = (expensesLog || [])
        .filter((tx) => tx.budgetItemId === w.id || tx.budgetItemName === w.name)
        .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
      const remainingToSave = Math.max(0, targetContribution - contributed);
      pendingSavingsFromPayroll += remainingToSave;
    }
  });

  // Credit Card Bill for the Active Period (Installments to pay)
  let monthlyCreditBill = 0;
  creditPurchases.forEach((p) => {
    if (!p.startPeriod || !p.installmentsCount) return;
    const [startYear, startMonth] = p.startPeriod.split("-").map(Number);
    const [activeYear, activeMonth] = activePeriod.split("-").map(Number);
    const monthDiff = (activeYear - startYear) * 12 + (activeMonth - startMonth);
    if (monthDiff >= 0 && monthDiff < p.installmentsCount) {
      monthlyCreditBill += Number(p.monthlyInstallment) || 0;
    }
  });

  const totalPendingPayrollCommitments =
    pendingExpensesFromPayroll + pendingSavingsFromPayroll;

  // 4. Projected Surplus / Remaining Buffer at month end
  const projectedSurplus = realCashInPayroll - totalPendingPayrollCommitments;

  // 5. Total Balance in High-Yield Savings Accounts (Cajitas Nu, Plenti, CDTs, etc.) in base COP
  const totalPocketsBalance = fixedIncomeAccounts.reduce((acc, a) => {
    const mult = a.currency === "USD" ? Number(fxRate) || 4150 : 1;
    return acc + (Number(a.balance) || 0) * mult;
  }, 0);

  // 6. Total Real Credit Limits and Debt (Cupo Usado vs Cupo Libre)
  let totalCreditLimit = 0;
  let totalCreditUsed = 0;

  creditCards.forEach((c) => {
    totalCreditLimit += Number(c.totalLimit) || 0;
    totalCreditUsed += Number(c.usedLimit) || 0;
  });

  const totalCreditAvailable = Math.max(0, totalCreditLimit - totalCreditUsed);
  const creditUsagePct =
    totalCreditLimit > 0
      ? ((totalCreditUsed / totalCreditLimit) * 100).toFixed(0)
      : 0;

  // Total loans receivable
  const totalLoansReceivable = (expensesLog || []).reduce((acc, tx) => {
    if (tx.isLoan && tx.loanStatus !== "settled") {
      const remaining =
        tx.remainingLoan !== undefined
          ? Number(tx.remainingLoan)
          : Number(tx.loanAmount) || Number(tx.amount) || 0;
      return acc + remaining;
    }
    return acc;
  }, 0);

  return (
    <div
      style={{
        background: "rgba(17, 24, 41, 0.8)",
        border: "1px solid rgba(0, 229, 255, 0.2)",
        borderRadius: "20px",
        padding: "24px 28px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 10px 32px rgba(0, 0, 0, 0.35)",
      }}
    >
      {/* Header with Payroll Entity Selector & View Mode Switcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.6rem" }}>💰</span>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "#f8fafc",
                }}
              >
                Disponibilidad Real de Plata Líquida & Fondos
              </h4>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "8px",
                  background: "rgba(130, 10, 209, 0.2)",
                  color: "#d8b4fe",
                  border: "1px solid rgba(130, 10, 209, 0.35)",
                }}
              >
                🗓️ Pago Día {payrollAccount.payDay || 25} • Fondeo Mes Entrante
              </span>
            </div>
            <span
              style={{
                fontSize: "0.8rem",
                color: "#94a3b8",
                display: "block",
                marginTop: 3,
              }}
            >
              Distingue entre la plata que <strong>realmente tienes en el banco hoy</strong> y lo que tienes comprometido a gastar o invertir.
            </span>
          </div>
        </div>

        {/* View Mode Switcher & Payroll Account Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              background: "rgba(13, 18, 38, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "3px",
              display: "inline-flex",
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("real_today")}
              style={{
                background:
                  viewMode === "real_today"
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : "transparent",
                color: viewMode === "real_today" ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              💵 Saldo Real en Banco Hoy
            </button>
            <button
              type="button"
              onClick={() => setViewMode("projected_month")}
              style={{
                background:
                  viewMode === "projected_month"
                    ? "linear-gradient(135deg, #820ad1 0%, #6366f1 100%)"
                    : "transparent",
                color: viewMode === "projected_month" ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              📅 Proyección Cierre de Mes
            </button>
          </div>

          {onOpenPayrollModal && (
            <button
              type="button"
              onClick={onOpenPayrollModal}
              style={{
                background: "rgba(130, 10, 209, 0.18)",
                border: "1px solid rgba(130, 10, 209, 0.45)",
                borderRadius: "12px",
                color: "#d8b4fe",
                padding: "8px 14px",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>{payrollAccount.icon || "💜"}</span>
              <span>{payrollAccount.name || "Nu Colombia"}</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>⚙️</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Multi-Account Liquid Pillars Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        {/* 1. Real Available Cash in Payroll */}
        <div
          style={{
            background: "rgba(13, 18, 38, 0.75)",
            borderRadius: "16px",
            padding: "18px 20px",
            border:
              viewMode === "real_today"
                ? "1px solid rgba(16, 185, 129, 0.45)"
                : "1px solid rgba(130, 10, 209, 0.45)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
            boxShadow:
              viewMode === "real_today"
                ? "0 4px 20px rgba(16, 185, 129, 0.08)"
                : "0 4px 20px rgba(130, 10, 209, 0.08)",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>💵</span>
                <span>
                  {viewMode === "real_today"
                    ? "Saldo Real en Cuenta Nómina"
                    : "Colchón Libre Proyectado (Fin Mes)"}
                </span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: viewMode === "real_today" ? "#10b981" : "#c084fc",
                  fontWeight: 700,
                  background:
                    viewMode === "real_today"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(130, 10, 209, 0.15)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {viewMode === "real_today" ? "Disponible Hoy" : "Tras Todo lo Planeado"}
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 800,
                color:
                  viewMode === "real_today"
                    ? realCashInPayroll >= 0
                      ? "#10b981"
                      : "#f43f5e"
                    : projectedSurplus >= 0
                    ? "#38bdf8"
                    : "#f43f5e",
              }}
            >
              {viewMode === "real_today"
                ? formatMoney(realCashInPayroll, currency)
                : formatMoney(projectedSurplus, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {viewMode === "real_today" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Ingresos Nómina:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    +{formatMoney(netSalaryAmount, currency)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gastos / Pagos ya Salidos:</span>
                  <span style={{ color: "#f43f5e", fontWeight: 700 }}>
                    -{formatMoney(totalExecutedPayrollOutflow, currency)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginTop: 2 }}>
                  <span>Compromisos por salir:</span>
                  <span>-{formatMoney(totalPendingPayrollCommitments, currency)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Saldo en Banco Hoy:</span>
                  <strong style={{ color: "#10b981" }}>
                    {formatMoney(realCashInPayroll, currency)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gastos Débito Pendientes:</span>
                  <span style={{ color: "#f59e0b" }}>
                    -{formatMoney(pendingExpensesFromPayroll, currency)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Aportes Ahorro por Transferir:</span>
                  <span style={{ color: "#38bdf8" }}>
                    -{formatMoney(pendingSavingsFromPayroll, currency)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2. Balance in High-Yield Savings Accounts (Cajitas) */}
        <div
          style={{
            background: "rgba(13, 18, 38, 0.75)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(0, 229, 255, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📦</span>
                <span>Saldo Cajitas / Renta Fija</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#00e5ff",
                  fontWeight: 700,
                  background: "rgba(0, 229, 255, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                Rendimiento
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "#00e5ff",
              }}
            >
              {formatMoney(totalPocketsBalance, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Rendimientos mes:</span>
              <strong style={{ color: "#10b981" }}>
                +{formatMoney(inflows.find((i) => i.category === "passive_fixed")?.amount || 16706, currency)}
              </strong>
            </div>
            <div style={{ color: "#64748b" }}>
              Total disponible en cuentas Nu (Cajitas) / CDTs
            </div>
          </div>
        </div>

        {/* 3. Total Credit Card Debt / Used Limit */}
        <div
          style={{
            background: "rgba(13, 18, 38, 0.75)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>💳</span>
                <span>Cupo Usado / Deuda Tarjetas</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#f43f5e",
                  fontWeight: 700,
                  background: "rgba(244, 63, 94, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {creditUsagePct}% Usado
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: totalCreditUsed > 0 ? "#f43f5e" : "#10b981",
              }}
            >
              {formatMoney(totalCreditUsed, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {totalLoansReceivable > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#fcd34d" }}>
                <span>🤝 Por cobrar a terceros:</span>
                <strong>{formatMoney(totalLoansReceivable, currency)}</strong>
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>
                Deuda total acumulada en todas tus tarjetas
              </div>
            )}
            {onOpenPaymentModal && (
              <button
                type="button"
                onClick={onOpenPaymentModal}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#10b981",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                  fontWeight: 700,
                  textDecoration: "underline",
                  marginTop: 2,
                }}
              >
                ⚡ Registrar Pago / Liberar Cupo
              </button>
            )}
          </div>
        </div>

        {/* 4. Total Available Free Credit Limit */}
        <div
          style={{
            background: "rgba(13, 18, 38, 0.75)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(168, 85, 247, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🟢</span>
                <span>Cupo Libre Real Disponible</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#10b981",
                  fontWeight: 700,
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {100 - Number(creditUsagePct)}% Libre
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "#10b981",
              }}
            >
              {formatMoney(totalCreditAvailable, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Cupo total otorgado:</span>
              <strong style={{ color: "#f8fafc" }}>
                {formatMoney(totalCreditLimit, currency)}
              </strong>
            </div>
            <div style={{ color: "#64748b" }}>
              Capacidad disponible de crédito no utilizado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
