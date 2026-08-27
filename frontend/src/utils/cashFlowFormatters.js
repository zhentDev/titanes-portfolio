/**
 * Unified Cash Flow Currency Formatter with Live TRM Exchange Rate Support.
 * Converts base COP financial amounts to USD when USD currency is active.
 */

export function formatCashFlowMoney(val, currency = "COP", fxRate = 4150, options = {}) {
  const num = Number(val) || 0;
  const rate = Number(fxRate) > 0 ? Number(fxRate) : 4150;
  const showSuffix = options.showSuffix !== undefined ? options.showSuffix : false;

  if (currency === "USD") {
    const usdVal = num / rate;
    const fractionDigits = options.fractionDigits !== undefined ? options.fractionDigits : 2;
    const formatted = usdVal.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return `$${formatted}${showSuffix ? " USD" : ""}`;
  }

  const formatted = Math.round(num).toLocaleString("es-CO");
  return `$${formatted}${showSuffix ? " COP" : ""}`;
}

export function formatCashFlowMoneyWithCode(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: true });
}

export function formatCashFlowMoneyShort(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: false, fractionDigits: currency === "USD" ? 2 : 0 });
}
