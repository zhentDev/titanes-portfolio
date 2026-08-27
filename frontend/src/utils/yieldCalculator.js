/**
 * Compound Interest & Historical Yield Engine for Savings Accounts & CDTs.
 * Computes exact daily compound interest across historical interest rate brackets (base 360),
 * and models the full lifecycle integration between liquid Cajitas and Term Deposits (CDTs).
 */

export function calculateAccountYield(account, transactions = [], historicalRates = null, allCDTs = [], asOfDate = null) {
  if (!account) {
    return {
      netCapital: 0,
      liquidNetCapital: 0,
      liquidEarnedInterest: 0,
      liquidTotalBalance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalEarnedInterest: 0,
      totalCalculatedBalance: 0,
      activeCDTsCount: 0,
      activeCDTsCapital: 0,
      activeCDTsAccruedInterest: 0,
      activeCDTsList: [],
      maturedCDTsCount: 0,
      maturedCDTsTotalCapital: 0,
      maturedCDTsTotalProfit: 0,
      maturedCDTsList: [],
      consolidatedTotal: 0,
      consolidatedNetCapital: 0,
      consolidatedTotalYield: 0,
      periodBreakdown: [],
    };
  }

  // 1. Resolve rates for entity
  const entityId = account.entityId || "ent_nu";
  let entityRates = historicalRates?.entities?.[entityId]?.savings_rates;
  
  if (!entityRates && historicalRates?.entities) {
    const entName = (account.entityName || "").toLowerCase();
    for (const [k, v] of Object.entries(historicalRates.entities)) {
      const kClean = k.toLowerCase().replace("ent_", "");
      const vClean = (v.name || "").toLowerCase();
      if ((entName && (kClean.includes(entName) || vClean.includes(entName))) || (entityId && entityId.includes(kClean))) {
        entityRates = v.savings_rates;
        break;
      }
    }
  }

  // Nu default fallback only if entity is Nu
  if (!entityRates && (entityId === "ent_nu" || entityId.includes("nu"))) {
    entityRates = [
      { from: "2023-06-01", to: "2024-10-07", rateEA: 13.0, notes: "13% E.A." },
      { from: "2024-10-08", to: "2024-12-09", rateEA: 12.0, notes: "12% E.A." },
      { from: "2024-12-10", to: "2025-03-09", rateEA: 11.0, notes: "11% E.A." },
      { from: "2025-03-10", to: "2025-05-08", rateEA: 9.5, notes: "9.5% E.A." },
      { from: "2025-05-09", to: "2025-08-11", rateEA: 9.25, notes: "9.25% E.A." },
      { from: "2025-08-12", to: "2026-02-05", rateEA: 8.25, notes: "8.25% E.A." },
      { from: "2026-02-06", to: "2026-04-08", rateEA: 8.75, notes: "8.75% E.A." },
      { from: "2026-04-09", to: "2099-12-31", rateEA: 9.30, notes: "9.30% E.A." },
    ];
  }

  const tieredRates = account.tieredRates || [];

  const getRateForDateAndBalance = (dateStr, balance = 0) => {
    // 1. If account is crypto / commodity or has an explicit rateEA, prioritize it!
    if (account.type === "crypto" || (account.interestRateEA && Number(account.interestRateEA) > 0 && !tieredRates.length)) {
      return Number(account.interestRateEA);
    }

    // 2. Dynamic balance tiers (e.g. Plenti Bolsillo Visible USD tiers)
    if (tieredRates.length > 0 && account.type !== "crypto") {
      for (const tier of tieredRates) {
        if (balance <= (tier.maxBalance || Infinity)) {
          return Number(tier.rateEA || 3.0);
        }
      }
      return Number(tieredRates[tieredRates.length - 1].rateEA || 3.0);
    }

    // 3. Historical date brackets for entity (e.g. Nu Colombia)
    if (entityRates && entityRates.length > 0 && account.type !== "crypto") {
      for (const r of entityRates) {
        if (dateStr >= r.from && dateStr <= r.to) {
          return Number(r.rateEA || account.interestRateEA || (account.currency === "USD" ? 3.0 : 9.30));
        }
      }
    }

    return Number(account.interestRateEA || (account.currency === "USD" ? 3.0 : 9.30));
  };

  // 2. Resolve CDTs linked to this account
  const accNameLower = (account.name || "").toLowerCase().replace("cajita", "").trim();
  const linkedCDTs = (allCDTs || []).filter((c) => {
    if (c.entityId !== account.entityId) return false;
    const catLower = (c.category || "").toLowerCase();
    const nameLower = (c.name || "").toLowerCase();
    return (
      (accNameLower && (catLower.includes(accNameLower) || nameLower.includes(accNameLower))) ||
      c.accountId === account.id
    );
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let activeCDTsCapital = 0;
  let activeCDTsAccruedInterest = 0;
  const activeCDTsList = [];

  let maturedCDTsTotalCapital = 0;
  let maturedCDTsTotalProfit = 0;
  const maturedCDTsList = [];

  linkedCDTs.forEach((cdt) => {
    const startD = new Date(cdt.startDate || new Date().toISOString().slice(0, 10));
    startD.setHours(0, 0, 0, 0);
    const maturityD = new Date(cdt.maturityDate || cdt.startDate);
    maturityD.setHours(0, 0, 0, 0);

    const termDays = Number(cdt.termDays || 180);
    const rateDecimal = Number(cdt.interestRateEA || 0) / 100;
    const reteMul = 1 - Number(cdt.reteFuentePct || 4) / 100;
    const capital = Number(cdt.capital || 0);

    const isMatured = cdt.status === "matured" || maturityD < today;
    const daysElapsed = Math.max(0, Math.min(termDays, Math.floor((today - startD) / (1000 * 60 * 60 * 24))));

    // Base 360 commercial standard
    const accruedYield = capital * (Math.pow(1 + rateDecimal, daysElapsed / 360) - 1) * reteMul;
    const finalProfit = capital * (Math.pow(1 + rateDecimal, termDays / 360) - 1) * reteMul;

    if (isMatured) {
      maturedCDTsTotalCapital += capital;
      maturedCDTsTotalProfit += finalProfit;
      maturedCDTsList.push({
        ...cdt,
        finalProfit,
        termDays,
        isMatured: true,
      });
    } else {
      activeCDTsCapital += capital;
      activeCDTsAccruedInterest += accruedYield;
      activeCDTsList.push({
        ...cdt,
        accruedYield,
        finalProfit,
        daysElapsed,
        termDays,
        isMatured: false,
      });
    }
  });

  // 3. Filter & Sort Transactions for Liquid Pocket
  const sortedTx = [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let explicitInterestTotal = 0;
  const txByDate = {};
  const interestByDate = {};

  for (const t of sortedTx) {
    const d = t.date || new Date().toISOString().slice(0, 10);
    const amt = Math.abs(Number(t.amount || 0));
    const descLower = (t.description || "").toLowerCase();
    const isInterest =
      t.isInterestPayout ||
      descLower.includes("rendimiento") ||
      descLower.includes("interés") ||
      descLower.includes("interes");

    const isDebit =
      !isInterest &&
      (t.type === "debit" ||
        descLower.includes("retiraste") ||
        descLower.includes("retiro") ||
        descLower.includes("invertiste") ||
        Number(t.amount) < 0);

    if (isInterest) {
      explicitInterestTotal += amt;
      interestByDate[d] = (interestByDate[d] || 0) + amt;
    } else if (isDebit) {
      totalWithdrawals += amt;
      txByDate[d] = (txByDate[d] || 0) - amt;
    } else {
      totalDeposits += amt;
      txByDate[d] = (txByDate[d] || 0) + amt;
    }
  }

  const netCapital = totalDeposits - totalWithdrawals;

  if (sortedTx.length === 0) {
    const baseBal = Number(account.balance || 0);
    return {
      netCapital: baseBal,
      liquidNetCapital: baseBal,
      liquidEarnedInterest: 0,
      liquidTotalBalance: baseBal,
      totalDeposits: baseBal,
      totalWithdrawals: 0,
      totalEarnedInterest: 0,
      totalCalculatedBalance: baseBal,
      activeCDTsCount: activeCDTsList.length,
      activeCDTsCapital,
      activeCDTsAccruedInterest,
      activeCDTsList,
      maturedCDTsCount: maturedCDTsList.length,
      maturedCDTsTotalCapital,
      maturedCDTsTotalProfit,
      maturedCDTsList,
      consolidatedTotal: baseBal + activeCDTsCapital + activeCDTsAccruedInterest,
      consolidatedNetCapital: baseBal + activeCDTsCapital,
      consolidatedTotalYield: activeCDTsAccruedInterest + maturedCDTsTotalProfit,
      periodBreakdown: [],
    };
  }

  // 4. Daily Compound Interest Simulation for Liquid Balance
  const startDateStr = sortedTx[0].date || new Date().toISOString().slice(0, 10);
  const endDateStr = asOfDate || new Date().toISOString().slice(0, 10);

  const startDate = new Date(startDateStr + "T00:00:00");
  const endDate = new Date(endDateStr + "T00:00:00");

  let currBalance = 0;
  let simulatedInterest = 0;

  // Track matured CDT injections by maturity date
  const maturedCdtByDate = {};
  maturedCDTsList.forEach((m) => {
    const matD = m.maturityDate || m.startDate;
    maturedCdtByDate[matD] = (maturedCdtByDate[matD] || 0) + Number(m.finalProfit || 0);
  });

  // Period tracking
  const periodMap = new Map();

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dStr = d.toISOString().slice(0, 10);

    // Apply manual capital movements of the day
    if (txByDate[dStr]) {
      currBalance = Math.max(0, currBalance + txByDate[dStr]);
    }

    // Apply explicit recorded interest payouts
    if (interestByDate[dStr]) {
      currBalance = Math.max(0, currBalance + interestByDate[dStr]);
    }

    // Apply closed CDT returns if matured on this day
    if (maturedCdtByDate[dStr]) {
      currBalance = Math.max(0, currBalance + maturedCdtByDate[dStr]);
    }

    // If account has explicit recorded interest transactions (e.g. Finandina monthly payouts),
    // we do not synthesize daily compound interest on top of recorded payouts.
    if (explicitInterestTotal === 0) {
      const rateEA = getRateForDateAndBalance(dStr, currBalance);
      // Colombian banking standard (SFC) for high-yield savings: base 360 days
      const dailyRate = Math.pow(1 + rateEA / 100, 1 / 360) - 1;
      const dailyInterest = currBalance * dailyRate;

      simulatedInterest += dailyInterest;
      currBalance += dailyInterest;

      // Track period
      const periodKey = `rate_${rateEA}`;
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, {
          rateEA,
          startDate: dStr,
          endDate: dStr,
          days: 0,
          interestEarned: 0,
          startBalance: currBalance - dailyInterest,
          endBalance: currBalance,
        });
      }
      const pInfo = periodMap.get(periodKey);
      pInfo.days += 1;
      pInfo.interestEarned += dailyInterest;
      pInfo.endDate = dStr;
      pInfo.endBalance = currBalance;
    }
  }

  const finalEarnedInterest = explicitInterestTotal > 0 ? explicitInterestTotal : simulatedInterest;
  const liquidTotal = Math.max(0, netCapital + finalEarnedInterest);

  const periodBreakdown = Array.from(periodMap.values());

  return {
    // Líquido Cajita
    netCapital: Math.max(0, netCapital),
    liquidNetCapital: Math.max(0, netCapital),
    liquidEarnedInterest: Math.max(0, finalEarnedInterest),
    liquidTotalBalance: liquidTotal,

    totalDeposits,
    totalWithdrawals,
    totalEarnedInterest: Math.max(0, finalEarnedInterest),
    totalCalculatedBalance: liquidTotal,

    // CDTs Activos
    activeCDTsCount: activeCDTsList.length,
    activeCDTsCapital,
    activeCDTsAccruedInterest,
    activeCDTsList,

    // CDTs Cerrados / Vencidos
    maturedCDTsCount: maturedCDTsList.length,
    maturedCDTsTotalCapital,
    maturedCDTsTotalProfit,
    maturedCDTsList,

    // Totales Consolidados (Cajita + CDTs)
    consolidatedTotal: liquidTotal + activeCDTsCapital + activeCDTsAccruedInterest,
    consolidatedNetCapital: Math.max(0, netCapital) + activeCDTsCapital,
    consolidatedTotalYield: Math.max(0, finalEarnedInterest) + activeCDTsAccruedInterest + maturedCDTsTotalProfit,

    periodBreakdown,
  };
}
