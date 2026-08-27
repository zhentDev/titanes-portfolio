import React from "react";
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
  fixedIncomeAccounts = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  onOpenPayrollModal,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);

  // Extract specific Salary Net Inflow
  const salaryItem = inflows.find((i) => i.category === "salary" || i.name?.toLowerCase().includes("salario") || i.name?.toLowerCase().includes("nómina"));
  const netSalaryAmount = salaryItem ? Number(salaryItem.amount) || 0 : totalInflow;

  // 1. Calculate Expenses by Source
  let expensesFromPayroll = 0;
  let expensesFromPockets = 0;
  let expensesFromCredit = 0;

  [...needs, ...wants].forEach((item) => {
    const amt = Number(item.amount) || 0;
    const srcType = item.paymentSource?.type || "payroll";
    if (srcType === "payroll") expensesFromPayroll += amt;
    else if (srcType === "fixed_pocket") expensesFromPockets += amt;
    else if (srcType === "credit_card") expensesFromCredit += amt;
    else expensesFromPayroll += amt;
  });

  // 2. Wealth Contributions by Source
  let savingsFromPayroll = 0;
  wealth.forEach((w) => {
    const amt = Number(w.monthlyContribution) || 0;
    const srcType = w.paymentSource?.type || "payroll";
    if (srcType === "payroll") savingsFromPayroll += amt;
  });

  // 3. Credit Card Bill for the Active Period (Installments to pay)
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

  // 4. Total Real Credit Limits and Debt (Cupo Usado vs Cupo Libre)
  let totalCreditLimit = 0;
  let totalCreditUsed = 0;

  creditCards.forEach((c) => {
    totalCreditLimit += Number(c.totalLimit) || 0;
    totalCreditUsed += Number(c.usedLimit) || 0;
  });

  const totalCreditAvailable = Math.max(0, totalCreditLimit - totalCreditUsed);
  const creditUsagePct = totalCreditLimit > 0 ? ((totalCreditUsed / totalCreditLimit) * 100).toFixed(0) : 0;

  // 5. Real Liquid Cash in Payroll Account (in base COP)
  const realCashPayroll = netSalaryAmount - (expensesFromPayroll + monthlyCreditBill + savingsFromPayroll);

  // 6. Total Balance in High-Yield Savings Accounts (Cajitas Nu, Plenti, etc.) in base COP
  const totalPocketsBalance = fixedIncomeAccounts.reduce((acc, a) => {
    const mult = a.currency === "USD" ? (Number(fxRate) || 4150) : 1;
    return acc + (Number(a.balance) || 0) * mult;
  }, 0);
  const remainingPocketsBalance = Math.max(0, totalPocketsBalance - expensesFromPockets);

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
      {/* Header with Payroll Entity Selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.6rem" }}>💰</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc" }}>
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
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginTop: 3 }}>
              Tu nómina recibida el día {payrollAccount.payDay || 25} respalda tus pagos fijos, tarjetas y aportes a ahorro del próximo mes.
            </span>
          </div>
        </div>

        {/* Change Payroll Account Button */}
        {onOpenPayrollModal && (
          <button
            type="button"
            onClick={onOpenPayrollModal}
            style={{
              background: "rgba(130, 10, 209, 0.18)",
              border: "1px solid rgba(130, 10, 209, 0.45)",
              borderRadius: "12px",
              color: "#d8b4fe",
              padding: "8px 16px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>{payrollAccount.icon || "💜"}</span>
            <span>Cuenta de Nómina: {payrollAccount.name || "Nu Colombia"}</span>
            <span style={{ fontSize: "0.74rem", opacity: 0.85 }}>⚙️ Configurar Ciclo</span>
          </button>
        )}
      </div>

      {/* 4 Multi-Account Liquid Pillars Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18 }}>
        {/* 1. Real Available Cash in Payroll */}
        <div style={{ background: "rgba(13, 18, 38, 0.65)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(16, 185, 129, 0.25)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>💵 Plata Libre en Nómina</span>
              <span style={{ fontSize: "0.74rem", color: "#10b981", fontWeight: 700, background: "rgba(16, 185, 129, 0.12)", padding: "2px 8px", borderRadius: "8px" }}>
                {payrollAccount.name?.split(" ")[0] || "Nu"}
              </span>
            </div>

            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.45rem", fontWeight: 800, color: realCashPayroll >= 0 ? "#10b981" : "#f43f5e" }}>
              {formatMoney(realCashPayroll, currency)}
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
            <div>Salario Neto: <strong style={{ color: "#f8fafc" }}>{formatMoney(netSalaryAmount, currency)}</strong></div>
            <div style={{ marginTop: 2 }}>Gastos/Ahorro: <span style={{ color: "#f43f5e" }}>-{formatMoney(expensesFromPayroll + savingsFromPayroll, currency)}</span></div>
          </div>
        </div>

        {/* 2. Balance in High-Yield Savings Accounts (Cajitas) */}
        <div style={{ background: "rgba(13, 18, 38, 0.65)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(0, 229, 255, 0.25)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>📦 Saldo Cajitas / Renta Fija</span>
              <span style={{ fontSize: "0.74rem", color: "#00e5ff", fontWeight: 700, background: "rgba(0, 229, 255, 0.12)", padding: "2px 8px", borderRadius: "8px" }}>
                Rendimiento
              </span>
            </div>

            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.45rem", fontWeight: 800, color: "#00e5ff" }}>
              {formatMoney(remainingPocketsBalance, currency)}
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
            Total disponible en cuentas Nu / CDTs
          </div>
        </div>

        {/* 3. Total Credit Card Debt / Used Limit */}
        <div style={{ background: "rgba(13, 18, 38, 0.65)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(244, 63, 94, 0.25)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>💳 Cupo Usado / Deuda Tarjetas</span>
              <span style={{ fontSize: "0.74rem", color: "#f43f5e", fontWeight: 700, background: "rgba(244, 63, 94, 0.12)", padding: "2px 8px", borderRadius: "8px" }}>
                {creditUsagePct}% Usado
              </span>
            </div>

            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.45rem", fontWeight: 800, color: totalCreditUsed > 0 ? "#f43f5e" : "#10b981" }}>
              {formatMoney(totalCreditUsed, currency)}
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
            {monthlyCreditBill > 0 ? (
              <span>Factura cuotas este mes: <strong style={{ color: "#f8fafc" }}>{formatMoney(monthlyCreditBill, currency)}</strong></span>
            ) : (
              <span>Deuda total acumulada en todas tus tarjetas</span>
            )}
          </div>
        </div>

        {/* 4. Total Available Free Credit Limit */}
        <div style={{ background: "rgba(13, 18, 38, 0.65)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(168, 85, 247, 0.25)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>🟢 Cupo Libre Real Disponible</span>
              <span style={{ fontSize: "0.74rem", color: "#10b981", fontWeight: 700, background: "rgba(16, 185, 129, 0.12)", padding: "2px 8px", borderRadius: "8px" }}>
                {100 - creditUsagePct}% Libre
              </span>
            </div>

            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.45rem", fontWeight: 800, color: "#10b981" }}>
              {formatMoney(totalCreditAvailable, currency)}
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
            De un cupo total de <strong>{formatMoney(totalCreditLimit, currency)}</strong> otorgado
          </div>
        </div>
      </div>
    </div>
  );
}
