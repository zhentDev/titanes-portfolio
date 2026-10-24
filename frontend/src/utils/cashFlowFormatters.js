/**
 * Unified Cash Flow Currency Formatter with Live TRM Exchange Rate Support.
 * Converts base COP financial amounts to USD when USD currency is active.
 * Standardized across project for European/Latin American style:
 * - Thousands separator: '.' (dot)
 * - Decimal separator: ',' (comma)
 * e.g., $13.010,48 COP
 */

/**
 * Universal number parser supporting comma decimals and dot thousands.
 * e.g.:
 * "13010,48" -> 13010.48
 * "13.010,48" -> 13010.48
 * "592.550" -> 592550
 * "13010.48" -> 13010.48
 */
export function parseLocalNumber(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!str) return 0;

  // Case 1: Both . and , are present (e.g., "13.010,48" or "13,010.48")
  if (str.includes(".") && str.includes(",")) {
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");
    if (lastComma > lastDot) {
      // 13.010,48 -> dot is thousand, comma is decimal
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // 13,010.48 -> comma is thousand, dot is decimal
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Only comma present: in Colombia/user preference, comma is decimal separator (e.g. "13010,48")
    str = str.replace(",", ".");
  } else if (str.includes(".")) {
    // Only dot present:
    // If it has a dot followed by exactly 3 digits and no other dot (e.g. "592.550"), it's thousands separator
    const parts = str.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      str = parts.join("");
    } else if (parts.length > 2) {
      str = parts.join("");
    }
    // Otherwise "13010.48" remains "13010.48"
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatCashFlowMoney(val, currency = "COP", fxRate = 4150, options = {}) {
  const num = Number(val);
  const safeNum = isNaN(num) ? 0 : num;
  const rate = Number(fxRate) > 0 ? Number(fxRate) : 4150;
  const showSuffix = options.showSuffix !== undefined ? options.showSuffix : false;

  if (currency === "USD") {
    const usdVal = safeNum / rate;
    const fractionDigits = options.fractionDigits !== undefined ? options.fractionDigits : 2;
    const formatted = usdVal.toLocaleString("es-CO", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return `$${formatted}${showSuffix ? " USD" : ""}`;
  }

  // COP: detect if there are cents/decimals
  const hasDecimals = options.fractionDigits !== undefined
    ? options.fractionDigits > 0
    : Math.abs(safeNum % 1) > 0.0001;

  const fractionDigits = options.fractionDigits !== undefined
    ? options.fractionDigits
    : (hasDecimals ? 2 : 0);

  const formatted = safeNum.toLocaleString("es-CO", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return `$${formatted}${showSuffix ? " COP" : ""}`;
}

export function formatCashFlowMoneyWithCode(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: true });
}

export function formatCashFlowMoneyShort(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: false, fractionDigits: currency === "USD" ? 2 : 0 });
}

export function formatCurrencyLocal(val, currency = "COP", options = {}) {
  return formatCashFlowMoney(val, currency, 4150, options);
}
