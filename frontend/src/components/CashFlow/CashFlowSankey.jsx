import React, { useMemo, useState } from "react";
import { formatCashFlowMoneyWithCode } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

/**
 * Native SVG Sankey / Cash Waterfall Flow Chart
 * Distributed connection ports (no overlapping lines), smooth cubic Bézier ribbons,
 * dynamic canvas height, distinct line separation, and interactive node tooltips.
 */
export default function CashFlowSankey({
  inflows = [],
  needs = [],
  wants = [],
  wealth = [],
  currency = "COP",
  fxRate = 4150,
  customRatios = { needs: 50, wants: 30, savings: 20 },
  onEditNode,
}) {
  const formatAmount = (val, cur = currency) => formatCashFlowMoneyWithCode(val, cur, fxRate);
  const [hoveredItem, setHoveredItem] = useState(null);

  // ── 1. Calculate Aggregate Financial Values ──────────
  const totalInflow = useMemo(() => {
    return inflows.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [inflows]);

  const totalNeeds = useMemo(() => {
    return needs.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [needs]);

  const totalWants = useMemo(() => {
    return wants.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [wants]);

  const totalWealth = useMemo(() => {
    return wealth.reduce((acc, curr) => acc + (Number(curr.monthlyContribution) || 0), 0);
  }, [wealth]);

  const totalAllocated = totalNeeds + totalWants + totalWealth;
  const freeCashFlow = Math.max(0, totalInflow - totalAllocated);

  // ── 2. Build SVG Nodes & Layout Coordinates ──────────
  const layout = useMemo(() => {
    const W = 1260;
    const paddingY = 40;
    const nodeWidth = 210;
    const nodeH = 54;
    const nodeGap = 16;

    const colX = [30, 370, 710, 1010]; // 4 Well-distributed columns

    // Column 0: Valid Inflow Sources
    const validInflows = inflows.filter((i) => (Number(i.amount) || 0) > 0);
    const col0Count = Math.max(1, validInflows.length);

    // Column 2: Pillars
    const pillars = [
      {
        id: "pillar_wealth",
        name: "🔵 Ahorro & Inversión",
        amount: totalWealth,
        color: "#38bdf8",
      },
      {
        id: "pillar_needs",
        name: "🔴 Gastos Fijos (Needs)",
        amount: totalNeeds,
        color: "#f43f5e",
      },
      {
        id: "pillar_wants",
        name: "🟣 Estilo de Vida (Wants)",
        amount: totalWants,
        color: "#a855f7",
      },
    ];

    if (freeCashFlow > 0) {
      pillars.push({
        id: "pillar_fcf",
        name: "⚪ Flujo Libre",
        amount: freeCashFlow,
        color: "#10b981",
      });
    }

    const col2Count = pillars.length;

    // Column 3: Specific Subcategory Destinations (Pockets)
    const validDestinations = [
      ...wealth.map((w) => ({
        ...w,
        amount: Number(w.monthlyContribution) || 0,
        pillarId: "pillar_wealth",
        pillarType: "wealth",
        color: "#38bdf8",
      })),
      ...needs.map((n) => ({
        ...n,
        amount: Number(n.amount) || 0,
        pillarId: "pillar_needs",
        pillarType: "needs",
        color: "#f43f5e",
      })),
      ...wants.map((w) => ({
        ...w,
        amount: Number(w.amount) || 0,
        pillarId: "pillar_wants",
        pillarType: "wants",
        color: "#a855f7",
      })),
    ].filter((d) => d.amount > 0);

    const destCount = Math.max(1, validDestinations.length);

    // Compute dynamic Canvas Height H
    const maxRows = Math.max(col0Count, col2Count, destCount, 5);
    const totalContentH = maxRows * nodeH + (maxRows - 1) * nodeGap;
    const H = Math.max(520, totalContentH + paddingY * 2);
    const usableH = H - paddingY * 2;

    // ── Position Column 0 Nodes (Inflows) ──
    const inflowTotalBlockH = col0Count * nodeH + (col0Count - 1) * nodeGap;
    const inflowStartY = paddingY + (usableH - inflowTotalBlockH) / 2;

    const col0Nodes = validInflows.map((item, idx) => {
      const y = inflowStartY + idx * (nodeH + nodeGap);
      const amt = Number(item.amount) || 0;
      const pct = totalInflow > 0 ? ((amt / totalInflow) * 100).toFixed(1) : 0;
      return {
        id: item.id,
        rawItem: item,
        pillarType: "inflow",
        name: item.name,
        icon: item.icon || "💼",
        amount: amt,
        pct,
        col: 0,
        x: colX[0],
        y,
        width: nodeWidth,
        height: nodeH,
        color: item.isPassive ? "#00e5ff" : "#10b981",
      };
    });

    // ── Position Column 1 Node (Central Net Income Hub) ──
    const hubH = Math.max(90, Math.min(140, col0Count * 42));
    const col1Node = {
      id: "net_income_hub",
      name: "Ingreso Neto Total",
      icon: "⚡",
      amount: totalInflow,
      pct: 100,
      col: 1,
      x: colX[1],
      y: paddingY + (usableH - hubH) / 2,
      width: nodeWidth + 15,
      height: hubH,
      color: "#00e5ff",
    };

    // ── Position Column 2 Nodes (Pillars) ──
    const pillarTotalBlockH = col2Count * (nodeH + 6) + (col2Count - 1) * 18;
    const pillarStartY = paddingY + (usableH - pillarTotalBlockH) / 2;

    const col2Nodes = pillars.map((p, idx) => {
      const y = pillarStartY + idx * (nodeH + 6 + 18);
      const pct = totalInflow > 0 ? ((p.amount / totalInflow) * 100).toFixed(1) : 0;
      return {
        ...p,
        pct,
        col: 2,
        x: colX[2],
        y,
        width: nodeWidth + 10,
        height: nodeH + 6,
      };
    });

    // ── Position Column 3 Nodes (Destinations) ──
    const destTotalBlockH = destCount * nodeH + (destCount - 1) * nodeGap;
    const destStartY = paddingY + (usableH - destTotalBlockH) / 2;

    const col3Nodes = validDestinations.map((item, idx) => {
      const y = destStartY + idx * (nodeH + nodeGap);
      const pct = totalInflow > 0 ? ((item.amount / totalInflow) * 100).toFixed(1) : 0;
      return {
        id: item.id,
        rawItem: item,
        pillarType: item.pillarType,
        name: item.name,
        icon: item.icon || "🎯",
        amount: item.amount,
        pct,
        pillarId: item.pillarId,
        col: 3,
        x: colX[3],
        y,
        width: nodeWidth,
        height: nodeH,
        color: item.color,
      };
    });

    // ── 3. Build Flow Links with Distributed Port Anchors ──
    const links = [];

    // Links Col 0 -> Col 1 (Inflow -> Net Hub)
    col0Nodes.forEach((src, idx) => {
      // Guaranteed visible minimum stroke width (min 4px, max 32px)
      const strokeW = totalInflow > 0 ? Math.max(4, (src.amount / totalInflow) * 32) : 4;
      const yTargetPort =
        col0Nodes.length === 1
          ? col1Node.y + col1Node.height / 2
          : col1Node.y + 14 + (idx / (col0Nodes.length - 1)) * (col1Node.height - 28);

      links.push({
        id: `link_${src.id}_to_hub`,
        gradId: `grad_${String(src.id).replace(/[^a-zA-Z0-9]/g, "_")}_hub`,
        sourceId: src.id,
        targetId: col1Node.id,
        source: { x: src.x + src.width, y: src.y + src.height / 2 },
        target: { x: col1Node.x, y: yTargetPort },
        colorStart: src.color,
        colorEnd: col1Node.color,
        amount: src.amount,
        name: `${src.name} ➔ Ingreso Neto`,
        strokeWidth: strokeW,
      });
    });

    // Links Col 1 -> Col 2 (Net Hub -> Pillars)
    col2Nodes.forEach((tgt, idx) => {
      const strokeW = totalInflow > 0 ? Math.max(4, (tgt.amount / totalInflow) * 36) : 4;
      const ySourcePort =
        col2Nodes.length === 1
          ? col1Node.y + col1Node.height / 2
          : col1Node.y + 14 + (idx / (col2Nodes.length - 1)) * (col1Node.height - 28);

      links.push({
        id: `link_hub_to_${tgt.id}`,
        gradId: `grad_hub_${String(tgt.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
        sourceId: col1Node.id,
        targetId: tgt.id,
        source: { x: col1Node.x + col1Node.width, y: ySourcePort },
        target: { x: tgt.x, y: tgt.y + tgt.height / 2 },
        colorStart: col1Node.color,
        colorEnd: tgt.color,
        amount: tgt.amount,
        name: `Ingreso Neto ➔ ${tgt.name}`,
        strokeWidth: strokeW,
      });
    });

    // Links Col 2 -> Col 3 (Pillars -> Pockets)
    col3Nodes.forEach((dest) => {
      const srcPillar = col2Nodes.find((p) => p.id === dest.pillarId);
      if (srcPillar) {
        const strokeW = totalInflow > 0 ? Math.max(3, (dest.amount / totalInflow) * 26) : 3;
        links.push({
          id: `link_${srcPillar.id}_to_${dest.id}`,
          gradId: `grad_${String(srcPillar.id).replace(/[^a-zA-Z0-9]/g, "_")}_${String(dest.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
          sourceId: srcPillar.id,
          targetId: dest.id,
          source: { x: srcPillar.x + srcPillar.width, y: srcPillar.y + srcPillar.height / 2 },
          target: { x: dest.x, y: dest.y + dest.height / 2 },
          colorStart: srcPillar.color,
          colorEnd: dest.color,
          amount: dest.amount,
          name: `${srcPillar.name} ➔ ${dest.name}`,
          strokeWidth: strokeW,
        });
      }
    });

    return {
      nodes: [...col0Nodes, col1Node, ...col2Nodes, ...col3Nodes],
      links,
      W,
      H,
    };
  }, [inflows, needs, wants, wealth, totalInflow, totalNeeds, totalWants, totalWealth, freeCashFlow]);

  return (
    <div className="cashflow-sankey-section">
      {/* Header & Legend */}
      <div className="cashflow-sankey-header">
        <h3 className="cashflow-sankey-title">
          <span>🌊</span> Cascada Dinámica del Flujo de Capital (Sankey Flow)
        </h3>
        <div className="cashflow-sankey-legend">
          <div className="cashflow-legend-item">
            <span className="cashflow-legend-dot" style={{ background: "#10b981" }} />
            <span>Ingresos Activos</span>
          </div>
          <div className="cashflow-legend-item">
            <span className="cashflow-legend-dot" style={{ background: "#00e5ff" }} />
            <span>Rendimientos Pasivos</span>
          </div>
          <div className="cashflow-legend-item">
            <span className="cashflow-legend-dot" style={{ background: "#38bdf8" }} />
            <span>Ahorro & Inversión ({customRatios.savings}%)</span>
          </div>
          <div className="cashflow-legend-item">
            <span className="cashflow-legend-dot" style={{ background: "#f43f5e" }} />
            <span>Gastos Fijos ({customRatios.needs}%)</span>
          </div>
          <div className="cashflow-legend-item">
            <span className="cashflow-legend-dot" style={{ background: "#a855f7" }} />
            <span>Estilo de Vida ({customRatios.wants}%)</span>
          </div>
        </div>
      </div>

      {/* Responsive SVG Canvas */}
      <div className="cashflow-sankey-svg-wrapper">
        <svg
          viewBox={`0 0 ${layout.W} ${layout.H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <defs>
            {/* Dynamic Link Gradients */}
            {layout.links.map((link) => (
              <linearGradient
                key={link.gradId}
                id={link.gradId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={link.colorStart} stopOpacity="0.85" />
                <stop offset="100%" stopColor={link.colorEnd} stopOpacity="0.85" />
              </linearGradient>
            ))}

            {/* Glowing Drop Shadows */}
            <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render Flow Links (Bézier Curves) */}
          <g className="sankey-links-layer">
            {layout.links.map((link) => {
              const dx = (link.target.x - link.source.x) * 0.5;
              const pathD = `M ${link.source.x} ${link.source.y} C ${link.source.x + dx} ${link.source.y}, ${link.target.x - dx} ${link.target.y}, ${link.target.x} ${link.target.y}`;
              const isHovered =
                hoveredItem &&
                (hoveredItem.id === link.id ||
                  hoveredItem.id === link.sourceId ||
                  hoveredItem.id === link.targetId);

              return (
                <g key={link.id}>
                  {/* Glowing halo track */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={link.colorStart}
                    strokeWidth={link.strokeWidth + 4}
                    strokeOpacity={isHovered ? 0.35 : 0.08}
                  />
                  {/* Main Gradient Ribbon */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={`url(#${link.gradId})`}
                    strokeWidth={isHovered ? link.strokeWidth * 1.3 + 2 : link.strokeWidth}
                    strokeOpacity={isHovered ? 1.0 : 0.75}
                    style={{
                      transition: "all 0.25s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() =>
                      setHoveredItem({
                        id: link.id,
                        name: link.name,
                        amount: link.amount,
                        pct: totalInflow > 0 ? ((link.amount / totalInflow) * 100).toFixed(1) : 0,
                      })
                    }
                    onMouseLeave={() => setHoveredItem(null)}
                  />
                </g>
              );
            })}
          </g>

          {/* Render Flow Nodes */}
          <g className="sankey-nodes-layer">
            {layout.nodes.map((node) => {
              const isHovered = hoveredItem && hoveredItem.id === node.id;
              const displayName = node.name.length > 22 ? `${node.name.slice(0, 20)}...` : node.name;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  style={{ cursor: node.rawItem && onEditNode ? "pointer" : "default" }}
                  onClick={() => {
                    if (node.rawItem && onEditNode) {
                      onEditNode(node.rawItem, node.pillarType);
                    }
                  }}
                  onMouseEnter={() => setHoveredItem(node)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {/* Background Glass Card */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={12}
                    ry={12}
                    fill="rgba(17, 24, 41, 0.95)"
                    stroke={node.color}
                    strokeWidth={isHovered ? 2.5 : 1.3}
                    strokeOpacity={isHovered ? 1.0 : 0.8}
                    style={{
                      filter: isHovered ? "drop-shadow(0 0 14px rgba(0, 229, 255, 0.45))" : "none",
                      transition: "all 0.2s ease",
                    }}
                  />

                  {/* Left Color Accent Bar */}
                  <rect
                    x={0}
                    y={0}
                    width={5}
                    height={node.height}
                    rx={2}
                    fill={node.color}
                  />

                  {/* Node Icon & Name */}
                  <text
                    x={14}
                    y={node.height === 54 ? 22 : 30}
                    fill="#f8fafc"
                    fontSize={node.col === 1 ? 14 : 12.5}
                    fontWeight={700}
                    fontFamily="Inter, sans-serif"
                  >
                    {node.icon ? `${node.icon} ` : ""}
                    {displayName}
                  </text>

                  {/* Node Amount & Percentage */}
                  <text
                    x={14}
                    y={node.height === 54 ? 40 : 54}
                    fill={node.color}
                    fontSize={node.col === 1 ? 14 : 12}
                    fontWeight={800}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {formatAmount(node.amount, currency)}
                    {node.pct ? ` (${node.pct}%)` : ""}
                  </text>

                  {/* Node Port Anchor Dots */}
                  {node.col !== 0 && (
                    <circle
                      cx={0}
                      cy={node.height / 2}
                      r={3.5}
                      fill={node.color}
                    />
                  )}
                  {node.col !== 3 && (
                    <circle
                      cx={node.width}
                      cy={node.height / 2}
                      r={3.5}
                      fill={node.color}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Floating Interactive Details Box */}
      {hoveredItem && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "28px",
            background: "rgba(13, 18, 38, 0.95)",
            border: "1px solid rgba(0, 229, 255, 0.4)",
            borderRadius: "12px",
            padding: "10px 16px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 229, 255, 0.2)",
            pointerEvents: "none",
            backdropFilter: "blur(12px)",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Flujo Seleccionado:</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
            {hoveredItem.name}
          </div>
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: "#00e5ff",
              fontFamily: "JetBrains Mono, monospace",
              marginTop: "2px",
            }}
          >
            {formatAmount(hoveredItem.amount, currency)}{" "}
            <span style={{ fontSize: "0.8rem", color: "#38bdf8" }}>
              ({hoveredItem.pct || "0"}% del ingreso)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
