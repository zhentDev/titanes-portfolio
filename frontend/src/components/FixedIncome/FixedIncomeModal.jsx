import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { calculateCompoundHistory, suggestFixedIncomeRate } from "../../api/client";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { BANK_PRESETS, getBankPreset, svgToDataUri } from "../../utils/bankPresets";

export default function FixedIncomeModal({
  isOpen,
  onClose,
  initialTab = "account",
  initialEntityId = null,
  editItem = null,
}) {
  const { entities, accounts, addEntity, updateEntity, addAccount, updateAccount, addCDT, updateCDT, addTransaction, updateTransaction } =
    useFixedIncomeStore();
  const [activeTab, setActiveTab] = useState(initialTab); // 'entity' | 'account' | 'cdt' | 'calculator' | 'transaction'

  // Entity Form State
  const [entityName, setEntityName] = useState("");
  const [entityCountry, setEntityCountry] = useState("🇨🇴");
  const [entityColor, setEntityColor] = useState("#820ad1");
  const [entityIcon, setEntityIcon] = useState("💜");
  const [entityLogoUrl, setEntityLogoUrl] = useState("");

  // Account Form State
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("pocket");
  const [accountCurrency, setAccountCurrency] = useState("COP");
  const [accountBalance, setAccountBalance] = useState("");
  const [accountRateEA, setAccountRateEA] = useState("");
  const [accountTaxExempt, setAccountTaxExempt] = useState(true);
  const [accountStartDate, setAccountStartDate] = useState("2023-06-01");

  // CDT Form State
  const [cdtName, setCdtName] = useState("");
  const [cdtCapital, setCdtCapital] = useState("");
  const [cdtCurrency, setCdtCurrency] = useState("COP");
  const [cdtRateEA, setCdtRateEA] = useState("");
  const [cdtTermDays, setCdtTermDays] = useState(180);
  const [cdtStartDate, setCdtStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [cdtMaturityDate, setCdtMaturityDate] = useState("");
  const [cdtReteFuente, setCdtReteFuente] = useState(4.0);
  const [cdtAutoRenew, setCdtAutoRenew] = useState(false);
  const [cdtStatus, setCdtStatus] = useState("active");
  const [cdtPayoutAmount, setCdtPayoutAmount] = useState("");
  const [cdtPayoutDate, setCdtPayoutDate] = useState("");
  const [cdtCategory, setCdtCategory] = useState("");
  const [cdtAvailableTiers, setCdtAvailableTiers] = useState([]);
  const [suggestedRateLabel, setSuggestedRateLabel] = useState("");

  // Transaction / Manual Movement State
  const [txAccountId, setTxAccountId] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txDescription, setTxDescription] = useState("");
  const [txType, setTxType] = useState("credit"); // 'credit' | 'debit'
  const [txAmount, setTxAmount] = useState("");
  const [txUpdateAccountBalance, setTxUpdateAccountBalance] = useState(true);

  // Historical Aportes Calculator State
  const [calcEntityId, setCalcEntityId] = useState("");
  const [calcAccountName, setCalcAccountName] = useState("");
  const [calcDeposits, setCalcDeposits] = useState([
    { id: 1, date: new Date().toISOString().slice(0, 10), amount: "" },
  ]);
  const [calcResult, setCalcResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialEntityId) {
      setSelectedEntityId(initialEntityId);
      setCalcEntityId(initialEntityId);
    } else if (entities.length > 0 && !selectedEntityId) {
      setSelectedEntityId(entities[0].id);
      setCalcEntityId(entities[0].id);
    }
  }, [initialTab, initialEntityId, entities, isOpen]);

  // Pre-fill form fields when editing an existing item, or reset if creating new
  useEffect(() => {
    if (!isOpen) return;

    if (!editItem) {
      if (initialTab === "entity") {
        setEntityName("");
        setEntityCountry("🇨🇴");
        setEntityColor("#820ad1");
        setEntityIcon("💜");
        setEntityLogoUrl("");
      } else if (initialTab === "account") {
        setAccountName("");
        setAccountType("pocket");
        setAccountCurrency("COP");
        setAccountBalance("");
        setAccountRateEA("");
        setAccountTaxExempt(true);
        setAccountStartDate("2023-06-01");
      } else if (initialTab === "cdt") {
        setCdtName("");
        setCdtCapital("");
        setCdtCurrency("COP");
        setCdtRateEA("");
        setCdtTermDays(180);
        setCdtStartDate(new Date().toISOString().slice(0, 10));
        setCdtMaturityDate("");
        setCdtReteFuente(4.0);
        setCdtAutoRenew(false);
        setCdtStatus("active");
        setCdtPayoutAmount("");
        setCdtPayoutDate("");
        setCdtCategory("");
      } else if (initialTab === "transaction") {
        setTxAccountId(accounts[0]?.id || "");
        setTxDate(new Date().toISOString().slice(0, 10));
        setTxDescription("");
        setTxType("credit");
        setTxAmount("");
        setTxUpdateAccountBalance(true);
      }
      return;
    }

    if (initialTab === "entity") {
      setEntityName(editItem.name || "");
      setEntityCountry(editItem.country || "🇨🇴");
      setEntityColor(editItem.color || "#820ad1");
      setEntityIcon(editItem.icon || "💜");
      setEntityLogoUrl(editItem.logoUrl || svgToDataUri(getBankPreset(editItem.name).logoSvg));
    } else if (initialTab === "account") {
      setSelectedEntityId(editItem.entityId || "");
      setAccountName(editItem.name || "");
      setAccountType(editItem.type || "pocket");
      setAccountCurrency(editItem.currency || "COP");
      setAccountBalance(String(editItem.balance || ""));
      setAccountRateEA(String(editItem.interestRateEA || ""));
      setAccountTaxExempt(editItem.isTaxExemptGMF ?? true);
      setAccountStartDate(editItem.startDate || (editItem.createdAt ? editItem.createdAt.slice(0, 10) : "2023-06-01"));
    } else if (initialTab === "cdt") {
      setSelectedEntityId(editItem.entityId || "");
      setCdtName(editItem.name || "");
      setCdtCapital(String(editItem.capital || ""));
      setCdtCurrency(editItem.currency || "COP");
      setCdtRateEA(String(editItem.interestRateEA || ""));
      setCdtTermDays(editItem.termDays || 180);
      setCdtStartDate(editItem.startDate || new Date().toISOString().slice(0, 10));
      setCdtMaturityDate(editItem.maturityDate || "");
      setCdtReteFuente(editItem.reteFuentePct ?? 4.0);
      setCdtAutoRenew(editItem.isAutoRenew || false);
      setCdtStatus(editItem.status || "active");
      setCdtPayoutAmount(String(editItem.payoutAmount || ""));
      setCdtPayoutDate(editItem.payoutDate || "");
      setCdtCategory(editItem.category || "");
    } else if (initialTab === "transaction" || editItem.accountId) {
      setTxAccountId(editItem.accountId || accounts[0]?.id || "");
      setTxDate(editItem.date || new Date().toISOString().slice(0, 10));
      setTxDescription(editItem.description || "");
      setTxType(editItem.type || "credit");
      setTxAmount(editItem.amount ? String(Math.abs(Number(editItem.amount))) : "");
      setTxUpdateAccountBalance(true);
    }
  }, [editItem, isOpen, initialTab, accounts]);

  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    if (!txAccountId) {
      toast.error("Selecciona una cajita o cuenta");
      return;
    }
    const numAmt = Number(txAmount);
    if (!numAmt || numAmt <= 0) {
      toast.error("Ingresa un monto válido mayor a 0");
      return;
    }
    const targetAcc = accounts.find((a) => a.id === txAccountId);
    const signedAmount = txType === "credit" ? numAmt : -numAmt;
    const defaultDesc = txType === "credit" ? `Aporte a ${targetAcc?.name || "Cajita"}` : `Retiro de ${targetAcc?.name || "Cajita"}`;

    if (editItem && editItem.id) {
      // Editing existing transaction
      const oldSignedAmount = Number(editItem.amount || 0);
      const delta = signedAmount - oldSignedAmount;

      await updateTransaction({
        id: editItem.id,
        accountId: txAccountId,
        date: txDate,
        description: txDescription.trim() || defaultDesc,
        amount: signedAmount,
        type: txType,
        currency: targetAcc?.currency || "COP",
      });

      if (txUpdateAccountBalance) {
        if (editItem.accountId === txAccountId && targetAcc) {
          const newBal = Math.max(0, (targetAcc.balance || 0) + delta);
          await updateAccount({ ...targetAcc, balance: newBal });
        } else {
          // Changed account: revert from old, add to new
          const oldAcc = accounts.find((a) => a.id === editItem.accountId);
          if (oldAcc) {
            await updateAccount({ ...oldAcc, balance: Math.max(0, (oldAcc.balance || 0) - oldSignedAmount) });
          }
          if (targetAcc) {
            await updateAccount({ ...targetAcc, balance: Math.max(0, (targetAcc.balance || 0) + signedAmount) });
          }
        }
      }

      toast.success("Movimiento actualizado correctamente");
    } else {
      // Creating new transaction
      await addTransaction({
        accountId: txAccountId,
        date: txDate,
        description: txDescription.trim() || defaultDesc,
        amount: signedAmount,
        type: txType,
        currency: targetAcc?.currency || "COP",
      });

      if (txUpdateAccountBalance && targetAcc) {
        const newBal = Math.max(0, (targetAcc.balance || 0) + signedAmount);
        await updateAccount({ ...targetAcc, balance: newBal });
      }

      toast.success(`Movimiento registrado: ${txType === "credit" ? "+" : "-"}$${numAmt.toLocaleString("en-US")} COP`);
    }

    setTxDescription("");
    setTxAmount("");
    onClose();
  };

  // Suggest rates when entity, product type, or term changes
  useEffect(() => {
    if (!selectedEntityId) return;

    if (activeTab === "cdt") {
      suggestFixedIncomeRate(selectedEntityId, "cdt", cdtTermDays, cdtStartDate).then((res) => {
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
    } else if (activeTab === "account") {
      suggestFixedIncomeRate(
        selectedEntityId,
        accountType,
        null,
        new Date().toISOString().slice(0, 10),
      ).then((res) => {
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
      toast.error("Ingresa el nombre de la entidad");
      return;
    }
    const finalLogo = entityLogoUrl || svgToDataUri(getBankPreset(entityName).logoSvg);
    if (editItem?.id) {
      await updateEntity({
        id: editItem.id,
        name: entityName,
        country: entityCountry,
        color: entityColor,
        icon: entityIcon,
        logoUrl: finalLogo,
      });
    } else {
      await addEntity({
        name: entityName,
        country: entityCountry,
        color: entityColor,
        icon: entityIcon,
        logoUrl: finalLogo,
      });
    }
    setEntityName("");
    setEntityLogoUrl("");
    onClose();
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error("Selecciona una entidad");
      return;
    }
    if (!accountName.trim()) {
      toast.error("Ingresa el nombre de la cuenta o bolsillo");
      return;
    }
    const accountData = {
      entityId: selectedEntityId,
      name: accountName,
      type: accountType,
      currency: accountCurrency,
      balance: Number(accountBalance || 0),
      interestRateEA: Number(accountRateEA || 0),
      isTaxExemptGMF: accountTaxExempt,
      startDate: accountStartDate,
      createdAt: editItem?.createdAt || `${accountStartDate}T00:00:00.000Z`,
    };
    if (editItem?.id) {
      await updateAccount({ ...accountData, id: editItem.id });
    } else {
      await addAccount(accountData);
    }
    setAccountName("");
    setAccountBalance("");
    setAccountRateEA("");
    onClose();
  };

  const handleSaveCDT = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error("Selecciona una entidad");
      return;
    }
    if (!cdtName.trim()) {
      toast.error("Ingresa el nombre del CDT");
      return;
    }
    if (!cdtCapital || Number(cdtCapital) <= 0) {
      toast.error("Ingresa un capital válido");
      return;
    }
    const cdtData = {
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
      status: cdtStatus,
      category: cdtCategory || undefined,
      ...(cdtStatus === "matured" ? {
        payoutAmount: Number(cdtPayoutAmount || 0),
        payoutDate: cdtPayoutDate || cdtMaturityDate,
        netProfit: Number(cdtPayoutAmount || 0) - Number(cdtCapital || 0),
      } : {}),
    };
    if (editItem?.id) {
      await updateCDT({ ...cdtData, id: editItem.id });
    } else {
      await addCDT(cdtData);
    }
    setCdtName("");
    setCdtCapital("");
    setCdtRateEA("");
    setCdtPayoutAmount("");
    setCdtPayoutDate("");
    setCdtCategory("");
    setCdtStatus("active");
    onClose();
  };

  // Add Deposit row in historical calculator
  const addDepositRow = () => {
    setCalcDeposits([
      ...calcDeposits,
      { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: "" },
    ]);
  };

  const removeDepositRow = (id) => {
    if (calcDeposits.length <= 1) return;
    setCalcDeposits(calcDeposits.filter((d) => d.id !== id));
  };

  const updateDepositRow = (id, field, value) => {
    setCalcDeposits(calcDeposits.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleCalculateHistoricalCompounding = async () => {
    const validDeposits = calcDeposits
      .filter((d) => d.date && Number(d.amount) > 0)
      .map((d) => ({ date: d.date, amount: Number(d.amount) }));

    if (validDeposits.length === 0) {
      toast.error("Ingresa al menos un aporte con fecha y monto");
      return;
    }

    setIsCalculating(true);
    try {
      const res = await calculateCompoundHistory(calcEntityId, validDeposits);
      setCalcResult(res);
      toast.success("Cálculo histórico completado");
    } catch (e) {
      toast.error("Error calculando interés histórico");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSaveCalculatedAccount = async () => {
    if (!calcResult || !calcResult.currentAccumulatedBalance) return;
    const name = calcAccountName.trim() || "Cuenta Ahorro (Calculada)";
    await addAccount({
      entityId: calcEntityId,
      name: name,
      type: "pocket",
      currency: "COP",
      balance: calcResult.currentAccumulatedBalance,
      interestRateEA: 12.0,
      isTaxExemptGMF: true,
    });
    setCalcResult(null);
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 999999,
        background: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "76px 16px 24px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Container with FIXED Height and Width so switching tabs NEVER shifts position */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f172a",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 620,
          height: 570,
          maxHeight: "calc(100vh - 96px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.85)",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Header Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(255, 255, 255, 0.02)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab("account")}
            style={{
              flex: 1,
              padding: "14px 6px",
              background: activeTab === "account" ? "rgba(16, 185, 129, 0.12)" : "transparent",
              color: activeTab === "account" ? "#10b981" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "account" ? "2px solid #10b981" : "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            💰 Cuenta / Bolsillo
          </button>
          <button
            onClick={() => setActiveTab("cdt")}
            style={{
              flex: 1,
              padding: "14px 6px",
              background: activeTab === "cdt" ? "rgba(245, 158, 11, 0.12)" : "transparent",
              color: activeTab === "cdt" ? "#f59e0b" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "cdt" ? "2px solid #f59e0b" : "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            📜 CDT / Plazo Fijo
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            style={{
              flex: 1,
              padding: "14px 6px",
              background: activeTab === "calculator" ? "rgba(192, 132, 252, 0.12)" : "transparent",
              color: activeTab === "calculator" ? "#c084fc" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "calculator" ? "2px solid #c084fc" : "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            🧮 Aportes por Fecha
          </button>
          <button
            onClick={() => setActiveTab("transaction")}
            style={{
              flex: 1,
              padding: "14px 6px",
              background: activeTab === "transaction" ? "rgba(56, 189, 248, 0.12)" : "transparent",
              color: activeTab === "transaction" ? "#38bdf8" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "transaction" ? "2px solid #38bdf8" : "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            💸 + Movimiento
          </button>
          <button
            onClick={() => setActiveTab("entity")}
            style={{
              flex: 1,
              padding: "14px 6px",
              background: activeTab === "entity" ? "rgba(0, 229, 255, 0.12)" : "transparent",
              color: activeTab === "entity" ? "#00e5ff" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "entity" ? "2px solid #00e5ff" : "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: 20,
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* TAB 1: CUENTA / BOLSILLO */}
          {activeTab === "account" && (
            <form
              onSubmit={handleSaveAccount}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Entidad Bancaria
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.icon} {e.name} ({e.country})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Nombre del Producto / Bolsillo
                </label>
                <input
                  type="text"
                  placeholder="ej. Cajita de Rendimiento, Bolsillo Viajes"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Tipo
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="pocket">⚡ Bolsillo / Cajita</option>
                    <option value="savings">💳 Cuenta de Ahorro</option>
                    <option value="wallet">💵 Billetera / Cash Yield</option>
                    <option value="crypto">🪙 Crypto Staking</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Divisa
                  </label>
                  <select
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="COP">COP ($)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USDC">USDC (Stablecoin)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Saldo Actual
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="ej. 5000000"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Tasa Efectiva Anual (E.A. %)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ej. 12.0"
                    value={accountRateEA}
                    onChange={(e) => setAccountRateEA(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#10b981",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Fecha Apertura / Inicio
                  </label>
                  <input
                    type="date"
                    value={accountStartDate}
                    onChange={(e) => setAccountStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 16 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={accountTaxExempt}
                      onChange={(e) => setAccountTaxExempt(e.target.checked)}
                    />
                    Exenta de 4x1000 (GMF)
                  </label>
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#10b981",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Guardar Cuenta"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CDT / PLAZO FIJO */}
          {activeTab === "cdt" && (
            <form
              onSubmit={handleSaveCDT}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Entidad Emisora
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
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
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginBottom: 6 }}>
                    Plazos y Tasas Sugeridas para esta Entidad:
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {cdtAvailableTiers.map((tier, idx) => {
                      const isSelected =
                        (cdtTermDays >= tier.termDaysMin && cdtTermDays <= tier.termDaysMax) ||
                        cdtTermDays === tier.termDaysMax;
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => {
                            const discreteDays = [60, 90, 120, 180, 270, 360, 540, 720, 1080].find(
                              (d) => d >= tier.termDaysMin && d <= tier.termDaysMax
                            ) || tier.termDaysMin;
                            setCdtTermDays(discreteDays);
                            setCdtRateEA(String(tier.rateEA));
                          }}
                          style={{
                            background: isSelected
                              ? "rgba(245, 158, 11, 0.25)"
                              : "rgba(255, 255, 255, 0.04)",
                            border: `1px solid ${isSelected ? "#f59e0b" : "rgba(255, 255, 255, 0.1)"}`,
                            color: isSelected ? "#f59e0b" : "#94a3b8",
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {tier.label}: {tier.rateEA}% E.A.
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Nombre / Identificador del CDT
                </label>
                <input
                  type="text"
                  placeholder="ej. CDT Nu Congelada 180 Días, CDT Pibank"
                  value={cdtName}
                  onChange={(e) => setCdtName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Capital Invertido
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="ej. 10000000"
                    value={cdtCapital}
                    onChange={(e) => setCdtCapital(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Tasa Pactada (E.A. %)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ej. 12.2"
                    value={cdtRateEA}
                    onChange={(e) => setCdtRateEA(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f59e0b",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Plazo (Días)
                  </label>
                  <input
                    type="number"
                    value={cdtTermDays}
                    onChange={(e) => setCdtTermDays(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Fecha Apertura
                  </label>
                  <input
                    type="date"
                    value={cdtStartDate}
                    onChange={(e) => setCdtStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Vencimiento
                  </label>
                  <input
                    type="date"
                    value={cdtMaturityDate}
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f59e0b",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Retención en la Fuente (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={cdtReteFuente}
                    onChange={(e) => setCdtReteFuente(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cdtAutoRenew}
                      onChange={(e) => setCdtAutoRenew(e.target.checked)}
                    />
                    Auto-Renovable al Vencer
                  </label>
                </div>
              </div>

              {/* Estado y Categoría (solo visible en modo edición) */}
              {editItem?.id && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
                        Estado
                      </label>
                      <select
                        value={cdtStatus}
                        onChange={(e) => setCdtStatus(e.target.value)}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 8,
                          background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)",
                          color: cdtStatus === "matured" ? "#f59e0b" : "#10b981",
                          fontSize: "0.85rem", fontWeight: 600,
                        }}
                      >
                        <option value="active">🟢 Activo</option>
                        <option value="matured">🟡 Vencido / Liquidado</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
                        Categoría / Bolsa
                      </label>
                      <input
                        type="text"
                        placeholder="ej. Viaje, Estudios, Deuda"
                        value={cdtCategory}
                        onChange={(e) => setCdtCategory(e.target.value)}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 8,
                          background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)",
                          color: "#f1f5f9", fontSize: "0.85rem",
                        }}
                      />
                    </div>
                  </div>

                  {/* Campos de Liquidación (solo si status === matured) */}
                  {cdtStatus === "matured" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
                          Monto de Salida ($)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="ej. 10500000"
                          value={cdtPayoutAmount}
                          onChange={(e) => setCdtPayoutAmount(e.target.value)}
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: 8,
                            background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)",
                            color: "#f43f5e", fontWeight: 700, fontSize: "0.85rem",
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
                          Fecha Liquidación
                        </label>
                        <input
                          type="date"
                          value={cdtPayoutDate}
                          onChange={(e) => setCdtPayoutDate(e.target.value)}
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: 8,
                            background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)",
                            color: "#f1f5f9", fontSize: "0.85rem",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Pinned Footer at Bottom */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#f59e0b",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Registrar CDT"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: APORTES HISTÓRICOS CALCULATOR */}
          {activeTab === "calculator" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Entidad Bancaria
                </label>
                <select
                  value={calcEntityId}
                  onChange={(e) => setCalcEntityId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.icon} {e.name} ({e.country})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Nombre de la Cuenta (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. Cajita Principal Nu"
                  value={calcAccountName}
                  onChange={(e) => setCalcAccountName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    Aportes Realizados (Fecha y Monto):
                  </span>
                  <button
                    type="button"
                    onClick={addDepositRow}
                    style={{
                      background: "rgba(192, 132, 252, 0.15)",
                      border: "1px solid #c084fc",
                      color: "#c084fc",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + Agregar Aporte
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {calcDeposits.map((dep, idx) => (
                    <div key={dep.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", minWidth: 20 }}>
                        #{idx + 1}
                      </span>
                      <input
                        type="date"
                        value={dep.date}
                        onChange={(e) => updateDepositRow(dep.id, "date", e.target.value)}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "#1e293b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#f1f5f9",
                          fontSize: "0.8rem",
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Monto ($)"
                        value={dep.amount}
                        onChange={(e) => updateDepositRow(dep.id, "amount", e.target.value)}
                        style={{
                          flex: 1.2,
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "#1e293b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#10b981",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                        }}
                      />
                      {calcDeposits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDepositRow(dep.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
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
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isCalculating
                  ? "Calculando curva histórica..."
                  : "⚡ Calcular Saldo Actual con Tasas Históricas"}
              </button>

              {/* Calculated Result Box */}
              {calcResult && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Resultado Crecimiento:
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Capital:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f1f5f9" }}
                      >
                        ${calcResult.totalContributedCapital.toLocaleString("en-US")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Intereses:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}
                      >
                        +${calcResult.totalInterestsEarned.toLocaleString("en-US")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Saldo Actual:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.9rem", fontWeight: 800, color: "#38bdf8" }}
                      >
                        ${calcResult.currentAccumulatedBalance.toLocaleString("en-US")}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pinned Footer at Bottom */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                {calcResult && (
                  <button
                    type="button"
                    onClick={handleSaveCalculatedAccount}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      background: "#10b981",
                      border: "none",
                      color: "#000",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    💾 Guardar Cuenta Activa
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: NUEVA ENTIDAD */}
          {activeTab === "entity" && (
            <form
              onSubmit={handleSaveEntity}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              {/* Selector desplegable de Bancos y Plataformas Sugeridas */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#38bdf8",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  💡 Seleccionar Banco o Plataforma (Auto-completar datos):
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const bp = BANK_PRESETS.find((p) => p.id === val);
                      if (bp) {
                        setEntityName(bp.name);
                        setEntityCountry(bp.country);
                        setEntityColor(bp.color);
                        setEntityIcon(bp.icon);
                        setEntityLogoUrl(svgToDataUri(bp.logoSvg));
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(30, 41, 59, 0.9)",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="" disabled>
                      Selecciona una entidad para auto-llenar campos...
                    </option>
                    {BANK_PRESETS.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.icon} {bp.name} ({bp.country}) • Ref: {bp.defaultRateEA}% E.A.
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Nombre del Banco / Entidad
                </label>
                <input
                  type="text"
                  placeholder="ej. Nu Colombia, Banco Finandina, Lulo Bank, Pibank"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    País
                  </label>
                  <select
                    value={entityCountry}
                    onChange={(e) => setEntityCountry(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="🇨🇴">🇨🇴 Colombia</option>
                    <option value="🇺🇸">🇺🇸 USA</option>
                    <option value="🇪🇺">🇪🇺 Europa</option>
                    <option value="🌎">🌎 Internacional</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Icono Emoji
                  </label>
                  <input
                    type="text"
                    value={entityIcon}
                    onChange={(e) => setEntityIcon(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Color Distintivo
                  </label>
                  <input
                    type="color"
                    value={entityColor}
                    onChange={(e) => setEntityColor(e.target.value)}
                    style={{
                      width: "100%",
                      height: 38,
                      padding: 2,
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#00e5ff",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Crear Entidad"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: MOVIMIENTO / TRANSACCIÓN MANUAL */}
          {activeTab === "transaction" && (
            <form
              onSubmit={handleSaveTransaction}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Cajita o Cuenta Destino
                </label>
                <select
                  value={txAccountId}
                  onChange={(e) => setTxAccountId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                  required
                >
                  {accounts.map((acc) => {
                    const ent = entities.find((e) => e.id === acc.entityId);
                    return (
                      <option key={acc.id} value={acc.id}>
                        {ent?.name || "Banco"} — {acc.name} (${acc.balance.toLocaleString("en-US")} {acc.currency})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Tipo: Depósito o Retiro */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 6,
                  }}
                >
                  Tipo de Movimiento
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTxType("credit")}
                    style={{
                      padding: "10px",
                      borderRadius: 8,
                      border: `1px solid ${txType === "credit" ? "#10b981" : "rgba(255,255,255,0.1)"}`,
                      background: txType === "credit" ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.03)",
                      color: txType === "credit" ? "#10b981" : "#94a3b8",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    + Depósito (Entrada)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("debit")}
                    style={{
                      padding: "10px",
                      borderRadius: 8,
                      border: `1px solid ${txType === "debit" ? "#f43f5e" : "rgba(255,255,255,0.1)"}`,
                      background: txType === "debit" ? "rgba(244, 63, 94, 0.2)" : "rgba(255,255,255,0.03)",
                      color: txType === "debit" ? "#f43f5e" : "#94a3b8",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    - Retiro (Salida)
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Monto ({accounts.find((a) => a.id === txAccountId)?.currency || "COP"})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="ej. 150000"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Fecha del Movimiento
                  </label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}
                >
                  Descripción / Concepto
                </label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  placeholder={txType === "credit" ? "ej. Aporte nómina, Ahorro viaje" : "ej. Pago tiquetes, Retiro personal"}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Checkbox: Actualizar saldo actual de la cuenta */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.8rem",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={txUpdateAccountBalance}
                  onChange={(e) => setTxUpdateAccountBalance(e.target.checked)}
                />
                <span>Actualizar el saldo actual de la cajita automáticamente</span>
              </label>

              {/* Pinned Footer at Bottom */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: txType === "credit" ? "#10b981" : "#f43f5e",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem?.id ? "Guardar Cambios" : "Registrar Movimiento"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
