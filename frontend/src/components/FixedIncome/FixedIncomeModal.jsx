import { useState, useEffect } from 'react';
import { useFixedIncomeStore } from '../../store/fixedIncomeStore';
import { suggestFixedIncomeRate, calculateCompoundHistory } from '../../api/client';
import toast from 'react-hot-toast';

export default function FixedIncomeModal({ isOpen, onClose, initialTab = 'account', editItem = null }) {
  const { entities, addEntity, updateEntity, addAccount, updateAccount, addCDT, updateCDT } = useFixedIncomeStore();
  const [activeTab, setActiveTab] = useState(initialTab); // 'entity' | 'account' | 'cdt' | 'calculator'

  // Entity Form State
  const [entityName, setEntityName] = useState('');
  const [entityCountry, setEntityCountry] = useState('🇨🇴');
  const [entityColor, setEntityColor] = useState('#820ad1');
  const [entityIcon, setEntityIcon] = useState('💜');

  // Account Form State
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('pocket');
  const [accountCurrency, setAccountCurrency] = useState('COP');
  const [accountBalance, setAccountBalance] = useState('');
  const [accountRateEA, setAccountRateEA] = useState('');
  const [accountTaxExempt, setAccountTaxExempt] = useState(true);

  // CDT Form State
  const [cdtName, setCdtName] = useState('');
  const [cdtCapital, setCdtCapital] = useState('');
  const [cdtCurrency, setCdtCurrency] = useState('COP');
  const [cdtRateEA, setCdtRateEA] = useState('');
  const [cdtTermDays, setCdtTermDays] = useState(180);
  const [cdtStartDate, setCdtStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [cdtMaturityDate, setCdtMaturityDate] = useState('');
  const [cdtReteFuente, setCdtReteFuente] = useState(4.0);
  const [cdtAutoRenew, setCdtAutoRenew] = useState(false);
  const [cdtAvailableTiers, setCdtAvailableTiers] = useState([]);
  const [suggestedRateLabel, setSuggestedRateLabel] = useState('');

  // Historical Aportes Calculator State
  const [calcEntityId, setCalcEntityId] = useState('');
  const [calcAccountName, setCalcAccountName] = useState('');
  const [calcDeposits, setCalcDeposits] = useState([
    { id: 1, date: new Date().toISOString().slice(0, 10), amount: '' },
  ]);
  const [calcResult, setCalcResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
    if (entities.length > 0 && !selectedEntityId) {
      setSelectedEntityId(entities[0].id);
      setCalcEntityId(entities[0].id);
    }
  }, [initialTab, entities, isOpen]);

  // Suggest rates when entity, product type, or term changes
  useEffect(() => {
    if (!selectedEntityId) return;

    if (activeTab === 'cdt') {
      suggestFixedIncomeRate(selectedEntityId, 'cdt', cdtTermDays, cdtStartDate).then((res) => {
        if (res?.rateEA && !cdtRateEA) {
          setCdtRateEA(String(res.rateEA));
        }
        if (res?.tiers) {
          setCdtAvailableTiers(res.tiers);
        }
        if (res?.label) {
          setSuggestedRateLabel(res.label);
        }
      });
    } else if (activeTab === 'account') {
      suggestFixedIncomeRate(selectedEntityId, accountType, null, new Date().toISOString().slice(0, 10)).then((res) => {
        if (res?.rateEA && !accountRateEA) {
          setAccountRateEA(String(res.rateEA));
        }
        if (res?.label) {
          setSuggestedRateLabel(res.label);
        }
      });
    }
  }, [selectedEntityId, activeTab, cdtTermDays, cdtStartDate, accountType]);

  // Auto-calculate maturity date when term or start date changes
  useEffect(() => {
    if (cdtStartDate && cdtTermDays) {
      const d = new Date(cdtStartDate);
      d.setDate(d.getDate() + Number(cdtTermDays));
      setCdtMaturityDate(d.toISOString().slice(0, 10));
    }
  }, [cdtStartDate, cdtTermDays]);

  if (!isOpen) return null;

  const handleSaveEntity = async (e) => {
    e.preventDefault();
    if (!entityName.trim()) {
      toast.error('Ingresa el nombre de la entidad');
      return;
    }
    await addEntity({
      name: entityName,
      country: entityCountry,
      color: entityColor,
      icon: entityIcon,
    });
    setEntityName('');
    onClose();
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error('Selecciona una entidad');
      return;
    }
    if (!accountName.trim()) {
      toast.error('Ingresa el nombre de la cuenta o bolsillo');
      return;
    }
    await addAccount({
      entityId: selectedEntityId,
      name: accountName,
      type: accountType,
      currency: accountCurrency,
      balance: Number(accountBalance || 0),
      interestRateEA: Number(accountRateEA || 0),
      isTaxExemptGMF: accountTaxExempt,
    });
    setAccountName('');
    setAccountBalance('');
    setAccountRateEA('');
    onClose();
  };

  const handleSaveCDT = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error('Selecciona una entidad');
      return;
    }
    if (!cdtName.trim()) {
      toast.error('Ingresa el nombre del CDT');
      return;
    }
    if (!cdtCapital || Number(cdtCapital) <= 0) {
      toast.error('Ingresa un capital válido');
      return;
    }
    await addCDT({
      entityId: selectedEntityId,
      name: cdtName,
      capital: Number(cdtCapital),
      currency: cdtCurrency,
      interestRateEA: Number(cdtRateEA || 0),
      termDays: Number(cdtTermDays),
      startDate: cdtStartDate,
      maturityDate: cdtMaturityDate,
      reteFuentePct: Number(cdtReteFuente),
      isAutoRenew: cdtAutoRenew,
    });
    setCdtName('');
    setCdtCapital('');
    setCdtRateEA('');
    onClose();
  };

  // Add Deposit row in historical calculator
  const addDepositRow = () => {
    setCalcDeposits([
      ...calcDeposits,
      { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: '' },
    ]);
  };

  const removeDepositRow = (id) => {
    if (calcDeposits.length <= 1) return;
    setCalcDeposits(calcDeposits.filter((d) => d.id !== id));
  };

  const updateDepositRow = (id, field, value) => {
    setCalcDeposits(
      calcDeposits.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const handleCalculateHistoricalCompounding = async () => {
    const validDeposits = calcDeposits
      .filter((d) => d.date && Number(d.amount) > 0)
      .map((d) => ({ date: d.date, amount: Number(d.amount) }));

    if (validDeposits.length === 0) {
      toast.error('Ingresa al menos un aporte con fecha y monto');
      return;
    }

    setIsCalculating(true);
    try {
      const res = await calculateCompoundHistory(calcEntityId, validDeposits);
      setCalcResult(res);
      toast.success('Cálculo histórico completado');
    } catch (e) {
      toast.error('Error calculando interés histórico');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSaveCalculatedAccount = async () => {
    if (!calcResult || !calcResult.currentAccumulatedBalance) return;
    const name = calcAccountName.trim() || 'Cuenta Ahorro (Calculada)';
    await addAccount({
      entityId: calcEntityId,
      name: name,
      type: 'pocket',
      currency: 'COP',
      balance: calcResult.currentAccumulatedBalance,
      interestRateEA: 12.0,
      isTaxExemptGMF: true,
    });
    setCalcResult(null);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Container with FIXED Height (560px) and Width (580px) so switching tabs NEVER shifts position */}
      <div style={{ background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 16, width: '100%', maxWidth: 580, height: 560, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', overflow: 'hidden' }}>
        {/* Header Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', flexShrink: 0 }}>
          <button
            onClick={() => setActiveTab('account')}
            style={{ flex: 1, padding: '14px 6px', background: activeTab === 'account' ? 'rgba(16, 185, 129, 0.12)' : 'transparent', color: activeTab === 'account' ? '#10b981' : '#94a3b8', border: 'none', borderBottom: activeTab === 'account' ? '2px solid #10b981' : 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            💰 Cuenta / Bolsillo
          </button>
          <button
            onClick={() => setActiveTab('cdt')}
            style={{ flex: 1, padding: '14px 6px', background: activeTab === 'cdt' ? 'rgba(245, 158, 11, 0.12)' : 'transparent', color: activeTab === 'cdt' ? '#f59e0b' : '#94a3b8', border: 'none', borderBottom: activeTab === 'cdt' ? '2px solid #f59e0b' : 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            📜 CDT / Plazo Fijo
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            style={{ flex: 1, padding: '14px 6px', background: activeTab === 'calculator' ? 'rgba(192, 132, 252, 0.12)' : 'transparent', color: activeTab === 'calculator' ? '#c084fc' : '#94a3b8', border: 'none', borderBottom: activeTab === 'calculator' ? '2px solid #c084fc' : 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            🧮 Aportes por Fecha
          </button>
          <button
            onClick={() => setActiveTab('entity')}
            style={{ flex: 1, padding: '14px 6px', background: activeTab === 'entity' ? 'rgba(0, 229, 255, 0.12)' : 'transparent', color: activeTab === 'entity' ? '#00e5ff' : '#94a3b8', border: 'none', borderBottom: activeTab === 'entity' ? '2px solid #00e5ff' : 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* TAB 1: CUENTA / BOLSILLO */}
          {activeTab === 'account' && (
            <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Entidad Bancaria</label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.icon} {e.name} ({e.country})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Nombre del Producto / Bolsillo</label>
                <input
                  type="text"
                  placeholder="ej. Cajita de Rendimiento, Bolsillo Viajes"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Tipo</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  >
                    <option value="pocket">⚡ Bolsillo / Cajita</option>
                    <option value="savings">💳 Cuenta de Ahorro</option>
                    <option value="wallet">💵 Billetera / Cash Yield</option>
                    <option value="crypto">🪙 Crypto Staking</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Divisa</label>
                  <select
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  >
                    <option value="COP">COP ($)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USDC">USDC (Stablecoin)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Saldo Actual</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="ej. 5000000"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Tasa Efectiva Anual (E.A. %)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ej. 12.0"
                    value={accountRateEA}
                    onChange={(e) => setAccountRateEA(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#94a3b8', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={accountTaxExempt}
                  onChange={(e) => setAccountTaxExempt(e.target.checked)}
                />
                Marcar como Cuenta Exenta de 4x1000 (GMF)
              </label>

              {/* Pinned Footer at Bottom */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: 8, background: '#10b981', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
                  Guardar Cuenta
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CDT / PLAZO FIJO */}
          {activeTab === 'cdt' && (
            <form onSubmit={handleSaveCDT} style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Entidad Emisora</label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.icon} {e.name} ({e.country})
                    </option>
                  ))}
                </select>
              </div>

              {/* Nu/Bank Term Chips for Instant Plazo & Rate Selection */}
              {cdtAvailableTiers.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>Plazos y Tasas Sugeridas para esta Entidad:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cdtAvailableTiers.map((tier, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => {
                          setCdtTermDays(tier.termDaysMax);
                          setCdtRateEA(String(tier.rateEA));
                        }}
                        style={{
                          background: cdtTermDays === tier.termDaysMax ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid ${cdtTermDays === tier.termDaysMax ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'}`,
                          color: cdtTermDays === tier.termDaysMax ? '#f59e0b' : '#94a3b8',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {tier.label}: {tier.rateEA}% E.A.
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Nombre / Identificador del CDT</label>
                <input
                  type="text"
                  placeholder="ej. CDT Nu Congelada 180 Días, CDT Pibank"
                  value={cdtName}
                  onChange={(e) => setCdtName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Capital Invertido</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="ej. 10000000"
                    value={cdtCapital}
                    onChange={(e) => setCdtCapital(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Tasa Pactada (E.A. %)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ej. 12.2"
                    value={cdtRateEA}
                    onChange={(e) => setCdtRateEA(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Plazo (Días)</label>
                  <input
                    type="number"
                    value={cdtTermDays}
                    onChange={(e) => setCdtTermDays(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Fecha Apertura</label>
                  <input
                    type="date"
                    value={cdtStartDate}
                    onChange={(e) => setCdtStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Vencimiento</label>
                  <input
                    type="date"
                    value={cdtMaturityDate}
                    disabled
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Retención en la Fuente (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cdtReteFuente}
                    onChange={(e) => setCdtReteFuente(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#94a3b8', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={cdtAutoRenew}
                      onChange={(e) => setCdtAutoRenew(e.target.checked)}
                    />
                    Auto-Renovable al Vencer
                  </label>
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: 8, background: '#f59e0b', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
                  Registrar CDT
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: APORTES HISTÓRICOS CALCULATOR */}
          {activeTab === 'calculator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Entidad Bancaria</label>
                <select
                  value={calcEntityId}
                  onChange={(e) => setCalcEntityId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.icon} {e.name} ({e.country})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Nombre de la Cuenta (Opcional)</label>
                <input
                  type="text"
                  placeholder="ej. Cajita Principal Nu"
                  value={calcAccountName}
                  onChange={(e) => setCalcAccountName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Aportes Realizados (Fecha y Monto):</span>
                  <button
                    type="button"
                    onClick={addDepositRow}
                    style={{ background: 'rgba(192, 132, 252, 0.15)', border: '1px solid #c084fc', color: '#c084fc', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Agregar Aporte
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {calcDeposits.map((dep, idx) => (
                    <div key={dep.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', minWidth: 20 }}>#{idx + 1}</span>
                      <input
                        type="date"
                        value={dep.date}
                        onChange={(e) => updateDepositRow(dep.id, 'date', e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.8rem' }}
                      />
                      <input
                        type="number"
                        placeholder="Monto ($)"
                        value={dep.amount}
                        onChange={(e) => updateDepositRow(dep.id, 'amount', e.target.value)}
                        style={{ flex: 1.2, padding: '6px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#10b981', fontWeight: 700, fontSize: '0.8rem' }}
                      />
                      {calcDeposits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDepositRow(dep.id)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCalculateHistoricalCompounding}
                disabled={isCalculating}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isCalculating ? 'Calculando curva histórica...' : '⚡ Calcular Saldo Actual con Tasas Históricas'}
              </button>

              {/* Calculated Result Box */}
              {calcResult && (
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Resultado Crecimiento:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Capital:</div>
                      <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>
                        ${calcResult.totalContributedCapital.toLocaleString('en-US')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Intereses:</div>
                      <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>
                        +${calcResult.totalInterestsEarned.toLocaleString('en-US')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Saldo Actual:</div>
                      <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8' }}>
                        ${calcResult.currentAccumulatedBalance.toLocaleString('en-US')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pinned Footer at Bottom */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}>
                  Cancelar
                </button>
                {calcResult && (
                  <button
                    type="button"
                    onClick={handleSaveCalculatedAccount}
                    style={{ padding: '8px 20px', borderRadius: 8, background: '#10b981', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer' }}
                  >
                    💾 Guardar Cuenta Activa
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: NUEVA ENTIDAD */}
          {activeTab === 'entity' && (
            <form onSubmit={handleSaveEntity} style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Nombre del Banco / Entidad</label>
                <input
                  type="text"
                  placeholder="ej. Nu Colombia, Lulo Bank, Pibank, Interactive Brokers"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>País</label>
                  <select
                    value={entityCountry}
                    onChange={(e) => setEntityCountry(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  >
                    <option value="🇨🇴">🇨🇴 Colombia</option>
                    <option value="🇺🇸">🇺🇸 USA</option>
                    <option value="🇪🇺">🇪🇺 Europa</option>
                    <option value="🌎">🌎 Internacional</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Icono Emoji</label>
                  <input
                    type="text"
                    value={entityIcon}
                    onChange={(e) => setEntityIcon(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Color Distintivo</label>
                  <input
                    type="color"
                    value={entityColor}
                    onChange={(e) => setEntityColor(e.target.value)}
                    style={{ width: '100%', height: 38, padding: 2, borderRadius: 8, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: 8, background: '#00e5ff', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
                  Crear Entidad
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
