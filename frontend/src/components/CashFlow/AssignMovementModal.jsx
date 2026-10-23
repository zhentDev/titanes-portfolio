import React, { useState, useMemo } from "react";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { useTheme } from "../../context/ThemeContext";

export default function AssignMovementModal({
  isOpen,
  onClose,
  movement,
  currency = "COP",
  formatMoney = (val) => `$${Number(val || 0).toLocaleString("es-CO")}`,
  creditCards = [],
  debts = [],
  budgetItems = [],
  expensesLog = [],
  activePeriod,
  onSaveTransaction,
  onDeleteTransaction,
  onReclassify,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [activeTab, setActiveTab] = useState("budget_envelope"); // "budget_envelope" | "debt" | "credit_card"
  const [selectedPillarFilter, setSelectedPillarFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState(movement?.budgetItemId || "");
  const [selectedSubItem, setSelectedSubItem] = useState(() => {
    if (!movement?.budgetItemId) return null;
    const env = (budgetItems || []).find((b) => b.id === movement.budgetItemId);
    if (!env || !Array.isArray(env.subItems)) return null;
    const found = env.subItems.find(
      (s, i) =>
        (s.id && movement.subItemId === s.id) ||
        movement.subItemId === (s.id || `${env.id}_sub_${i}`) ||
        (s.name && movement.subItemName?.toLowerCase() === s.name.toLowerCase()) ||
        (s.name && movement.description?.toLowerCase().includes(s.name.toLowerCase()))
    );
    return found || null;
  });
  const [selectedDebtId, setSelectedDebtId] = useState(debts[0]?.id || "");
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");

  const movementAmount = Number(movement?.amount) || 0;

  const handleToggleSubItemCheck = (e, item, sub, subKey, matchedTx) => {
    e.stopPropagation();
    if (matchedTx && onDeleteTransaction) {
      onDeleteTransaction(matchedTx.id);
    } else if (onSaveTransaction) {
      onSaveTransaction({
        id: `tx_sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        period: activePeriod || movement?.period,
        budgetItemId: item.id,
        budgetItemName: item.name,
        budgetItemType: item.pillarType || "needs",
        subItemId: subKey,
        subItemName: sub.name,
        isAutoSubItemCheck: true,
        description: `${item.name}: ${sub.name}`,
        amount: Number(sub.amount) || 0,
        currency,
        date: new Date().toISOString().split("T")[0],
        paymentSource: item.paymentSource || {
          type: "payroll",
          targetName: "Cuenta Nu Débito",
        },
        createdAt: new Date().toISOString(),
      });
    }
  };

  // Filtered budget items
  const filteredBudgetItems = useMemo(() => {
    return (budgetItems || []).filter((item) => {
      const matchesPillar =
        selectedPillarFilter === "all" ||
        item.pillarType === selectedPillarFilter;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.typeLabel?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPillar && matchesSearch;
    });
  }, [budgetItems, selectedPillarFilter, searchQuery]);

  // Active debts only
  const activeDebts = useMemo(() => {
    return (debts || []).filter(
      (d) => d.status !== "paid" || Number(d.remainingAmount) > 0
    );
  }, [debts]);

  if (!movement) return null;

  const handleConfirm = () => {
    if (!onReclassify) return;

    if (activeTab === "budget_envelope") {
      const envelope = budgetItems.find((b) => b.id === selectedEnvelopeId);
      if (!envelope) return;
      onReclassify({
        movementId: movement.id,
        destinationType: "budget_envelope",
        targetId: envelope.id,
        targetItem: envelope,
        subItem: selectedSubItem,
      });
    } else if (activeTab === "debt") {
      const debt = debts.find((d) => d.id === selectedDebtId);
      if (!debt) return;
      onReclassify({
        movementId: movement.id,
        destinationType: "debt",
        targetId: debt.id,
        targetItem: debt,
      });
    } else if (activeTab === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId);
      if (!card) return;
      onReclassify({
        movementId: movement.id,
        destinationType: "credit_card",
        targetId: card.id,
        targetItem: card,
      });
    }
    onClose();
  };

  const isConfirmDisabled =
    (activeTab === "budget_envelope" && !selectedEnvelopeId) ||
    (activeTab === "debt" && !selectedDebtId) ||
    (activeTab === "credit_card" && !selectedCardId);

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={560}>
      <div style={{ padding: "24px 26px" }}>
        {/* Modal Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 14 }}>
          <h3 className="cashflow-modal-title">
            <span>🏷️</span> Asignar o Imputar Movimiento
          </h3>
          <button
            type="button"
            className="cashflow-modal-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Movement Summary Card */}
        <div
          style={{
            background: isLight ? "#f8fafc" : "var(--bg-surface)",
            border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "14px 18px",
            marginBottom: 18,
            boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.03)" : "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {movement.description || movement.budgetItemName || "Movimiento sin concepto"}
            </span>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#10b981",
              }}
            >
              {formatMoney(movementAmount, currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: "0.76rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span>📅 Fecha: {movement.date}</span>
            <span>•</span>
            <span>🏦 Origen: {movement.paymentSource?.targetName || movement.sourceAccount || "Nómina"}</span>
            {movement.budgetItemName && (
              <>
                <span>•</span>
                <span>Rubro actual: <strong>{movement.budgetItemName}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Tab Navigation Segmented Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 6,
            background: isLight ? "#f1f5f9" : "rgba(15, 23, 42, 0.6)",
            padding: "4px",
            borderRadius: "12px",
            marginBottom: 18,
            border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("budget_envelope")}
            style={{
              padding: "8px 10px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "budget_envelope" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "budget_envelope" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "budget_envelope" ? 700 : 500,
              fontSize: "0.78rem",
              cursor: "pointer",
              boxShadow: activeTab === "budget_envelope" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              transition: "all 0.15s ease",
            }}
          >
            <span>📁</span> Presupuesto
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("debt")}
            style={{
              padding: "8px 10px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "debt" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "debt" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "debt" ? 700 : 500,
              fontSize: "0.78rem",
              cursor: "pointer",
              boxShadow: activeTab === "debt" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              transition: "all 0.15s ease",
            }}
          >
            <span>🤝</span> Deuda Personal
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("credit_card")}
            style={{
              padding: "8px 10px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "credit_card" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "credit_card" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "credit_card" ? 700 : 500,
              fontSize: "0.78rem",
              cursor: "pointer",
              boxShadow: activeTab === "credit_card" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              transition: "all 0.15s ease",
            }}
          >
            <span>💳</span> Tarjeta Crédito
          </button>
        </div>

        {/* Tab 1: Budget Envelope Selection */}
        {activeTab === "budget_envelope" && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              Asigna este movimiento a un rubro del presupuesto. El valor consumirá el cupo disponible del rubro correspondiente en este mes.
            </p>

            {/* Filter pills & search */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="🔍 Buscar rubro (ej. Salidas, Arriendo)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "7px 12px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  border: isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)",
                  background: isLight ? "#ffffff" : "var(--bg-surface)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "all", label: "Todos" },
                  { id: "needs", label: "Fijos (50%)" },
                  { id: "wants", label: "Estilo (30%)" },
                  { id: "wealth", label: "Ahorro (20%)" },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSelectedPillarFilter(pill.id)}
                    style={{
                      padding: "5px 9px",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      fontWeight: selectedPillarFilter === pill.id ? 700 : 500,
                      border: "none",
                      background: selectedPillarFilter === pill.id ? "#38bdf8" : (isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"),
                      color: selectedPillarFilter === pill.id ? "#0f172a" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Envelopes */}
            <div
              style={{
                maxHeight: 330,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 20,
                paddingRight: 4,
              }}
            >
              {filteredBudgetItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  No se encontraron rubros con ese filtro.
                </div>
              ) : (
                filteredBudgetItems.map((item) => {
                  const isSelected = selectedEnvelopeId === item.id;
                  const pillarColor =
                    item.pillarType === "needs" ? "#38bdf8" : item.pillarType === "wants" ? "#ec4899" : "#10b981";
                  const budgetedAmt = Number(item.amount || item.monthlyContribution) || 0;

                  // Real expenses logged for this envelope in current period
                  const itemExpenses = (expensesLog || []).filter((tx) => {
                    if (tx.type === "credit" || tx.budgetItemType === "income") return false;
                    if (tx.budgetItemId && tx.budgetItemId === item.id) return true;
                    const bName = (tx.budgetItemName || "").toLowerCase();
                    return bName && bName === item.name.toLowerCase();
                  });

                  const spentAmt = itemExpenses.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
                  const subItemsList = Array.isArray(item.subItems) ? item.subItems : [];

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedEnvelopeId(item.id);
                        if (selectedEnvelopeId !== item.id) {
                          // Auto-select subItem if amount matches one subItem
                          const matchingSub = subItemsList.find((s) => Number(s.amount) === movementAmount);
                          setSelectedSubItem(matchingSub || null);
                        }
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "10px 14px",
                        borderRadius: "12px",
                        border: isSelected ? `2px solid ${pillarColor}` : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                        background: isSelected
                          ? (isLight ? "rgba(56, 189, 248, 0.08)" : "rgba(56, 189, 248, 0.12)")
                          : (isLight ? "#ffffff" : "var(--bg-surface)"),
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: "1.1rem" }}>{item.icon || "📁"}</span>
                          <div>
                            <strong style={{ fontSize: "0.84rem", color: "var(--text-primary)", display: "block" }}>
                              {item.name}
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: pillarColor, fontWeight: 600 }}>
                              {item.typeLabel || item.pillarType}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem", fontWeight: 700, color: spentAmt >= budgetedAmt && budgetedAmt > 0 ? "#10b981" : "var(--text-primary)" }}>
                            {formatMoney(spentAmt, currency)} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>/ {formatMoney(budgetedAmt, currency)}</span>
                          </div>
                          <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                            {itemExpenses.length > 0 ? `${itemExpenses.length} gasto(s) registrado(s)` : "Sin gastos este ciclo"}
                          </span>
                        </div>
                      </div>

                      {/* Sub-Items (Desglose de conceptos como Plan movil, GYM, etc.) */}
                      {subItemsList.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 5,
                            paddingTop: 6,
                            borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)",
                          }}
                        >
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                            📌 Conceptos del rubro (Tachar o imputar movimiento aquí):
                          </div>
                          {subItemsList.map((sub, idx) => {
                            const subKey = sub.id || `${item.id}_sub_${idx}`;
                            const matchedSubTx = itemExpenses.find(
                              (tx) =>
                                (sub.id && tx.subItemId === sub.id) ||
                                tx.subItemId === subKey ||
                                (sub.name && tx.subItemName?.toLowerCase() === sub.name.toLowerCase()) ||
                                (sub.name && tx.description?.toLowerCase().includes(sub.name.toLowerCase()))
                            );
                            const isSubChecked = Boolean(matchedSubTx);
                            const isSubSelectedForAssign =
                              isSelected &&
                              selectedSubItem &&
                              ((selectedSubItem.id && selectedSubItem.id === sub.id) ||
                                selectedSubItem.name === sub.name);
                            const matchesAmount = Number(sub.amount) === movementAmount;

                            return (
                              <div
                                key={subKey}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEnvelopeId(item.id);
                                  setSelectedSubItem(isSubSelectedForAssign ? null : { ...sub, subKey });
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  padding: "6px 10px",
                                  borderRadius: "8px",
                                  background: isSubSelectedForAssign
                                    ? (isLight ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.2)")
                                    : isSubChecked
                                    ? (isLight ? "rgba(16, 185, 129, 0.06)" : "rgba(16, 185, 129, 0.08)")
                                    : (isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.55)"),
                                  border: isSubSelectedForAssign
                                    ? "1.5px solid #10b981"
                                    : matchesAmount
                                    ? "1px dashed #38bdf8"
                                    : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)"),
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {/* Direct Checkbox to Tachar / Desmarcar from here */}
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleSubItemCheck(e, item, sub, subKey, matchedSubTx)}
                                    title={isSubChecked ? "Desmarcar este concepto" : "Tachar / Marcar como pagado manualmente"}
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 5,
                                      border: isSubChecked ? "1.5px solid #10b981" : "1.5px solid #64748b",
                                      background: isSubChecked ? "#10b981" : "transparent",
                                      color: isSubChecked ? "#04101e" : "transparent",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "0.72rem",
                                      fontWeight: 900,
                                      cursor: "pointer",
                                      padding: 0,
                                      flexShrink: 0,
                                    }}
                                  >
                                    ✓
                                  </button>
                                  <div>
                                    <span
                                      style={{
                                        fontSize: "0.78rem",
                                        fontWeight: 600,
                                        color: isSubChecked ? "#10b981" : "var(--text-primary)",
                                        textDecoration: isSubChecked ? "line-through" : "none",
                                      }}
                                    >
                                      {sub.name}
                                    </span>
                                    {matchesAmount && (
                                      <span
                                        style={{
                                          marginLeft: 6,
                                          fontSize: "0.64rem",
                                          padding: "1px 5px",
                                          borderRadius: 4,
                                          background: "rgba(56, 189, 248, 0.16)",
                                          color: "#38bdf8",
                                          fontWeight: 700,
                                        }}
                                      >
                                        🎯 Mismo valor
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.76rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                    {formatMoney(sub.amount, currency)}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "0.66rem",
                                      fontWeight: 700,
                                      padding: "2px 6px",
                                      borderRadius: 5,
                                      background: isSubSelectedForAssign
                                        ? "#10b981"
                                        : (isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"),
                                      color: isSubSelectedForAssign ? "#04101e" : "var(--text-muted)",
                                    }}
                                  >
                                    {isSubSelectedForAssign ? "✓ Imputar aquí" : "Elegir"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Registered Expenses in this Envelope (shown when selected or when item has expenses) */}
                      {isSelected && itemExpenses.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            paddingTop: 6,
                            borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)",
                          }}
                        >
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)" }}>
                            🧾 Movimientos ya imputados en {item.name}:
                          </div>
                          {itemExpenses.map((tx) => (
                            <div
                              key={tx.id}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: "0.73rem",
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#10b981" }}>✓</span>
                                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                  {tx.description || tx.subItemName || item.name}
                                </span>
                                {tx.isAutoSubItemCheck && (
                                  <span style={{ fontSize: "0.62rem", color: "#f59e0b", background: "rgba(245, 158, 11, 0.14)", padding: "1px 5px", borderRadius: 4 }}>
                                    Check manual
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                                  {formatMoney(tx.amount, currency)}
                                </span>
                                {onDeleteTransaction && tx.id !== movement.id && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteTransaction(tx.id);
                                    }}
                                    title="Quitar / destachar este gasto"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "#f43f5e",
                                      cursor: "pointer",
                                      fontSize: "0.75rem",
                                      padding: "0 2px",
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Personal Debt Payment Selection */}
        {activeTab === "debt" && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              Asigna este movimiento como un <strong>abono a una deuda personal</strong> (ej. préstamo o compromiso con un familiar o tercero). El saldo restante se reducirá automáticamente y si llega a \$0 quedará saldada.
            </p>

            {activeDebts.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "26px 16px",
                  borderRadius: "12px",
                  background: isLight ? "#f8fafc" : "var(--bg-surface)",
                  color: "var(--text-muted)",
                  fontSize: "0.84rem",
                  marginBottom: 20,
                  border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)",
                }}
              >
                <span>🎉</span> No tienes deudas personales activas pendientes de pago.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {activeDebts.map((debt) => {
                  const isSelected = selectedDebtId === debt.id;
                  const currentRemaining = Number(
                    debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0
                  );
                  const newRemaining = Math.max(0, currentRemaining - movementAmount);
                  const willSettle = newRemaining <= 0;

                  return (
                    <div
                      key={debt.id}
                      onClick={() => setSelectedDebtId(debt.id)}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "12px",
                        border: isSelected ? "2px solid #38bdf8" : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                        background: isSelected
                          ? (isLight ? "rgba(56, 189, 248, 0.08)" : "rgba(56, 189, 248, 0.12)")
                          : (isLight ? "#ffffff" : "var(--bg-surface)"),
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "block" }}>
                            {debt.concept}
                          </strong>
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                            Acreedor: <strong style={{ color: "var(--text-primary)" }}>{debt.creditor || "Particular"}</strong>
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                            Saldo actual
                          </span>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.92rem", fontWeight: 700, color: "#f43f5e" }}>
                            {formatMoney(currentRemaining, currency)}
                          </span>
                        </div>
                      </div>

                      {/* Simulation of payment impact */}
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.76rem",
                        }}
                      >
                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                          Abono a aplicar: -{formatMoney(movementAmount, currency)}
                        </span>
                        <span style={{ color: willSettle ? "#10b981" : "var(--text-primary)", fontWeight: 700 }}>
                          {willSettle ? "¡Quedará 100% saldada! 🎊" : `Nuevo saldo: ${formatMoney(newRemaining, currency)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Credit Card Payment Selection */}
        {activeTab === "credit_card" && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              Convierte este movimiento en un <strong>Abono a Tarjeta de Crédito</strong>. El valor se restará de la deuda actual liberando cupo inmediatamente.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {creditCards.map((card) => {
                const isSelected = selectedCardId === card.id;
                const currentUsed = Number(card.usedLimit) || 0;
                const newUsed = Math.max(0, currentUsed - movementAmount);
                const totalLimit = Number(card.totalLimit) || 0;

                return (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: isSelected ? "2px solid #10b981" : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                      background: isSelected
                        ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)")
                        : (isLight ? "#ffffff" : "var(--bg-surface)"),
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1.3rem" }}>{card.icon || "💳"}</span>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "block" }}>
                          {card.name}
                        </strong>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          Deuda actual: <span style={{ color: "#f43f5e", fontWeight: 600 }}>{formatMoney(currentUsed, currency)}</span> / {formatMoney(totalLimit, currency)}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.7rem", color: "#10b981", display: "block", fontWeight: 600 }}>
                        Liberará cupo (+{formatMoney(Math.min(currentUsed, movementAmount), currency)})
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 700 }}>
                        Nueva deuda: {formatMoney(newUsed, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            className="cashflow-btn secondary"
            onClick={onClose}
            style={{ padding: "9px 18px", fontSize: "0.84rem" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="cashflow-btn primary"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
            style={{
              padding: "9px 20px",
              fontSize: "0.84rem",
              background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
              borderColor: "#0284c7",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: isConfirmDisabled ? 0.5 : 1,
              cursor: isConfirmDisabled ? "not-allowed" : "pointer",
            }}
          >
            <span>⚡</span> Confirmar Asignación
          </button>
        </div>
      </div>
    </GlassModalWrapper>
  );
}
