/**
 * Exports complete portfolio analytics to a clean CSV file
 */
export function exportPortfolioCSV(navData, investment) {
  if (!navData) return;

  const summary = navData.summary || {};
  const holdings = navData.holdings || [];
  const nowStr = new Date().toISOString().slice(0, 10);

  let csv = `REPORTE EJECUTIVO - TITANES TECH PORTFOLIO (${nowStr})\n`;
  csv += `Generado por ProPicks AI Tracker\n\n`;

  // Summary section
  csv += `=== RESUMEN CUANTITATIVO Y RENDIMIENTO ===\n`;
  csv += `Metrica,Valor\n`;
  csv += `Capital Inicial Total,$${summary.start_value || investment}\n`;
  csv += `Capital Activo en Acciones,$${summary.active_invested || ""}\n`;
  csv += `Valor Actual Cartera,$${summary.end_value || ""}\n`;
  csv += `Rendimiento Titanes (%),${summary.active_return_pct || 0}%\n`;
  csv += `Rendimiento Titanes ($),+$${summary.active_return || 0}\n`;
  csv += `Alfa vs S&P 500 (%),${summary.alpha_sp500 >= 0 ? "+" : ""}${summary.alpha_sp500 || 0}%\n`;
  csv += `Alfa vs NASDAQ (%),${summary.alpha_nasdaq >= 0 ? "+" : ""}${summary.alpha_nasdaq || 0}%\n`;
  csv += `Sharpe Ratio,${summary.sharpe_ratio || "N/A"}\n`;
  csv += `Sortino Ratio,${summary.sortino_ratio || "N/A"}\n`;
  csv += `Beta vs S&P 500,${summary.beta_sp500 || "N/A"}\n`;
  csv += `Beta vs NASDAQ,${summary.beta_nasdaq || "N/A"}\n`;
  csv += `Volatilidad Anualizada (Sigma),${summary.annualized_vol_pct || 0}%\n`;
  csv += `Tasa de Acierto (Win Rate),${summary.win_rate_pct || 0}%\n`;
  csv += `Max Drawdown,${summary.max_drawdown_pct || 0}%\n`;
  csv += `Cash Reservado (Q),$${summary.cash_reserved || 0}\n\n`;

  // Holdings section
  csv += `=== POSICIONES ACTIVAS ===\n`;
  csv += `Ticker,Empresa,Sector,Mercado,Peso (%),Acciones,Precio Inicio,Precio Actual,Valor Actual ($),Retorno (%),Retorno ($),Estado\n`;
  holdings.forEach((h) => {
    csv += `"${h.ticker}","${h.name || h.ticker}","${h.sector || "Tecnología"}","${h.exchange || "US"}",${h.weight || 0}%,${h.shares || 0},$${h.start_price || 0},$${h.current_price || 0},$${h.current_value || 0},${h.return_pct || 0}%,$${h.return_usd || 0},"${h.selected !== false ? "Activa" : "Excluida"}"\n`;
  });

  // Create downloadable blob
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Titanes_Tech_Reporte_${nowStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
