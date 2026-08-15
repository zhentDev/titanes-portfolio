import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchColInflationHistory, fetchFxHistory } from "../../api/client";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { BANK_PRESETS, computeMissingMonthlyYieldTransactions, getBankPreset, svgToDataUri } from "../../utils/bankPresets";
import { toastConfirm } from "../../utils/toastAlerts";
import { calculateAccountYield } from "../../utils/yieldCalculator";
import FixedIncomeModal from "./FixedIncomeModal";
import FixedIncomeProjectionChart from "./FixedIncomeProjectionChart";
import StatementImporterModal from "./StatementImporterModal";

const PERIOD_UNLOCK_DAYS = {
  "1M": 7,
  "3M": 30,
  "6M": 90,
  "1Y": 180,
  "3Y": 365,
  "5Y": 1095,
};

export default function FixedIncomeHub() {
  const {
    entities,
    accounts,
    cdts,
    transactions,
    historicalRates,
    preferredCurrency,
    projectionTimeline,
    projectionMode,
    monthlyDepositContribution,
    setPreferredCurrency,
    setProjectionTimeline,
    setProjectionMode,
    addTransaction,
    updateAccount,
    updateCDT,
    deleteEntity,
    deleteAccount,
    deleteCDT,
    deleteTransaction,
    deleteTransactions,
    updateTransactionsYear,
    migrateEntityProducts,
    initFetchFixedIncome,
  } = useFixedIncomeStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("account");
  const [importerOpen, setImporterOpen] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [selectedEntityView, setSelectedEntityView] = useState("all"); // 'all' | entityId
  const [futureYears, setFutureYears] = useState(0); // 0 to 10 years future simulation
  const [selectedModalEntityId, setSelectedModalEntityId] = useState(null); // Pre-select entity in modal
  const [fxRate, setFxRate] = useState(4150); // USD-COP fallback
  const [colInflationRate, setColInflationRate] = useState(5.16); // YoY IPC fallback
  const [editItem, setEditItem] = useState(null);
  const [editType, setEditType] = useState(null); // 'account' | 'cdt' | 'entity' | 'transaction'
  const [migrateFrom, setMigrateFrom] = useState(null); // entityId being migrated
  const [expandedAccountIds, setExpandedAccountIds] = useState(new Set());
  const [expandedMaturedEntities, setExpandedMaturedEntities] = useState(new Set());
  const [movementFilterType, setMovementFilterType] = useState({});
  const [movementSearch, setMovementSearch] = useState({});
  const [movementYear, setMovementYear] = useState({});
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());
  const [batchTargetYear, setBatchTargetYear] = useState("2025");

  const handleDeleteTransaction = async (tx) => {
    const ok = await toastConfirm(
      `¿Estás seguro de eliminar el movimiento "${tx.description || "Movimiento"}" (${tx.date})?`
    );
    if (ok) {
      await deleteTransaction(tx.id);
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        next.delete(tx.id);
        return next;
      });
    }
  };

  const handleToggleSelectTx = (txId) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  const handleSelectAllInAccount = (txList) => {
    const allIds = txList.map((t) => t.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedTxIds.has(id));
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBatchDelete = async (txIdsToDelete) => {
    const ids = txIdsToDelete || Array.from(selectedTxIds);
    if (ids.length === 0) return;
    const ok = await toastConfirm(
      `¿Estás seguro de eliminar los ${ids.length} movimientos seleccionados?`
    );
    if (ok) {
      await deleteTransactions(ids);
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleBatchChangeYear = async (txIdsToUpdate, targetYear) => {
    const ids = txIdsToUpdate || Array.from(selectedTxIds);
    if (ids.length === 0) return;
    if (!targetYear || targetYear.length !== 4) {
      toast.error("Año inválido");
      return;
    }
    await updateTransactionsYear(ids, targetYear);
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleAccountExpand = (accId) => {
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  };

  const toggleMaturedExpand = (entId) => {
    setExpandedMaturedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entId)) next.delete(entId);
      else next.add(entId);
      return next;
    });
  };

  useEffect(() => {
    initFetchFixedIncome();
    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (res?.current) setFxRate(res.current);
      })
      .catch(console.error);

    fetchColInflationHistory()
      .then((res) => {
        if (res?.latest?.yoy) setColInflationRate(res.latest.yoy);
      })
      .catch(console.error);
  }, [initFetchFixedIncome]);

  const handleDeleteAccount = async (acc) => {
    const ok = await toastConfirm(`¿Estás seguro de eliminar la cuenta "${acc.name}"?`);
    if (ok) {
      deleteAccount(acc.id);
      toast.success(`Cuenta "${acc.name}" eliminada`);
    }
  };

  const handleDeleteCDT = async (cdt) => {
    const ok = await toastConfirm(`¿Estás seguro de eliminar el CDT "${cdt.name}"?`);
    if (ok) {
      deleteCDT(cdt.id);
      toast.success(`CDT "${cdt.name}" eliminado`);
    }
  };

  const handleDeleteEntity = async (entity) => {
    const ok = await toastConfirm(
      `¿Eliminar la entidad "${entity.name}" y todos sus productos asociados?`,
    );
    if (ok) {
      deleteEntity(entity.id);
      toast.success(`Entidad "${entity.name}" eliminada`);
    }
  };

  const handleEdit = (item, type) => {
    setEditItem(item);
    setEditType(type);
    setModalTab(type);
    setModalOpen(true);
  };

  // Helper to convert any amount to the preferred currency (COP or USD)
  const convertAmount = (amount, fromCurrency) => {
    if (!amount) return 0;
    if (fromCurrency === preferredCurrency) return amount;
    if (fromCurrency === "USD" || fromCurrency === "USDC") {
      return preferredCurrency === "COP" ? amount * fxRate : amount;
    }
    if (fromCurrency === "COP") {
      return preferredCurrency === "USD" ? amount / fxRate : amount;
    }
    return amount;
  };

  // ── Auto-generate Monthly Yield Transactions Handler ──────────
  const handleGenerateMonthlyYields = async (account) => {
    try {
      const missingPayouts = computeMissingMonthlyYieldTransactions(account, transactions, historicalRates);
      if (missingPayouts.length === 0) {
        toast.success(`Todos los rendimientos mensuales de ${account.name} ya están al día`);
        return;
      }

      const totalNewYield = missingPayouts.reduce((sum, t) => sum + t.amount, 0);
      const confirmed = await toastConfirm(
        `¿Deseas auto-generar ${missingPayouts.length} rendimientos mensuales (+COP $${totalNewYield.toLocaleString("en-US", { minimumFractionDigits: 2 })} en total) para ${account.name}?`
      );

      if (!confirmed) return;

      // Add all generated transactions to store
      for (const tx of missingPayouts) {
        await addTransaction(tx);
      }

      // Update account balance to include new yields
      const newBal = (account.balance || 0) + totalNewYield;
      await updateAccount({ ...account, balance: newBal });

      toast.success(`¡Se agregaron ${missingPayouts.length} abonos de rendimientos mensuales exitosamente!`);
    } catch (err) {
      console.error(err);
      toast.error("Error al generar rendimientos mensuales");
    }
  };

  // ── Active Entities Filter ──────────────────────────────
  const activeEntities = useMemo(() => {
    if (showAllEntities) return entities;
    return entities.filter((entity) => {
      const hasAcc = accounts.some((a) => a.entityId === entity.id);
      const hasCdt = cdts.some((c) => c.entityId === entity.id);
      return hasAcc || hasCdt;
    });
  }, [entities, accounts, cdts, showAllEntities]);

  // ── Filtered data by selected entity view (all vs specific bank) ──
  const viewAccounts = useMemo(() => {
    if (selectedEntityView === "all") return accounts;
    return accounts.filter((a) => a.entityId === selectedEntityView);
  }, [accounts, selectedEntityView]);

  const viewCDTs = useMemo(() => {
    if (selectedEntityView === "all") return cdts;
    return cdts.filter((c) => c.entityId === selectedEntityView);
  }, [cdts, selectedEntityView]);

  const viewTransactions = useMemo(() => {
    if (selectedEntityView === "all") return transactions;
    const validAccIds = new Set(accounts.filter((a) => a.entityId === selectedEntityView).map((a) => a.id));
    return transactions.filter((t) => validAccIds.has(t.accountId));
  }, [transactions, accounts, selectedEntityView]);

  // ── Financial Metrics Aggregation ───────────────────────
  const metrics = useMemo(() => {
    let liquidBalance = 0;
    let totalDailyIncome = 0;
    let weightedRateSum = 0;

    // 1. Accounts / Cajitas Líquidas (Calculated Balance + Current Rate)
    viewAccounts.forEach((acc) => {
      const accTx = viewTransactions.filter((t) => (t.accountId ? t.accountId === acc.id : (t.description || "").toLowerCase().includes(acc.name.toLowerCase())));
      const yieldData = calculateAccountYield(acc, accTx, historicalRates, viewCDTs);
      const val = convertAmount(yieldData.liquidTotalBalance || acc.balance, acc.currency);
      liquidBalance += val;

      const currentRateEA = Number(
        historicalRates?.entities?.[acc.entityId]?.savings_rates?.slice(-1)[0]?.rateEA ||
        acc.interestRateEA ||
        9.30
      );

      // Account's active CDT capital (congelado de esta cajita)
      const accActiveCDTs = viewCDTs.filter((c) => c.status !== "matured" && (c.accountId === acc.id || (c.category || "").toLowerCase().includes(acc.name.toLowerCase().replace("cajita", "").trim())));
      const accCDTCapital = accActiveCDTs.reduce((sum, c) => sum + convertAmount(c.capital || 0, c.currency), 0);
      const unfrozenLiquid = Math.max(0, val - accCDTCapital);

      const dailyRate = Math.pow(1 + currentRateEA / 100, 1 / 360) - 1;
      const dailyIncome = unfrozenLiquid * dailyRate;

      totalDailyIncome += dailyIncome;
      weightedRateSum += currentRateEA * unfrozenLiquid;
    });

    // 2. CDTs Activos (Rendimientos Devengados + Tasa CDT)
    let cdtsExtraYield = 0;
    let activeCdtsCount = 0;

    viewCDTs.forEach((cdt) => {
      if (cdt.status === "matured") return; // CDTs cerrados ya reingresaron a las cajitas

      activeCdtsCount += 1;
      const capitalVal = convertAmount(cdt.capital || 0, cdt.currency);
      const rateDecimal = Number(cdt.interestRateEA || 11.0) / 100;
      const reteFuenteMultiplier = 1 - Number(cdt.reteFuentePct || 4) / 100;

      const startDate = new Date(cdt.startDate || new Date().toISOString().slice(0, 10));
      const today = new Date();
      const daysElapsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));

      // Rendimiento acumulado devengado en base 360
      const accruedGain = capitalVal * (Math.pow(1 + rateDecimal, daysElapsed / 360) - 1) * reteFuenteMultiplier;
      cdtsExtraYield += accruedGain;

      const dailyRate = (Math.pow(1 + rateDecimal, 1 / 360) - 1) * reteFuenteMultiplier;
      const dailyIncome = capitalVal * dailyRate;

      totalDailyIncome += dailyIncome;
      weightedRateSum += (cdt.interestRateEA || 11.0) * capitalVal;
    });

    // Patrimonio total = Saldo Total de Cajitas + Rendimientos de CDTs
    const totalPatrimony = liquidBalance + cdtsExtraYield;
    const weightedEA = liquidBalance > 0 ? weightedRateSum / liquidBalance : (viewAccounts[0]?.interestRateEA || 9.30);
    const monthlyIncome = totalDailyIncome * 30.416; // Promedio 30.416 días/mes

    // Fisher Equation Real Rate: (1 + EA) / (1 + Inflation) - 1
    const inflationDecimal = (preferredCurrency === "COP" ? colInflationRate : 3.0) / 100;
    const realRateEA = ((1 + weightedEA / 100) / (1 + inflationDecimal) - 1) * 100;

    return {
      liquidBalance,
      cdtsExtraYield,
      activeCdtsCount,
      totalPatrimony,
      totalDailyIncome,
      monthlyIncome,
      weightedEA,
      realRateEA,
    };
  }, [viewAccounts, viewCDTs, viewTransactions, historicalRates, preferredCurrency, fxRate, colInflationRate]);

  // ── Real Historical Compound Interest Growth Calculator ──
  const hasAnyData = viewAccounts.length > 0 || viewTransactions.length > 0 || viewCDTs.length > 0;

  // ── Primera apertura real (fecha más temprana de primera transacción o apertura de CDT) ──
  const firstOpenDate = useMemo(() => {
    const dates = [];
    const sortedTx = [...viewTransactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (sortedTx.length > 0) dates.push(sortedTx[0].date);
    viewCDTs.forEach((c) => { if (c.startDate) dates.push(c.startDate); });
    
    if (dates.length === 0) {
      viewAccounts.forEach((a) => {
        if (a.startDate && a.startDate !== "2023-06-01") dates.push(a.startDate.slice(0, 10));
      });
    }
    
    dates.sort();
    return dates[0] || new Date().toISOString().slice(0, 10);
  }, [viewAccounts, viewTransactions, viewCDTs]);

  const daysSinceOpen = useMemo(() => {
    const start = new Date(firstOpenDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
  }, [firstOpenDate]);

  const historicalSeries = useMemo(() => {
    if (!hasAnyData) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const label = new Date(todayStr).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
      const total = Number(metrics.totalPatrimony || 0);
      return [{ date: todayStr, dateLabel: label, projectedValue: total, baseCapital: total, earnings: 0, rate: metrics.weightedEA || 9.30 }];
    }

    const startDateStr = firstOpenDate;
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    // 1. Prepare individual account simulators
    const accountSimulators = viewAccounts.map((acc) => {
      const accTx = viewTransactions.filter((t) =>
        t.accountId ? t.accountId === acc.id : (t.description || "").toLowerCase().includes(acc.name.toLowerCase())
      );

      const capTxByDate = {};
      const intTxByDate = {};
      let hasExplicitPayouts = false;

      accTx.forEach((t) => {
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
          hasExplicitPayouts = true;
          intTxByDate[d] = (intTxByDate[d] || 0) + amt;
        } else {
          const change = isDebit ? -amt : amt;
          capTxByDate[d] = (capTxByDate[d] || 0) + change;
        }
      });

      const getRate = (dStr) => {
        const rates = historicalRates?.entities?.[acc.entityId]?.savings_rates;
        if (rates && rates.length > 0) {
          for (const r of rates) {
            if (dStr >= r.from && dStr <= r.to) return Number(r.rateEA || acc.interestRateEA || 9.30);
          }
        }
        return Number(acc.interestRateEA || 9.30);
      };

      return {
        acc,
        capTxByDate,
        intTxByDate,
        hasExplicitPayouts,
        getRate,
        currCapital: 0,
        currBalance: 0,
        currEarnings: 0,
      };
    });

    const series = [];
    let currDate = new Date(startDateStr + "T00:00:00");

    while (currDate <= endDate) {
      const dStr = currDate.toISOString().slice(0, 10);

      let dayTotalCapital = 0;
      let dayTotalBalance = 0;
      let dayTotalEarnings = 0;
      let dayWeightedRateSum = 0;

      // Advance each account for this day
      accountSimulators.forEach((sim) => {
        // Apply capital transactions
        if (sim.capTxByDate[dStr]) {
          sim.currCapital = Math.max(0, sim.currCapital + sim.capTxByDate[dStr]);
          sim.currBalance = Math.max(0, sim.currBalance + sim.capTxByDate[dStr]);
        }

        // Apply explicit interest transactions
        if (sim.intTxByDate[dStr]) {
          sim.currBalance = Math.max(0, sim.currBalance + sim.intTxByDate[dStr]);
          sim.currEarnings += sim.intTxByDate[dStr];
        }

        // Dynamic daily compounding for accounts without explicit monthly payout rows (e.g. Nu)
        const rateEA = sim.getRate(dStr);
        if (!sim.hasExplicitPayouts && sim.currBalance > 0) {
          const dailyRate = Math.pow(1 + rateEA / 100, 1 / 360) - 1;
          const dailyInterest = sim.currBalance * dailyRate;
          sim.currEarnings += dailyInterest;
          sim.currBalance += dailyInterest;
        }

        dayTotalCapital += sim.currCapital;
        dayTotalBalance += sim.currBalance;
        dayTotalEarnings += sim.currEarnings;
        dayWeightedRateSum += rateEA * sim.currBalance;
      });

      // Active CDTs extra yield on this day
      let activeCDTsExtraYield = 0;
      let activeCDTsCapitalOnDay = 0;
      let activeCDTsRateSum = 0;

      viewCDTs.forEach((c) => {
        if (c.status !== "matured") {
          const sDate = c.startDate || "2024-01-01";
          const mDate = c.maturityDate || c.payoutDate || sDate;
          if (dStr >= sDate && dStr <= mDate) {
            const cap = Number(c.capital || 0);
            const rEA = Number(c.interestRateEA || 11.0);
            const rete = 1 - Number(c.reteFuentePct || 4) / 100;
            const startD = new Date(sDate);
            const thisD = new Date(dStr);
            const daysEl = Math.max(0, Math.floor((thisD - startD) / (1000 * 60 * 60 * 24)));
            const cdtYield = cap * (Math.pow(1 + rEA / 100, daysEl / 360) - 1) * rete;

            activeCDTsExtraYield += cdtYield;
            activeCDTsCapitalOnDay += cap;
            activeCDTsRateSum += rEA * cap;
          }
        }
      });

      const finalBalance = dayTotalBalance + activeCDTsExtraYield;
      const finalEarnings = dayTotalEarnings + activeCDTsExtraYield;
      const finalWeightedRate = dayTotalBalance > 0
        ? (dayWeightedRateSum + activeCDTsRateSum) / (dayTotalBalance + activeCDTsCapitalOnDay)
        : metrics.weightedEA;

      const label = currDate.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });

      series.push({
        date: dStr,
        dateLabel: label,
        projectedValue: Number(finalBalance.toFixed(2)),
        baseCapital: Number(dayTotalCapital.toFixed(2)),
        earnings: Number(Math.max(0, finalEarnings).toFixed(2)),
        rate: Number((finalWeightedRate || 9.30).toFixed(2)),
      });

      currDate.setDate(currDate.getDate() + 1);
    }

    return series;
  }, [viewTransactions, viewCDTs, viewAccounts, historicalRates, metrics, firstOpenDate, hasAnyData, selectedEntityView]);

  // ── Historical & Future Compound Interest Projection Series ───────────────────
  const projectionSeries = useMemo(() => {
    if (historicalSeries.length === 0) return [];
    
    let baseData = historicalSeries;

    const daysMap = {
      "1M": 30,
      "3M": 90,
      "6M": 180,
      "1Y": 365,
      "3Y": 1095,
      "5Y": 1825,
    };
    
    if (futureYears === 0 && projectionTimeline !== "ALL" && projectionTimeline !== "MAX" && daysMap[projectionTimeline]) {
      const totalDays = daysMap[projectionTimeline];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - totalDays);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10);
      const filtered = historicalSeries.filter((pt) => pt.date >= cutoffStr);
      baseData = filtered.length > 0 ? filtered : historicalSeries;
    }

    if (futureYears <= 0) {
      return baseData;
    }

    // ── Extend series into the future with current rate & capital ──
    const extended = [...baseData];
    const latestPt = historicalSeries[historicalSeries.length - 1];
    if (!latestPt) return baseData;

    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);

    const endFutureD = new Date(todayD);
    endFutureD.setDate(endFutureD.getDate() + Math.round(Number(futureYears) * 365.25));

    const stepDays = Number(futureYears) > 5 ? 5 : Number(futureYears) > 2 ? 3 : 1;
    let fD = new Date(todayD);
    fD.setDate(fD.getDate() + stepDays);

    const currentRate = Number(metrics.weightedEA || 9.88);

    while (fD <= endFutureD) {
      const dStr = fD.toISOString().slice(0, 10);
      const daysFromToday = Math.max(0, Math.floor((fD - todayD) / (1000 * 60 * 60 * 24)));
      const futureBal = latestPt.projectedValue * Math.pow(1 + currentRate / 100, daysFromToday / 360);
      const futureEarnings = latestPt.earnings + (futureBal - latestPt.projectedValue);
      const label = fD.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });

      extended.push({
        date: dStr,
        dateLabel: `${label} (Proy.)`,
        projectedValue: Number(futureBal.toFixed(2)),
        baseCapital: Number(latestPt.baseCapital.toFixed(2)),
        earnings: Number(Math.max(0, futureEarnings).toFixed(2)),
        rate: currentRate,
        isProjected: true,
      });

      fD.setDate(fD.getDate() + stepDays);
    }

    return extended;
  }, [historicalSeries, projectionTimeline, futureYears, metrics.weightedEA]);

  const currSymbol = preferredCurrency === "COP" ? "COP $" : "USD $";

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── ENTITY VIEW SELECTOR TABS ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
          padding: "4px 0",
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, whiteSpace: "nowrap" }}>
          👁️ Filtrar Vista:
        </span>
        <button
          onClick={() => setSelectedEntityView("all")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: selectedEntityView === "all" ? "rgba(56, 189, 248, 0.2)" : "rgba(15, 23, 42, 0.6)",
            border: `1px solid ${selectedEntityView === "all" ? "#38bdf8" : "rgba(255, 255, 255, 0.08)"}`,
            color: selectedEntityView === "all" ? "#38bdf8" : "#94a3b8",
            fontSize: "0.78rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>🌐 Consolidado Global ({activeEntities.length})</span>
        </button>

        {activeEntities.map((ent) => {
          const isSelected = selectedEntityView === ent.id;
          return (
            <button
              key={ent.id}
              onClick={() => setSelectedEntityView(ent.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 8,
                background: isSelected ? `${ent.color}33` : "rgba(15, 23, 42, 0.6)",
                border: `1px solid ${isSelected ? ent.color : "rgba(255, 255, 255, 0.08)"}`,
                color: isSelected ? "#fff" : "#94a3b8",
                fontSize: "0.78rem",
                fontWeight: isSelected ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src={ent.logoUrl || svgToDataUri(getBankPreset(ent.name).logoSvg)}
                  alt={ent.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <span>{ent.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── HEADER SUMMARY KPI BAR ────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          background: "rgba(15, 23, 42, 0.65)",
          padding: "16px 20px",
          borderRadius: 14,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Patrimonio Renta Fija
          </div>
          <div
            style={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: "#f1f5f9",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {currSymbol}{" "}
            {metrics.totalPatrimony.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#38bdf8", marginTop: 4, fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span>💧 Saldo Cajitas: {currSymbol} {metrics.liquidBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>•</span>
            <span>📈 Rend. CDTs ({metrics.activeCdtsCount}): +{currSymbol} {metrics.cdtsExtraYield.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 2 }}>
            {preferredCurrency === "COP"
              ? `≈ USD $${(metrics.totalPatrimony / fxRate).toFixed(2)}`
              : `≈ COP $${(metrics.totalPatrimony * fxRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Rendimiento Diario
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#10b981",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            +{currSymbol}{" "}
            {metrics.totalDailyIncome.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#10b981", marginTop: 2 }}>
            Generación pasiva diaria
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Rendimiento Mensual Estimado
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#38bdf8",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            +{currSymbol}{" "}
            {metrics.monthlyIncome.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
            ≈ 30.4 días capitalizables
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Tasa Ponderada E.A.
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: "#f59e0b",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {metrics.weightedEA.toFixed(2)}%{" "}
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "#94a3b8" }}>E.A.</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "#fbbf24", marginTop: 2 }}>
            Promedio ponderado del capital
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Rendimiento Real (vs IPC)
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: metrics.realRateEA >= 0 ? "#10b981" : "#ef4444",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {metrics.realRateEA >= 0 ? "+" : ""}
            {metrics.realRateEA.toFixed(2)}%{" "}
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "#94a3b8" }}>Real</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>
            Ajustado por inflación (
            {preferredCurrency === "COP" ? `IPC CO ${colInflationRate}%` : "IPC US 3.0%"})
          </div>
        </div>
      </div>

      {/* ── ACTION & FILTER CONTROLS BAR ─────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setImporterOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
              color: "#0f172a",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: "0.8rem",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(56, 189, 248, 0.3)",
            }}
          >
            📄 Importar Extracto PDF / Foto
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("account");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#10b981",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            + Cuenta / Bolsillo
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("cdt");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f59e0b",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            + Nuevo CDT
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("entity");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f1f5f9",
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Currency & Timeline Switchers */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Divisa */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={() => setPreferredCurrency("COP")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: preferredCurrency === "COP" ? "#10b981" : "transparent",
                color: preferredCurrency === "COP" ? "#000" : "#94a3b8",
                fontWeight: preferredCurrency === "COP" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              🇨🇴 COP
            </button>
            <button
              onClick={() => setPreferredCurrency("USD")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: preferredCurrency === "USD" ? "#00e5ff" : "transparent",
                color: preferredCurrency === "USD" ? "#000" : "#94a3b8",
                fontWeight: preferredCurrency === "USD" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              🇺🇸 USD
            </button>
          </div>

          {/* Modo Proyección */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={() => setProjectionMode("NOMINAL")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: projectionMode === "NOMINAL" ? "#38bdf8" : "transparent",
                color: projectionMode === "NOMINAL" ? "#000" : "#94a3b8",
                fontWeight: projectionMode === "NOMINAL" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Nominal
            </button>
            <button
              onClick={() => setProjectionMode("REAL")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: projectionMode === "REAL" ? "#f59e0b" : "transparent",
                color: projectionMode === "REAL" ? "#000" : "#94a3b8",
                fontWeight: projectionMode === "REAL" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Real (Ajustado IPC)
            </button>
          </div>

          {/* Horizonte Temporal */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"].map((t) => {
              const isLocked = t !== "MAX" && daysSinceOpen < (PERIOD_UNLOCK_DAYS[t] || 0);
              const isSelected =
                projectionTimeline === t ||
                (t === "MAX" && (projectionTimeline === "ALL" || projectionTimeline === "MAX"));
              return (
                <button
                  key={t}
                  onClick={() => {
                    if (isLocked) return;
                    setProjectionTimeline(t === "MAX" ? "ALL" : t);
                  }}
                  title={isLocked ? "Requiere más historial desde la apertura de tu primera cuenta" : undefined}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 15,
                    border: "none",
                    background: isSelected ? "#820ad1" : "transparent",
                    color: isSelected ? "#fff" : "#94a3b8",
                    fontWeight: isSelected ? 700 : 400,
                    fontSize: "0.75rem",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked ? 0.35 : 1,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE 10-YEAR FUTURE PROJECTION SIMULATOR ──────── */}
      <div
        style={{
          background: futureYears > 0 ? "rgba(15, 23, 42, 0.85)" : "rgba(15, 23, 42, 0.5)",
          border: `1px solid ${futureYears > 0 ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
          borderRadius: 14,
          padding: "12px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: futureYears > 0 ? "0 4px 20px rgba(56, 189, 248, 0.15)" : "0 4px 16px rgba(0, 0, 0, 0.2)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: futureYears > 0 ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
              }}
            >
              🔮
            </div>
            <div>
              <div style={{ fontWeight: 800, color: futureYears > 0 ? "#38bdf8" : "#f1f5f9", fontSize: "0.86rem", display: "flex", alignItems: "center", gap: 6 }}>
                <span>Simulador Proyectivo a Futuro</span>
                <span
                  style={{
                    background: futureYears > 0 ? "#38bdf8" : "rgba(255,255,255,0.1)",
                    color: futureYears > 0 ? "#000" : "#94a3b8",
                    padding: "1px 8px",
                    borderRadius: 12,
                    fontSize: "0.7rem",
                    fontWeight: 800,
                  }}
                >
                  {futureYears === 0 ? "0 Años (Hoy)" : `+${futureYears} Años (${Math.round(futureYears * 12)} meses)`}
                </span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: 2 }}>
                Interés compuesto a partir de hoy con tu capital actual y tasa vigente ({metrics.weightedEA.toFixed(2)}% E.A.)
              </div>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[0, 1, 3, 5, 10].map((yr) => (
              <button
                key={yr}
                onClick={() => setFutureYears(yr)}
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  border: `1px solid ${futureYears === yr ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
                  background: futureYears === yr ? "rgba(56, 189, 248, 0.2)" : "rgba(0,0,0,0.25)",
                  color: futureYears === yr ? "#38bdf8" : "#94a3b8",
                  fontSize: "0.7rem",
                  fontWeight: futureYears === yr ? 800 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {yr === 0 ? "Hoy (0A)" : `+${yr}A`}
              </button>
            ))}
          </div>
        </div>

        {/* Range Slider Track */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
          <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, minWidth: 45 }}>Hoy (0A)</span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={futureYears}
            onChange={(e) => setFutureYears(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#38bdf8",
              cursor: "pointer",
              height: 6,
            }}
          />
          <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 800, minWidth: 45, textAlign: "right" }}>+10 Años</span>
        </div>

        {/* Live Projections Result Badge */}
        {futureYears > 0 && (() => {
          const latestPt = projectionSeries[projectionSeries.length - 1];
          const futBal = latestPt?.projectedValue || metrics.totalPatrimony;
          const futGain = latestPt?.earnings || 0;
          const futMonthlyIncome = futBal * (Math.pow(1 + (metrics.weightedEA / 100), 1 / 360) - 1) * 30.416;

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                padding: "8px 12px",
                background: "rgba(0, 0, 0, 0.35)",
                borderRadius: 8,
                border: "1px solid rgba(56, 189, 248, 0.2)",
                marginTop: 2,
              }}
            >
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>💰 Saldo Proyectado (+{futureYears}A)</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: "#10b981" }}>
                  {currSymbol} {futBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>📈 Ganancia Neta Proyectada</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: "#38bdf8" }}>
                  +{currSymbol} {futGain.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>💎 Renta Pasiva Estimada al Año {futureYears}</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: "#f59e0b" }}>
                  {currSymbol} {futMonthlyIncome.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── INTERACTIVE HISTORICAL & FUTURE GROWTH CHART ───────── */}
      <FixedIncomeProjectionChart
        projectionData={projectionSeries}
        currency={preferredCurrency}
        mode={projectionMode}
      />

      {/* ── ENTITIES & ACCOUNTS GRID HEADER ──────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "8px 0 -6px 0",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#f1f5f9", fontWeight: 700 }}>
          🏦 Entidades y Cuentas Activas ({activeEntities.length})
        </h4>
        <button
          onClick={() => setShowAllEntities(!showAllEntities)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#94a3b8",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: "0.72rem",
            cursor: "pointer",
          }}
        >
          {showAllEntities ? "Ver solo entidades con saldo" : "Ver catálogo completo de entidades"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
          gap: 20,
        }}
      >
        {activeEntities.map((entity) => {
          const entityAccounts = accounts.filter((a) => a.entityId === entity.id);
          const entityCDTs = cdts.filter((c) => c.entityId === entity.id);
          const activeEntityCDTs = entityCDTs.filter((c) => c.status !== "matured");

          const accountsLiquidTotal = entityAccounts.reduce((sum, a) => {
            const accTx = transactions.filter(t => t.accountId ? t.accountId === a.id : (t.description || "").toLowerCase().includes(a.name.toLowerCase()));
            const yieldData = calculateAccountYield(a, accTx, historicalRates);
            return sum + convertAmount(yieldData.totalCalculatedBalance || a.balance, a.currency);
          }, 0);

          // Rendimientos devengados de CDTs activos a la fecha de hoy (base bancaria 360)
          const activeCDTsAccruedYield = activeEntityCDTs.reduce((sum, cdt) => {
            const rateDecimal = (cdt.interestRateEA || 0) / 100;
            const reteMul = 1 - (cdt.reteFuentePct || 4) / 100;
            const startD = new Date(cdt.startDate);
            const nowD = new Date();
            const daysEl = Math.max(0, Math.floor((nowD - startD) / (1000 * 60 * 60 * 24)));
            const gain = (cdt.capital || 0) * (Math.pow(1 + rateDecimal, daysEl / 360) - 1) * reteMul;
            return sum + convertAmount(gain, cdt.currency);
          }, 0);

          const activeCDTsCapitalTotal = activeEntityCDTs.reduce((sum, c) => sum + convertAmount(c.capital, c.currency), 0);
          const entityTotal = accountsLiquidTotal + activeCDTsAccruedYield;

          return (
            <div
              key={entity.id}
              style={{
                background: "rgba(15, 23, 42, 0.65)",
                borderRadius: 14,
                border: `1px solid ${entity.color}33`,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
              }}
            >
              {/* Entity Card Header */}
              <div
                style={{
                  padding: "16px 20px",
                  background: `${entity.color}15`,
                  borderBottom: `1px solid ${entity.color}33`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${entity.color}22`,
                      border: `1px solid ${entity.color}44`,
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={entity.logoUrl || svgToDataUri(getBankPreset(entity.name).logoSvg)}
                      alt={entity.name}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#f8fafc", fontSize: "1.05rem" }}>
                      {entity.name} <span style={{ fontSize: "0.8rem" }}>{entity.country}</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      {entityAccounts.length} cajita(s) / cuenta(s) • {entityCDTs.length} CDT(s)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {/* Direct Add Object Buttons for this Entity */}
                  <button
                    onClick={() => {
                      setSelectedModalEntityId(entity.id);
                      setEditItem(null);
                      setEditType(null);
                      setModalTab("account");
                      setModalOpen(true);
                    }}
                    style={{
                      background: "rgba(16, 185, 129, 0.18)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      color: "#10b981",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title={`Crear nueva cuenta / bolsillo en ${entity.name}`}
                  >
                    + Cuenta
                  </button>
                  <button
                    onClick={() => {
                      setSelectedModalEntityId(entity.id);
                      setEditItem(null);
                      setEditType(null);
                      setModalTab("cdt");
                      setModalOpen(true);
                    }}
                    style={{
                      background: "rgba(245, 158, 11, 0.18)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      color: "#f59e0b",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title={`Registrar nuevo CDT en ${entity.name}`}
                  >
                    + CDT
                  </button>

                  <div style={{ textAlign: "right", marginLeft: 4 }}>
                    <div
                      className="mono"
                      style={{ fontWeight: 800, color: "#10b981", fontSize: "1.05rem" }}
                      title={`Líquido Cajitas ($${accountsLiquidTotal.toLocaleString()}) + Rendimiento Devengado CDTs ($${activeCDTsAccruedYield.toLocaleString()})`}
                    >
                      {currSymbol}{" "}
                      {entityTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </div>
                    {activeEntityCDTs.length > 0 && (
                      <div style={{ fontSize: "0.68rem", color: "#f59e0b", marginTop: 2 }}>
                        + {currSymbol}{activeCDTsCapitalTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })} en {activeEntityCDTs.length} CDT(s)
                        {activeCDTsAccruedYield > 0 && (
                          <span style={{ color: "#34d399", marginLeft: 4, fontWeight: 600 }}>
                            (+$ {activeCDTsAccruedYield.toLocaleString("en-US", { maximumFractionDigits: 0 })} rend. a hoy)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteEntity(entity)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#64748b",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                    title="Eliminar Entidad"
                  >
                    🗑️
                  </button>
                  {entities.length > 1 && (
                    <button
                      onClick={() => setMigrateFrom(migrateFrom === entity.id ? null : entity.id)}
                      style={{
                        background: migrateFrom === entity.id ? "rgba(59,130,246,0.15)" : "transparent",
                        border: migrateFrom === entity.id ? "1px solid #3b82f6" : "none",
                        color: migrateFrom === entity.id ? "#3b82f6" : "#64748b",
                        cursor: "pointer",
                        fontSize: "0.7rem",
                        borderRadius: 6,
                        padding: "2px 6px",
                      }}
                      title="Migrar todos los productos a otra entidad"
                    >
                      🔄 Migrar
                    </button>
                  )}
                </div>

                {/* Migration Target Selector */}
                {migrateFrom === entity.id && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(0,0,0,0.3)",
                    padding: "4px 8px",
                    borderRadius: 8,
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    width: "100%",
                    marginTop: 6,
                  }}>
                    <span>Mover a:</span>
                    {entities.filter(e => e.id !== entity.id).map(targetEnt => (
                      <button
                        key={targetEnt.id}
                        onClick={() => {
                          migrateEntityProducts(entity.id, targetEnt.id);
                          setMigrateFrom(null);
                        }}
                        style={{
                          background: `${targetEnt.color}22`,
                          border: `1px solid ${targetEnt.color}66`,
                          borderRadius: 6,
                          color: "#f8fafc",
                          padding: "2px 8px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {targetEnt.icon} {targetEnt.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setMigrateFrom(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#64748b",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        marginLeft: "auto",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Accounts & Pockets List */}
              <div
                style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}
              >
                {entityAccounts.map((acc) => {
                  const isExpanded = expandedAccountIds.has(acc.id);
                  const accTx = transactions
                    .filter((t) => {
                      if (t.accountId) return t.accountId === acc.id;
                      const desc = (t.description || "").toLowerCase();
                      const cat = (t.category || "").toLowerCase();
                      const accName = acc.name.toLowerCase();
                      return desc.includes(accName) || cat.includes(accName);
                    })
                    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

                  const netTxBalance = accTx.reduce((sum, tx) => {
                    const descLower = (tx.description || "").toLowerCase();
                    const isDebit =
                      tx.type === "debit" ||
                      descLower.includes("retiraste") ||
                      descLower.includes("retiro") ||
                      descLower.includes("invertiste") ||
                      Number(tx.amount) < 0;
                    const amt = Math.abs(Number(tx.amount || 0));
                    return sum + (isDebit ? -amt : amt);
                  }, 0);

                  const hasDiscrepancy = accTx.length > 0 && Math.abs(acc.balance - netTxBalance) > 0.01;

                  const yieldData = calculateAccountYield(acc, accTx, historicalRates, cdts);

                  return (
                    <div
                      key={acc.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: 10,
                        border: `1px solid ${isExpanded ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.06)"}`,
                        transition: "all 0.2s ease",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 14px",
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => toggleAccountExpand(acc.id)}
                            style={{
                              background: isExpanded ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.06)",
                              border: `1px solid ${isExpanded ? "#10b981" : "rgba(255, 255, 255, 0.1)"}`,
                              borderRadius: 6,
                              color: isExpanded ? "#10b981" : "#94a3b8",
                              cursor: "pointer",
                              padding: "5px 9px",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Ver / Ocultar movimientos y desglose de rentabilidad"
                          >
                            <span>{isExpanded ? "▲" : "▼"}</span>
                            <span>Movimientos {accTx.length > 0 ? `(${accTx.length})` : ""}</span>
                          </button>

                          <div>
                            <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.88rem" }}>
                              {acc.name}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span>
                                Tasa actual:{" "}
                                <span style={{ color: "#10b981", fontWeight: 700 }}>
                                  {Number(
                                    historicalRates?.entities?.[acc.entityId]?.savings_rates?.slice(-1)[0]?.rateEA ||
                                    acc.interestRateEA ||
                                    9.30
                                  ).toFixed(2)}% E.A.
                                </span>
                              </span>
                              {acc.isTaxExemptGMF && (
                                <span style={{ color: "#38bdf8", fontSize: "0.65rem" }}>
                                  • Exenta 4x1000
                                </span>
                              )}
                              {yieldData.activeCDTsCount > 0 && (
                                <span style={{ color: "#f59e0b", fontSize: "0.65rem", fontWeight: 600 }}>
                                  • ⏳ {yieldData.activeCDTsCount} CDT(s) activo(s)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 3 Core Values: Aportes Netos, Rendimientos, Saldo Total */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.25)", padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                            {/* 1. Ingresado Neto Líquido */}
                            <div style={{ textAlign: "right" }} title="Capital neto depositado líquido en la cajita">
                              <span style={{ color: "#94a3b8", fontSize: "0.6rem", display: "block" }}>📥 Aportado Neto</span>
                              <span className="mono" style={{ color: "#cbd5e1", fontWeight: 600, fontSize: "0.78rem" }}>
                                ${yieldData.liquidNetCapital.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              </span>
                            </div>

                            {/* 2. Rendimientos Líquidos */}
                            <div style={{ textAlign: "right" }} title="Rendimientos diarios ganados en la cajita">
                              <span style={{ color: "#94a3b8", fontSize: "0.6rem", display: "block" }}>📈 Rentabilidad</span>
                              <span className="mono" style={{ color: "#10b981", fontWeight: 700, fontSize: "0.78rem" }}>
                                +${yieldData.liquidEarnedInterest.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              </span>
                            </div>

                            {/* 3. Saldo Total Líquido */}
                            <div style={{ textAlign: "right", paddingLeft: 8, borderLeft: "1px solid rgba(255,255,255,0.12)" }} title="Saldo líquido actual en la cajita">
                              <span style={{ color: "#38bdf8", fontSize: "0.6rem", display: "block", fontWeight: 700 }}>💰 Saldo Líquido</span>
                              <span className="mono" style={{ color: "#f8fafc", fontWeight: 800, fontSize: "0.92rem" }}>
                                ${yieldData.liquidTotalBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                                <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{acc.currency}</span>
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {Math.abs(acc.balance - yieldData.liquidTotalBalance) > 1 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateAccount({ ...acc, balance: yieldData.liquidTotalBalance });
                                  toast.success(`Saldo de "${acc.name}" actualizado a $${yieldData.liquidTotalBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} COP`);
                                }}
                                style={{
                                  background: "rgba(16, 185, 129, 0.15)",
                                  border: "1px solid rgba(16, 185, 129, 0.4)",
                                  borderRadius: 6,
                                  color: "#10b981",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  padding: "3px 6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                                title="Sincronizar el saldo oficial de la cajita con el valor real calculado"
                              >
                                <span>🔄 Sincronizar</span>
                              </button>
                            )}

                            {accTx.length > 0 && (
                              <button
                                onClick={() => handleGenerateMonthlyYields(acc)}
                                style={{
                                  background: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.4)",
                                  borderRadius: 6,
                                  color: "#38bdf8",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  padding: "3px 6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                                title="Auto-generar y agregar al historial todas las transacciones de rendimientos mensuales devengados mes a mes"
                              >
                                <span>⚡ +Rend. Mensuales</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleEdit(acc, "account")}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#64748b",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                padding: "2px 4px",
                              }}
                              title="Editar Cuenta"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(acc)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#64748b",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                padding: "2px 4px",
                              }}
                              title="Eliminar Cuenta"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Desplegable Compacto de Movimientos con Filtros Interactivos, CDTs y Desglose */}
                      {isExpanded && (() => {
                        const currentType = movementFilterType[acc.id] || "all";
                        const currentSearch = (movementSearch[acc.id] || "").toLowerCase().trim();
                        const currentYear = movementYear[acc.id] || "all";

                        const filteredTx = accTx.filter((tx) => {
                          const descLower = (tx.description || "").toLowerCase();
                          const isDebit =
                            tx.type === "debit" ||
                            descLower.includes("retiraste") ||
                            descLower.includes("retiro") ||
                            descLower.includes("invertiste") ||
                            Number(tx.amount) < 0;
                          const isCredit = !isDebit;

                          if (currentType === "credit" && !isCredit) return false;
                          if (currentType === "debit" && !isDebit) return false;
                          if (currentYear !== "all" && !tx.date?.startsWith(currentYear)) return false;

                          if (currentSearch) {
                            const matchDesc = descLower.includes(currentSearch);
                            const matchAmount = String(Math.abs(Number(tx.amount || 0))).includes(currentSearch);
                            const matchDate = (tx.date || "").includes(currentSearch);
                            if (!matchDesc && !matchAmount && !matchDate) return false;
                          }
                          return true;
                        });

                        const totalCredits = filteredTx
                          .filter((t) => t.type === "credit" || (!t.type && Number(t.amount) > 0))
                          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
                        const totalDebits = filteredTx
                          .filter((t) => t.type === "debit" || Number(t.amount) < 0)
                          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

                        const availableYears = Array.from(
                          new Set(
                            accTx
                              .map((t) => (t.date ? t.date.slice(0, 4) : null))
                              .filter(Boolean)
                          )
                        ).sort((a, b) => b.localeCompare(a));

                        return (
                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.35)",
                              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                              padding: "10px 14px",
                            }}
                          >
                            {/* CDTs Vinculados a esta Cajita (Activos y Cerrados) */}
                            {(yieldData.activeCDTsList.length > 0 || yieldData.maturedCDTsList.length > 0) && (
                              <div
                                style={{
                                  background: "rgba(245, 158, 11, 0.08)",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  marginBottom: 10,
                                  border: "1px solid rgba(245, 158, 11, 0.25)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
                                    <span>⏳ CDTs Vinculados a {acc.name}:</span>
                                  </span>
                                  <span style={{ fontSize: "0.68rem", color: "#34d399", fontWeight: 700 }}>
                                    {yieldData.activeCDTsList.length > 0 && `Activos: $${yieldData.activeCDTsCapital.toLocaleString("en-US", { maximumFractionDigits: 0 })} COP (+$${yieldData.activeCDTsAccruedInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })} rend.)`}
                                    {yieldData.activeCDTsList.length > 0 && yieldData.maturedCDTsList.length > 0 && " • "}
                                    {yieldData.maturedCDTsList.length > 0 && `📦 ${yieldData.maturedCDTsList.length} Cerrados (+$${yieldData.maturedCDTsTotalProfit.toLocaleString("en-US", { maximumFractionDigits: 0 })} cobrados)`}
                                  </span>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
                                  {/* CDTs Activos */}
                                  {yieldData.activeCDTsList.map((c, cIdx) => (
                                    <div
                                      key={`act_cdt_${cIdx}`}
                                      style={{
                                        background: "rgba(0,0,0,0.35)",
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(245, 158, 11, 0.2)",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", color: "#f8fafc", fontSize: "0.68rem", fontWeight: 600 }}>
                                        <span>⏳ {c.name || c.category}</span>
                                        <span style={{ color: "#f59e0b" }}>{c.interestRateEA}% E.A.</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: "0.62rem", color: "#94a3b8" }}>
                                        <span>Capital: ${Number(c.capital || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                                        <span>{c.daysElapsed} de {c.termDays}d</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: "0.65rem" }}>
                                        <span style={{ color: "#64748b" }}>Rend. a hoy:</span>
                                        <span style={{ color: "#34d399", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                                          +${Number(c.accruedYield || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} COP
                                        </span>
                                      </div>
                                    </div>
                                  ))}

                                  {/* CDTs Cerrados / Vencidos */}
                                  {yieldData.maturedCDTsList.map((c, cIdx) => (
                                    <div
                                      key={`mat_cdt_${cIdx}`}
                                      style={{
                                        background: "rgba(0,0,0,0.25)",
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(148, 163, 184, 0.15)",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.68rem", fontWeight: 600 }}>
                                        <span>📦 {c.name || c.category} (Cerrado)</span>
                                        <span style={{ color: "#94a3b8" }}>{c.interestRateEA}% E.A.</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: "0.62rem", color: "#64748b" }}>
                                        <span>Cap: ${Number(c.capital || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                                        <span>{c.startDate} ➔ {c.maturityDate}</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: "0.65rem" }}>
                                        <span style={{ color: "#64748b" }}>Ganancia cobrada:</span>
                                        <span style={{ color: "#10b981", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                                          +${Number(c.finalProfit || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} COP
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Desglose por Períodos de Tasa Histórica */}
                            {yieldData.periodBreakdown.length > 0 && (
                              <div
                                style={{
                                  background: "rgba(15, 23, 42, 0.7)",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  marginBottom: 10,
                                  border: "1px solid rgba(56, 189, 248, 0.2)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#38bdf8" }}>
                                    📊 Rentabilidad Compuesta en Cajita por Períodos de Tasa:
                                  </span>
                                  <span style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 700 }}>
                                    Total Ganado en Cajita: +${yieldData.liquidEarnedInterest.toLocaleString("en-US", { maximumFractionDigits: 2 })} COP
                                  </span>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                                  {yieldData.periodBreakdown.map((p, pIdx) => (
                                    <div
                                      key={pIdx}
                                      style={{
                                        background: "rgba(0,0,0,0.3)",
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(255,255,255,0.05)",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.62rem" }}>
                                        <span>{p.startDate} al {p.endDate}</span>
                                        <span style={{ color: "#38bdf8", fontWeight: 700 }}>{p.rateEA}% E.A.</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: "0.65rem" }}>
                                        <span style={{ color: "#64748b" }}>{p.days} días activos</span>
                                        <span style={{ color: "#10b981", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                                          +${p.interestEarned.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Filter and Action Header */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                marginBottom: 10,
                              }}
                            >
                              {/* Filter buttons (Tipo) */}
                              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.04)", padding: 2, borderRadius: 6 }}>
                                {[
                                  { id: "all", label: "Todos" },
                                  { id: "credit", label: "+ Depósitos" },
                                  { id: "debit", label: "- Retiros" },
                                ].map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setMovementFilterType((prev) => ({ ...prev, [acc.id]: t.id }))}
                                    style={{
                                      background: currentType === t.id ? (t.id === "credit" ? "#10b981" : t.id === "debit" ? "#f43f5e" : "rgba(255,255,255,0.18)") : "transparent",
                                      color: currentType === t.id ? (t.id === "credit" || t.id === "debit" ? "#000" : "#fff") : "#94a3b8",
                                      border: "none",
                                      borderRadius: 4,
                                      padding: "3px 8px",
                                      fontSize: "0.65rem",
                                      fontWeight: currentType === t.id ? 700 : 500,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>

                              {/* Year Filter */}
                              <select
                                value={currentYear}
                                onChange={(e) => setMovementYear((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                                style={{
                                  background: "rgba(15, 23, 42, 0.8)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  borderRadius: 6,
                                  color: "#e2e8f0",
                                  fontSize: "0.68rem",
                                  padding: "3px 6px",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="all">📅 Todos los años</option>
                                {availableYears.map((y) => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>

                              {/* Search Box */}
                              <div style={{ flex: 1, minWidth: 140 }}>
                                <input
                                  type="text"
                                  placeholder="🔍 Buscar concepto o valor..."
                                  value={movementSearch[acc.id] || ""}
                                  onChange={(e) => setMovementSearch((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                                  style={{
                                    width: "100%",
                                    background: "rgba(15, 23, 42, 0.8)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: 6,
                                    color: "#f8fafc",
                                    fontSize: "0.68rem",
                                    padding: "4px 8px",
                                    outline: "none",
                                  }}
                                />
                              </div>

                              {/* Add manual movement button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditItem({ accountId: acc.id, entityId: acc.entityId });
                                  setEditType(null);
                                  setModalTab("transaction");
                                  setModalOpen(true);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  background: "rgba(56, 189, 248, 0.15)",
                                  border: "1px solid rgba(56, 189, 248, 0.3)",
                                  color: "#38bdf8",
                                  borderRadius: 6,
                                  padding: "4px 10px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                                title="Agregar un nuevo depósito o retiro manual a esta cajita"
                              >
                                <span>+ Movimiento Manual</span>
                              </button>
                            </div>

                            {/* Summary Metrics & Batch Action Bar */}
                            {(() => {
                              const selectedInAcc = filteredTx.filter((t) => selectedTxIds.has(t.id));
                              const hasSelected = selectedInAcc.length > 0;

                              return (
                                <>
                                  {hasSelected ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
                                        background: "rgba(59, 130, 246, 0.15)",
                                        border: "1px solid rgba(59, 130, 246, 0.35)",
                                        padding: "6px 10px",
                                        borderRadius: 8,
                                        marginBottom: 8,
                                        fontSize: "0.72rem",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#60a5fa", fontWeight: 700 }}>
                                        <span>✓ {selectedInAcc.length} seleccionados</span>
                                      </div>

                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        {/* Year Change Batch */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <select
                                            value={batchTargetYear}
                                            onChange={(e) => setBatchTargetYear(e.target.value)}
                                            style={{
                                              background: "#0f172a",
                                              border: "1px solid rgba(255,255,255,0.2)",
                                              borderRadius: 4,
                                              color: "#f8fafc",
                                              padding: "2px 6px",
                                              fontSize: "0.68rem",
                                            }}
                                          >
                                            <option value="2026">2026</option>
                                            <option value="2025">2025</option>
                                            <option value="2024">2024</option>
                                            <option value="2023">2023</option>
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => handleBatchChangeYear(selectedInAcc.map((t) => t.id), batchTargetYear)}
                                            style={{
                                              background: "#10b981",
                                              border: "none",
                                              borderRadius: 4,
                                              color: "#000",
                                              fontWeight: 700,
                                              padding: "3px 8px",
                                              fontSize: "0.68rem",
                                              cursor: "pointer",
                                            }}
                                            title="Cambiar el año de todos los movimientos seleccionados"
                                          >
                                            📅 Cambiar Año
                                          </button>
                                        </div>

                                        {/* Delete Batch */}
                                        <button
                                          type="button"
                                          onClick={() => handleBatchDelete(selectedInAcc.map((t) => t.id))}
                                          style={{
                                            background: "#f43f5e",
                                            border: "none",
                                            borderRadius: 4,
                                            color: "#fff",
                                            fontWeight: 700,
                                            padding: "3px 8px",
                                            fontSize: "0.68rem",
                                            cursor: "pointer",
                                          }}
                                          title="Eliminar todos los movimientos seleccionados"
                                        >
                                          🗑️ Eliminar ({selectedInAcc.length})
                                        </button>

                                        {/* Deselect */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedTxIds((prev) => {
                                              const next = new Set(prev);
                                              selectedInAcc.forEach((t) => next.delete(t.id));
                                              return next;
                                            });
                                          }}
                                          style={{
                                            background: "transparent",
                                            border: "1px solid rgba(255,255,255,0.2)",
                                            borderRadius: 4,
                                            color: "#94a3b8",
                                            padding: "2px 6px",
                                            fontSize: "0.65rem",
                                            cursor: "pointer",
                                          }}
                                        >
                                          ✕ Desmarcar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.64rem", color: "#94a3b8", marginBottom: 8 }}>
                                      <span>Mostrando: <strong style={{ color: "#f1f5f9" }}>{filteredTx.length}</strong> de {accTx.length}</span>
                                      <span>•</span>
                                      <span>Total Entradas: <strong style={{ color: "#10b981" }}>+${totalCredits.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong></span>
                                      <span>•</span>
                                      <span>Total Salidas: <strong style={{ color: "#f43f5e" }}>-${totalDebits.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong></span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {/* Table Container with Scroll */}
                            <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                              {filteredTx.length === 0 ? (
                                <div style={{ fontSize: "0.72rem", color: "#64748b", textAlign: "center", padding: "14px 0" }}>
                                  No se encontraron movimientos con los filtros aplicados.
                                </div>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "#64748b", textAlign: "left", position: "sticky", top: 0, background: "#0b1120", zIndex: 1 }}>
                                      <th style={{ padding: "5px 4px", width: 22, textAlign: "center" }}>
                                        <input
                                          type="checkbox"
                                          checked={filteredTx.length > 0 && filteredTx.every((t) => selectedTxIds.has(t.id))}
                                          onChange={() => handleSelectAllInAccount(filteredTx)}
                                          title="Seleccionar / Deseleccionar todos"
                                          style={{ cursor: "pointer" }}
                                        />
                                      </th>
                                      <th style={{ padding: "5px 4px", fontWeight: 600 }}>Fecha</th>
                                      <th style={{ padding: "5px 4px", fontWeight: 600 }}>Descripción / Concepto</th>
                                      <th style={{ padding: "5px 4px", fontWeight: 600, textAlign: "center" }}>Tipo</th>
                                      <th style={{ padding: "5px 4px", fontWeight: 600, textAlign: "right" }}>Monto</th>
                                      <th style={{ padding: "5px 4px", width: 44, textAlign: "right" }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredTx.map((tx, txIdx) => {
                                      const descLower = (tx.description || "").toLowerCase();
                                      const isDebit =
                                        tx.type === "debit" ||
                                        descLower.includes("retiraste") ||
                                        descLower.includes("retiro") ||
                                        descLower.includes("invertiste") ||
                                        Number(tx.amount) < 0;
                                      const isCredit = !isDebit;
                                      const isSelected = selectedTxIds.has(tx.id);

                                      return (
                                        <tr
                                          key={tx.id || `tx_${txIdx}`}
                                          style={{
                                            borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
                                            background: isSelected ? "rgba(59, 130, 246, 0.1)" : "transparent",
                                            transition: "background 0.15s ease",
                                          }}
                                        >
                                          <td style={{ padding: "5px 4px", textAlign: "center" }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleToggleSelectTx(tx.id)}
                                              style={{ cursor: "pointer" }}
                                            />
                                          </td>
                                          <td style={{ padding: "5px 4px", color: "#94a3b8", fontFamily: "JetBrains Mono" }}>{tx.date}</td>
                                          <td style={{ padding: "5px 4px", color: "#e2e8f0" }}>{tx.description || "Movimiento"}</td>
                                          <td style={{ padding: "5px 4px", textAlign: "center" }}>
                                            <span style={{
                                              padding: "1px 6px",
                                              borderRadius: 4,
                                              fontSize: "0.6rem",
                                              fontWeight: 700,
                                              background: isCredit ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                                              color: isCredit ? "#10b981" : "#f43f5e",
                                            }}>
                                              {isCredit ? "Depósito" : "Retiro"}
                                            </span>
                                          </td>
                                          <td style={{
                                            padding: "5px 4px",
                                            textAlign: "right",
                                            fontFamily: "JetBrains Mono",
                                            fontWeight: 600,
                                            color: isCredit ? "#10b981" : "#f43f5e",
                                          }}>
                                            {isCredit ? "+" : "-"}${Math.abs(Number(tx.amount || 0)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                          </td>
                                          <td style={{ padding: "5px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditItem({
                                                  ...tx,
                                                  accountId: tx.accountId || acc.id,
                                                });
                                                setEditType("transaction");
                                                setModalTab("transaction");
                                                setModalOpen(true);
                                              }}
                                              style={{
                                                background: "transparent",
                                                border: "none",
                                                color: "#64748b",
                                                cursor: "pointer",
                                                fontSize: "0.7rem",
                                                padding: "0 4px",
                                              }}
                                              title="Editar este movimiento"
                                            >
                                              ✏️
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteTransaction(tx)}
                                              style={{
                                                background: "transparent",
                                                border: "none",
                                                color: "#475569",
                                                cursor: "pointer",
                                                fontSize: "0.65rem",
                                                padding: "0 2px",
                                              }}
                                              title="Eliminar movimiento"
                                            >
                                              ✕
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Term Deposits / CDTs List */}
                {entityCDTs.filter((c) => c.status !== "matured").length > 0 && (
                  <div
                    style={{
                      background: "rgba(245, 158, 11, 0.02)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      border: "1px solid rgba(245, 158, 11, 0.12)",
                      marginTop: 8,
                    }}
                  >
                    <h5
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>⏳ CDTs Activos (Abiertos / Sin Cierre)</span>
                    </h5>

                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              textAlign: "left",
                            }}
                          >
                            <th style={{ padding: "4px 2px", fontWeight: 600 }}>CDT / Bolsa</th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Plazo
                            </th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Tasa
                            </th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Estado / Vencimiento
                            </th>
                            <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                              Capital
                            </th>
                            <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                              Rendimiento a Hoy
                            </th>
                            <th style={{ padding: "4px 2px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entityCDTs
                            .filter((c) => c.status !== "matured")
                            .map((cdt, idx) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const maturity = new Date(cdt.maturityDate || cdt.startDate);
                              maturity.setHours(0, 0, 0, 0);
                              const start = new Date(cdt.startDate);
                              start.setHours(0, 0, 0, 0);

                              const daysRemaining = Math.max(
                                0,
                                Math.ceil((maturity - today) / (1000 * 3600 * 24)),
                              );
                              const isPastMaturity = maturity < today;

                              return (
                                <tr
                                  key={`cdt_${cdt.id}_row_${idx}`}
                                  style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}
                                >
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      color: "#e2e8f0",
                                      fontWeight: 500,
                                    }}
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      {cdt.category || cdt.name.replace(/\s*\$\s*[\d\.,]+/i, "")}
                                    </div>
                                    <div style={{ fontSize: "0.62rem", color: "#64748b" }}>
                                      {cdt.startDate} ➔ {cdt.maturityDate || cdt.startDate}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "center",
                                      color: "#e2e8f0",
                                    }}
                                  >
                                    {cdt.termDays || 180}d
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "center",
                                      color: "#f59e0b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {cdt.interestRateEA}%
                                  </td>
                                  <td style={{ padding: "6px 2px", textAlign: "center" }}>
                                    <span
                                      style={{
                                        fontSize: "0.65rem",
                                        fontWeight: 600,
                                        color: isPastMaturity
                                          ? "#f87171"
                                          : daysRemaining === 0
                                            ? "#10b981"
                                            : "#f59e0b",
                                      }}
                                    >
                                      {isPastMaturity
                                        ? `⚠️ Expirado el ${cdt.maturityDate}`
                                        : daysRemaining === 0
                                          ? "¡Vence Hoy / Disponible!"
                                          : `Falta(n) ${daysRemaining} días`}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "right",
                                      fontFamily: "JetBrains Mono",
                                      color: "#f1f5f9",
                                      fontWeight: 600,
                                    }}
                                  >
                                    $
                                    {cdt.capital.toLocaleString("en-US", {
                                      maximumFractionDigits: 0,
                                    })}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "right",
                                      fontFamily: "JetBrains Mono",
                                      color: "#22c55e",
                                      fontWeight: 700,
                                      fontSize: "0.72rem",
                                    }}
                                  >
                                    {(() => {
                                      const rateDecimal = (cdt.interestRateEA || 0) / 100;
                                      const reteMul = 1 - (cdt.reteFuentePct || 4) / 100;
                                      const startD = new Date(cdt.startDate);
                                      const nowD = new Date();
                                      const daysEl = Math.max(0, Math.floor((nowD - startD) / (1000 * 60 * 60 * 24)));
                                      const gain = (cdt.capital || 0) * (Math.pow(1 + rateDecimal, daysEl / 360) - 1) * reteMul;
                                      return `+$${gain.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
                                    })()}
                                  </td>
                                  <td style={{ padding: "6px 2px", textAlign: "right" }}>
                                    <button
                                      onClick={() => handleEdit(cdt, "cdt")}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#475569",
                                        cursor: "pointer",
                                        fontSize: "0.7rem",
                                      }}
                                      title="Editar CDT"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCDT(cdt)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#475569",
                                        cursor: "pointer",
                                        fontSize: "0.7rem",
                                      }}
                                      title="Eliminar CDT"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Matured / Paired CDTs History List (Acordeón Desplegable) */}
                {entityCDTs.filter((c) => c.status === "matured").length > 0 && (() => {
                  const maturedCDTs = entityCDTs.filter((c) => c.status === "matured");
                  const isMaturedExpanded = expandedMaturedEntities.has(entity.id);

                  return (
                    <div
                      style={{
                        background: "rgba(16, 185, 129, 0.02)",
                        borderRadius: 10,
                        border: `1px solid ${isMaturedExpanded ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.12)"}`,
                        marginTop: 8,
                        overflow: "hidden",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        onClick={() => toggleMaturedExpand(entity.id)}
                        style={{
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <h5
                          style={{
                            margin: 0,
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            color: "#10b981",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>📜 Historial de CDTs Liquidados ({maturedCDTs.length})</span>
                        </h5>
                        <button
                          type="button"
                          style={{
                            background: isMaturedExpanded ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                            border: `1px solid ${isMaturedExpanded ? "#10b981" : "rgba(255, 255, 255, 0.1)"}`,
                            borderRadius: 6,
                            color: isMaturedExpanded ? "#10b981" : "#94a3b8",
                            padding: "3px 8px",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span>{isMaturedExpanded ? "Ocultar ▲" : "Ver historial ▼"}</span>
                        </button>
                      </div>

                      {isMaturedExpanded && (
                        <div style={{ padding: "0 14px 12px 14px", maxHeight: "280px", overflowY: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: "0.7rem",
                              color: "#94a3b8",
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  textAlign: "left",
                                }}
                              >
                                <th style={{ padding: "4px 2px", fontWeight: 600 }}>CDT / Bolsa</th>
                                <th
                                  style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                                >
                                  Plazo
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Ingreso
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Salida
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Ganancia
                                </th>
                                <th style={{ padding: "4px 2px" }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {maturedCDTs.map((cdt, idx) => {
                                const profit = cdt.netProfit || cdt.payoutAmount - cdt.capital || 0;

                                return (
                                  <tr
                                    key={`matured_${cdt.id}_${idx}`}
                                    style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}
                                  >
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        color: "#e2e8f0",
                                        fontWeight: 500,
                                      }}
                                    >
                                      <div style={{ fontWeight: 600 }}>
                                        {cdt.category ||
                                          cdt.name
                                            .replace(/CDT Nu\s*\(Vencid[^\)]*\)\s*Vencido/i, "")
                                            .trim()}
                                      </div>
                                      <div style={{ fontSize: "0.62rem", color: "#64748b" }}>
                                        {cdt.startDate} ➔ {cdt.payoutDate || cdt.maturityDate}
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "center",
                                        color: "#e2e8f0",
                                      }}
                                    >
                                      {cdt.termDays || 180}d
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                      }}
                                    >
                                      $
                                      {cdt.capital.toLocaleString("en-US", {
                                        maximumFractionDigits: 0,
                                      })}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                        color: "#f43f5e",
                                        fontWeight: 600,
                                      }}
                                    >
                                      $
                                      {(cdt.payoutAmount || cdt.capital).toLocaleString("en-US", {
                                        maximumFractionDigits: 0,
                                      })}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                        color: "#10b981",
                                        fontWeight: 700,
                                      }}
                                    >
                                      +${profit.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                                    </td>
                                    <td style={{ padding: "6px 2px", textAlign: "right" }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEdit(cdt, "cdt");
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#475569",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                          marginRight: 4,
                                        }}
                                        title="Editar CDT"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCDT(cdt);
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#475569",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                        }}
                                        title="Eliminar del Historial"
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {entityAccounts.length === 0 && entityCDTs.length === 0 && (
                  <div
                    style={{
                      padding: "24px 16px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      background: "rgba(255, 255, 255, 0.02)",
                      borderRadius: 10,
                      border: "1px dashed rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                      Sin cuentas ni CDTs registrados aún en <strong style={{ color: "#f1f5f9" }}>{entity.name}</strong>.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                      <button
                        onClick={() => {
                          setSelectedModalEntityId(entity.id);
                          setEditItem(null);
                          setEditType(null);
                          setModalTab("account");
                          setModalOpen(true);
                        }}
                        style={{
                          background: "#10b981",
                          color: "#000",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        + Crear Cuenta / Bolsillo
                      </button>
                      <button
                        onClick={() => {
                          setSelectedModalEntityId(entity.id);
                          setEditItem(null);
                          setEditType(null);
                          setModalTab("cdt");
                          setModalOpen(true);
                        }}
                        style={{
                          background: "#f59e0b",
                          color: "#000",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        + Registrar CDT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL DE CREACIÓN / EDICIÓN ──────────────────── */}
      <FixedIncomeModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditItem(null);
          setEditType(null);
          setSelectedModalEntityId(null);
        }}
        initialTab={modalTab}
        initialEntityId={selectedModalEntityId}
        editItem={editItem}
      />

      {/* ── MODAL DE IMPORTACIÓN INTELIGENTE DE EXTRACTOS (PDF) ── */}
      <StatementImporterModal isOpen={importerOpen} onClose={() => setImporterOpen(false)} />
    </div>
  );
}
