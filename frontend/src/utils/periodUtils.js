/**
 * Period and Multi-Month Utility Functions
 * Dynamic rolling period generation for present and any future year.
 */

export const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Returns current real-time period in "YYYY-MM" format (e.g. "2026-08")
 */
export function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Formats "YYYY-MM" to readable Spanish name (e.g. "Agosto 2026")
 */
export function formatPeriodName(periodStr) {
  if (!periodStr || typeof periodStr !== "string" || !periodStr.includes("-")) {
    return periodStr || "";
  }
  const [y, m] = periodStr.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodStr;
  const monthName = MONTH_NAMES_ES[m - 1] || "";
  return `${monthName} ${y}`;
}

/**
 * Calculate previous month in "YYYY-MM" format
 */
export function getPrevPeriod(periodStr) {
  const current = periodStr || getCurrentPeriod();
  const [y, m] = current.split("-").map(Number);
  const prevDate = new Date(y, m - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calculate next month in "YYYY-MM" format
 */
export function getNextPeriod(periodStr) {
  const current = periodStr || getCurrentPeriod();
  const [y, m] = current.split("-").map(Number);
  const nextDate = new Date(y, m, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generates rolling list of monthly periods dynamically starting from base period forward.
 */
export function generateRollingMonthOptions(basePeriodStr, pastMonths = 0, futureMonths = 36) {
  const base = basePeriodStr && basePeriodStr.includes("-") ? basePeriodStr : getCurrentPeriod();
  const [baseY, baseM] = base.split("-").map(Number);
  const baseDate = new Date(baseY, baseM - 1, 1);

  const options = [];

  for (let i = -pastMonths; i <= futureMonths; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const val = `${y}-${String(m).padStart(2, "0")}`;
    const monthName = MONTH_NAMES_ES[m - 1] || "";
    options.push({
      value: val,
      label: `📅 ${monthName} ${y}`,
    });
  }

  return options;
}
