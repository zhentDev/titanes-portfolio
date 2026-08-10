import { useState, useMemo, useEffect } from 'react';
import { useFixedIncomeStore } from '../../store/fixedIncomeStore';
import { fetchFxHistory, fetchColInflationHistory } from '../../api/client';
import FixedIncomeProjectionChart from './FixedIncomeProjectionChart';
import FixedIncomeModal from './FixedIncomeModal';
import StatementImporterModal from './StatementImporterModal';
import { toastConfirm } from '../../utils/toastAlerts';
import toast from 'react-hot-toast';

export default function FixedIncomeHub() {
  const {
    entities,
    accounts,
    cdts,
    preferredCurrency,
    projectionTimeline,
    projectionMode,
    monthlyDepositContribution,
    setPreferredCurrency,
    setProjectionTimeline,
    setProjectionMode,
    setMonthlyDepositContribution,
    deleteEntity,
    deleteAccount,
    deleteCDT,
    initFetchFixedIncome,
  } = useFixedIncomeStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('account');
  const [importerOpen, setImporterOpen] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [fxRate, setFxRate] = useState(4150); // USD-COP fallback
  const [colInflationRate, setColInflationRate] = useState(5.16); // YoY IPC fallback

  useEffect(() => {
    initFetchFixedIncome();
    fetchFxHistory('USD', 'COP')
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
    const ok = await toastConfirm(`¿Eliminar la entidad "${entity.name}" y todos sus productos asociados?`);
    if (ok) {
      deleteEntity(entity.id);
      toast.success(`Entidad "${entity.name}" eliminada`);
    }
  };

  // Helper to convert any amount to the preferred currency (COP or USD)
  const convertAmount = (amount, fromCurrency) => {
    if (!amount) return 0;
    if (fromCurrency === preferredCurrency) return amount;
    if (fromCurrency === 'USD' || fromCurrency === 'USDC') {
      return preferredCurrency === 'COP' ? amount * fxRate : amount;
    }
    if (fromCurrency === 'COP') {
      return preferredCurrency === 'USD' ? amount / fxRate : amount;
    }
    return amount;
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

  // ── Financial Metrics Aggregation ───────────────────────
  const metrics = useMemo(() => {
    let totalPatrimony = 0;
    let totalDailyIncome = 0;
    let weightedRateSum = 0;

    // Accounts / Pockets
    accounts.forEach((acc) => {
      const val = convertAmount(acc.balance, acc.currency);
      totalPatrimony += val;

      const rateDecimal = (acc.interestRateEA || 0) / 100;
      const dailyRate = Math.pow(1 + rateDecimal, 1 / 365) - 1;
      const dailyIncome = val * dailyRate;

      totalDailyIncome += dailyIncome;
      weightedRateSum += acc.interestRateEA * val;
    });

    // Term Deposits / CDTs
    cdts.forEach((cdt) => {
      const val = convertAmount(cdt.capital, cdt.currency);
      totalPatrimony += val;

      const rateDecimal = (cdt.interestRateEA || 0) / 100;
      const dailyRate = Math.pow(1 + rateDecimal, 1 / 365) - 1;
      const reteMultiplier = 1 - (cdt.reteFuentePct || 4) / 100;
      const dailyIncome = val * dailyRate * reteMultiplier;

      totalDailyIncome += dailyIncome;
      weightedRateSum += cdt.interestRateEA * val;
    });

    const weightedEA = totalPatrimony > 0 ? weightedRateSum / totalPatrimony : 0;
    const monthlyIncome = totalDailyIncome * 30.416; // Average month days

    // Fisher Equation Real Rate: (1 + EA) / (1 + Inflation) - 1
    const inflationDecimal = (preferredCurrency === 'COP' ? colInflationRate : 3.0) / 100;
    const realRateEA = ((1 + weightedEA / 100) / (1 + inflationDecimal) - 1) * 100;

    return {
      totalPatrimony,
      totalDailyIncome,
      monthlyIncome,
      weightedEA,
      realRateEA,
    };
  }, [accounts, cdts, preferredCurrency, fxRate, colInflationRate]);

  // ── Quantitative Projections Series Generator ───────────
  const projectionSeries = useMemo(() => {
    const daysMap = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      '3Y': 1095,
      '5Y': 1825,
    };
    const totalDays = daysMap[projectionTimeline] || 365;
    const stepDays = totalDays <= 90 ? 1 : totalDays <= 365 ? 5 : 15;

    const baseVal = metrics.totalPatrimony;
    const rateEA = metrics.weightedEA / 100;
    const inflationEA = (preferredCurrency === 'COP' ? colInflationRate : 3.0) / 100;

    const dailyNominalRate = Math.pow(1 + rateEA, 1 / 365) - 1;
    const dailyInflationRate = Math.pow(1 + inflationEA, 1 / 365) - 1;

    const series = [];
    const today = new Date();

    let runningBalance = baseVal;
    let runningCapital = baseVal;
    const monthlyDepositConverted = convertAmount(monthlyDepositContribution, 'COP');
    const dailyDepositContribution = (monthlyDepositConverted * 12) / 365;

    for (let d = 0; d <= totalDays; d += stepDays) {
      if (d > 0) {
        for (let i = 0; i < stepDays; i++) {
          runningBalance += dailyDepositContribution;
          runningCapital += dailyDepositContribution;
          runningBalance += runningBalance * dailyNominalRate;
        }
      }

      const pointDate = new Date(today.getTime() + d * 86400000);
      const isoDate = pointDate.toISOString().slice(0, 10);
      const label = pointDate.toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: totalDays > 365 ? '2-digit' : undefined });

      let finalProjectedValue = runningBalance;
      if (projectionMode === 'REAL') {
        const discountFactor = Math.pow(1 + dailyInflationRate, d);
        finalProjectedValue = runningBalance / discountFactor;
      }

      series.push({
        date: isoDate,
        dateLabel: label,
        projectedValue: Math.round(finalProjectedValue),
        baseCapital: Math.round(runningCapital),
      });
    }

    return series;
  }, [metrics, projectionTimeline, projectionMode, monthlyDepositContribution, preferredCurrency, colInflationRate]);

  const currSymbol = preferredCurrency === 'COP' ? 'COP $' : 'USD $';

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── HEADER SUMMARY KPI BAR ────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          background: 'rgba(15, 23, 42, 0.65)',
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Patrimonio Renta Fija</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f1f5f9', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            {currSymbol} {metrics.totalPatrimony.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
            {preferredCurrency === 'COP' ? `≈ USD $${(metrics.totalPatrimony / fxRate).toFixed(2)}` : `≈ COP $${(metrics.totalPatrimony * fxRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rendimiento Diario</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#10b981', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            +{currSymbol} {metrics.totalDailyIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 2 }}>
            Generación pasiva diaria
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rendimiento Mensual Estimado</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#38bdf8', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            +{currSymbol} {metrics.monthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
            ≈ 30.4 días capitalizables
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tasa Ponderada E.A.</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            {metrics.weightedEA.toFixed(2)}% <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>E.A.</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: 2 }}>
            Promedio ponderado del capital
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rendimiento Real (vs IPC)</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: metrics.realRateEA >= 0 ? '#10b981' : '#ef4444', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            {metrics.realRateEA >= 0 ? '+' : ''}{metrics.realRateEA.toFixed(2)}% <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>Real</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
            Ajustado por inflación ({preferredCurrency === 'COP' ? `IPC CO ${colInflationRate}%` : 'IPC US 3.0%'})
          </div>
        </div>
      </div>

      {/* ── ACTION & FILTER CONTROLS BAR ─────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setImporterOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)', color: '#0f172a', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)' }}
          >
            📄 Importar Extracto PDF / Foto
          </button>
          <button
            onClick={() => { setModalTab('account'); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            + Cuenta / Bolsillo
          </button>
          <button
            onClick={() => { setModalTab('cdt'); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f59e0b', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            + Nuevo CDT
          </button>
          <button
            onClick={() => { setModalTab('entity'); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.08)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Currency & Timeline Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Divisa */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 18, padding: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setPreferredCurrency('COP')}
              style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: preferredCurrency === 'COP' ? '#10b981' : 'transparent', color: preferredCurrency === 'COP' ? '#000' : '#94a3b8', fontWeight: preferredCurrency === 'COP' ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}
            >
              🇨🇴 COP
            </button>
            <button
              onClick={() => setPreferredCurrency('USD')}
              style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: preferredCurrency === 'USD' ? '#00e5ff' : 'transparent', color: preferredCurrency === 'USD' ? '#000' : '#94a3b8', fontWeight: preferredCurrency === 'USD' ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}
            >
              🇺🇸 USD
            </button>
          </div>

          {/* Modo Proyección */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 18, padding: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setProjectionMode('NOMINAL')}
              style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: projectionMode === 'NOMINAL' ? '#38bdf8' : 'transparent', color: projectionMode === 'NOMINAL' ? '#000' : '#94a3b8', fontWeight: projectionMode === 'NOMINAL' ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Nominal
            </button>
            <button
              onClick={() => setProjectionMode('REAL')}
              style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: projectionMode === 'REAL' ? '#f59e0b' : 'transparent', color: projectionMode === 'REAL' ? '#000' : '#94a3b8', fontWeight: projectionMode === 'REAL' ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Real (Ajustado IPC)
            </button>
          </div>

          {/* Horizonte Temporal */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 18, padding: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
            {['1M', '3M', '6M', '1Y', '3Y', '5Y'].map((t) => (
              <button
                key={t}
                onClick={() => setProjectionTimeline(t)}
                style={{ padding: '5px 10px', borderRadius: 15, border: 'none', background: projectionTimeline === t ? '#820ad1' : 'transparent', color: projectionTimeline === t ? '#fff' : '#94a3b8', fontWeight: projectionTimeline === t ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE PROJECTION CHART ─────────────────── */}
      <FixedIncomeProjectionChart
        projectionData={projectionSeries}
        currency={preferredCurrency}
        mode={projectionMode}
      />

      {/* ── SIMULATOR CONTRIBUTION BAR ───────────────────── */}
      <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.18)', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>🧮</span>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9' }}>Simulador de Aporte Mensual Adicional</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Proyecta cómo crece tu patrimonio sumando un ahorro recurrente cada mes</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            min="0"
            max="10000000"
            step="100000"
            value={monthlyDepositContribution}
            onChange={(e) => setMonthlyDepositContribution(Number(e.target.value))}
            style={{ width: 160, cursor: 'pointer' }}
          />
          <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', minWidth: 120 }}>
            +{currSymbol} {convertAmount(monthlyDepositContribution, 'COP').toLocaleString('en-US', { maximumFractionDigits: 0 })} / mes
          </span>
          {monthlyDepositContribution > 0 && (
            <button
              onClick={() => setMonthlyDepositContribution(0)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              Reiniciar
            </button>
          )}
        </div>
      </div>

      {/* ── ENTITIES & ACCOUNTS GRID HEADER ──────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 -6px 0' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#f1f5f9', fontWeight: 700 }}>
          🏦 Entidades y Cuentas Activas ({activeEntities.length})
        </h4>
        <button
          onClick={() => setShowAllEntities(!showAllEntities)}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
        >
          {showAllEntities ? 'Ver solo entidades con saldo' : 'Ver catálogo completo de entidades'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {activeEntities.map((entity) => {
          const entityAccounts = accounts.filter((a) => a.entityId === entity.id);
          const entityCDTs = cdts.filter((c) => c.entityId === entity.id);

          const entityTotal =
            entityAccounts.reduce((sum, a) => sum + convertAmount(a.balance, a.currency), 0) +
            entityCDTs.reduce((sum, c) => sum + convertAmount(c.capital, c.currency), 0);

          return (
            <div
              key={entity.id}
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                borderRadius: 14,
                border: `1px solid ${entity.color}33`,
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              {/* Entity Card Header */}
              <div style={{ padding: '14px 18px', background: `${entity.color}15`, borderBottom: `1px solid ${entity.color}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>{entity.icon}</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1rem' }}>
                      {entity.name} <span style={{ fontSize: '0.75rem' }}>{entity.country}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {entityAccounts.length} cuenta(s) • {entityCDTs.length} CDT(s)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem' }}>
                      {currSymbol} {entityTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteEntity(entity)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}
                    title="Eliminar Entidad"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Accounts & Pockets List */}
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {entityAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.85rem' }}>{acc.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                        Tasa: <span style={{ color: '#10b981', fontWeight: 700 }}>{acc.interestRateEA}% E.A.</span>
                        {acc.isTaxExemptGMF && <span style={{ marginLeft: 6, color: '#38bdf8', fontSize: '0.65rem' }}>Exenta 4x1000</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="mono" style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
                        ${acc.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{acc.currency}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
                        title="Eliminar Cuenta"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Term Deposits / CDTs List */}
                {entityCDTs.map((cdt) => {
                  const today = new Date();
                  const maturity = new Date(cdt.maturityDate);
                  const start = new Date(cdt.startDate);
                  const totalDays = (maturity - start) / (1000 * 3600 * 24) || 180;
                  const daysElapsed = (today - start) / (1000 * 3600 * 24);
                  const daysRemaining = Math.max(0, Math.ceil((maturity - today) / (1000 * 3600 * 24)));
                  const progressPct = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

                  const rateDecimal = (cdt.interestRateEA || 0) / 100;
                  const totalInterestGross = cdt.capital * (Math.pow(1 + rateDecimal, cdt.termDays / 365) - 1);
                  const reteFuenteAmount = totalInterestGross * ((cdt.reteFuentePct || 4) / 100);
                  const netInterest = totalInterestGross - reteFuenteAmount;
                  const totalAtMaturity = cdt.capital + netInterest;

                  return (
                    <div
                      key={cdt.id}
                      style={{
                        background: 'rgba(245, 158, 11, 0.04)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        border: '1px solid rgba(245, 158, 11, 0.18)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.85rem' }}>📜</span>
                          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.82rem' }}>{cdt.name}</span>
                          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b', fontWeight: 700 }}>
                            {cdt.interestRateEA}% E.A.
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', color: daysRemaining === 0 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                            {daysRemaining === 0 ? '¡Vencido / Disponible!' : `Faltan ${daysRemaining} días`}
                          </span>
                          <button
                            onClick={() => handleDeleteCDT(cdt)}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
                            title="Eliminar CDT"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar towards maturity */}
                      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, height: '100%', background: '#f59e0b', borderRadius: 2, transition: 'width 0.3s ease' }} />
                      </div>

                      {/* Financial Breakdown */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: '0.68rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                        <div>
                          <div>Capital:</div>
                          <div className="mono" style={{ color: '#f1f5f9', fontWeight: 600 }}>${cdt.capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div>
                          <div>ReteFuente ({cdt.reteFuentePct || 4}%):</div>
                          <div className="mono" style={{ color: '#ef4444' }}>-${reteFuenteAmount.toFixed(0)}</div>
                        </div>
                        <div>
                          <div>Neto Vencimiento:</div>
                          <div className="mono" style={{ color: '#10b981', fontWeight: 700 }}>${totalAtMaturity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {entityAccounts.length === 0 && entityCDTs.length === 0 && (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                    Sin cuentas registradas en esta entidad.
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
        onClose={() => setModalOpen(false)}
        initialTab={modalTab}
      />

      {/* ── MODAL DE IMPORTACIÓN INTELIGENTE DE EXTRACTOS (PDF) ── */}
      <StatementImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
      />
    </div>
  );
}