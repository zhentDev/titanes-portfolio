/**
 * API client — wraps fetch calls to the FastAPI backend.
 * Automatically falls back to static pre-calculated JSON data on GitHub Pages or when backend is offline!
 */

const RENDER_BACKEND_BASE = "https://titanes-portfolio-backend.onrender.com/api";
const LOCAL_BACKEND_BASE = "http://127.0.0.1:8000/api";

const IS_LOCAL_HOST =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

// Use local backend when developing on localhost, and Render cloud backend on GitHub Pages/production!
const BASE = IS_LOCAL_HOST ? LOCAL_BACKEND_BASE : RENDER_BACKEND_BASE;
const TIMEOUT_MS = 4000; // 4 seconds timeout for cloud backend before static fallback

// Helper to get relative static data path on GitHub Pages
function getStaticDataPath(file) {
  const base = import.meta.env.BASE_URL || "./";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return `${cleanBase}data/${file}`;
}

// Resilient fetch helper with automatic retry for initial startup / hot-reloads
async function safeFetch(url, options = {}, retries = 1, delayMs = 300) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 500 && i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

async function fetchWithFallback(endpoint, staticFile, options = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await safeFetch(
      `${BASE}${endpoint}`,
      { ...options, signal: controller.signal },
      1,
      300,
    );
    clearTimeout(timer);

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend offline / waking up
  }

  // Seamless static fallback
  if (staticFile) {
    const staticUrl = getStaticDataPath(staticFile);
    const staticRes = await fetch(staticUrl);
    if (staticRes.ok) {
      return await staticRes.json();
    }
  }

  throw new Error(
    `No se pudo cargar datos desde el backend ni desde el archivo estático ${staticFile}`,
  );
}

/** GET /api/nav */
export async function fetchNAV({
  period = "1Y",
  investment = 2000,
  numSlots = 15,
  selectedTickers,
}) {
  const params = new URLSearchParams({
    period,
    investment: String(investment),
    num_slots: String(numSlots),
  });
  if (selectedTickers && selectedTickers.length > 0) {
    params.set("selected_tickers", selectedTickers.join(","));
  }

  const staticFile = `nav_${period}.json`;
  let data = await fetchWithFallback(`/nav?${params}`, staticFile);

  // If running on static data and selectedTickers is provided, do client-side what-if simulation
  if (selectedTickers && data?.holdings) {
    const validTickers = selectedTickers.map((t) => t.toUpperCase());
    const filteredHoldings = data.holdings.map((h) => ({
      ...h,
      selected: validTickers.includes(h.ticker.toUpperCase()),
    }));

    const activeSelected = filteredHoldings.filter((h) => h.selected);
    const activeCount = activeSelected.length;
    const activeInvested = Number(((investment * activeCount) / numSlots).toFixed(2));
    const activeStockValue = activeSelected.reduce((sum, h) => sum + (h.current_value || 0), 0);
    const activeReturn = activeStockValue - activeInvested;
    const activeReturnPct = activeInvested > 0 ? (activeReturn / activeInvested) * 100 : 0;

    data = {
      ...data,
      holdings: filteredHoldings,
      summary: {
        ...data.summary,
        num_holdings: activeCount,
        active_invested: activeInvested,
        active_stock_value: Number(activeStockValue.toFixed(2)),
        active_return: Number(activeReturn.toFixed(2)),
        active_return_pct: Number(activeReturnPct.toFixed(2)),
      },
    };
  }

  return data;
}

/** GET /api/prices/live */
export async function fetchLiveQuotes(tickers) {
  const params = new URLSearchParams({ tickers: tickers.join(",") });
  return fetchWithFallback(`/prices/live?${params}`, "nav_1W.json");
}

/** GET /api/prices/intraday/:ticker */
export async function fetchIntraday(ticker) {
  return fetchWithFallback(`/prices/intraday/${ticker}`, "nav_1W.json");
}

/** GET /api/prices/indices_history?start_date=YYYY-MM-DD */
export async function fetchIndicesHistory(startDate) {
  try {
    const res = await fetch(`${BASE}/prices/indices_history?start_date=${startDate}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return {};
}

/** GET /api/prices/historical/:ticker?date=YYYY-MM-DD */
export async function fetchHistoricalPrice(ticker, date) {
  // Try to fetch from backend. If offline, return a mock object.
  try {
    const res = await fetch(`${BASE}/prices/historical/${encodeURIComponent(ticker)}?date=${date}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // If backend offline, just return a mock response or null so the UI can gracefully fallback
  }
  return { price: null, error: "Backend offline" };
}

/** GET /api/tickers/search?q=... */
export async function searchTicker(q) {
  const res = await fetch(`${BASE}/tickers/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function searchTickersMultiple(q) {
  const res = await fetch(`${BASE}/tickers/search_multiple?q=${encodeURIComponent(q)}`);
  return res.json();
}

/** GET /api/rebalances */
export async function fetchRebalances() {
  return fetchWithFallback("/rebalances", "rebalances.json");
}

/** POST /api/rebalances */
export async function createRebalance({ rebalance_date, cash_added, tickers }) {
  const res = await fetch(`${BASE}/rebalances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rebalance_date, cash_added, tickers }),
  });
  if (!res.ok) throw new Error("Error al registrar rebalanceo");
  return res.json();
}

/** DELETE /api/rebalances/:date */
export async function deleteRebalance(date) {
  const res = await fetch(`${BASE}/rebalances/${date}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar rebalanceo");
  return res.json();
}

/** PURCHASES API */
export async function fetchPurchasesData() {
  const res = await safeFetch(`${BASE}/purchases/portfolios`, {}, 2, 500);
  if (!res.ok) throw new Error("Error fetching purchases data");
  return res.json();
}

export async function createPurchasePortfolio(id, name, isPlan = false) {
  const res = await safeFetch(`${BASE}/purchases/portfolios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, isPlan }),
  });
  return res.json();
}

export async function deletePurchasePortfolioApi(id) {
  const res = await safeFetch(`${BASE}/purchases/portfolios/${id}`, { method: "DELETE" });
  return res.json();
}

export async function togglePortfolioPlanApi(id, isPlan, planConfig = null) {
  const res = await safeFetch(`${BASE}/purchases/portfolios/${id}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPlan, planConfig }),
  });
  return res.json();
}

export async function updatePortfolioSettingsApi(
  id,
  assetCurrency,
  localCurrency,
  inflationRate,
  useAutoColInflation,
) {
  const res = await safeFetch(`${BASE}/purchases/portfolios/${id}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetCurrency, localCurrency, inflationRate, useAutoColInflation }),
  });
  return res.json();
}

export async function fetchFxHistory(assetCurrency, localCurrency) {
  if (assetCurrency === localCurrency) return { current: 1.0, history: {} };
  const res = await safeFetch(
    `${BASE}/purchases/fx?currency=${assetCurrency}-${localCurrency}`,
    {},
    2,
    500,
  );
  if (!res.ok) throw new Error("Error fetching FX data");
  return res.json();
}

export async function fetchColInflationHistory() {
  const res = await safeFetch(`${BASE}/purchases/inflation/colombia`, {}, 2, 500);
  if (!res.ok) throw new Error("Error fetching inflation data");
  return res.json();
}

export async function createPurchaseLot(lot) {
  const res = await fetch(`${BASE}/purchases/lots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lot),
  });
  return res.json();
}

export async function updatePurchaseLots(lots) {
  const res = await fetch(`${BASE}/purchases/lots`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lots),
  });
  if (!res.ok) throw new Error("Failed to update purchase lots");
  return res.json();
}

export async function deletePurchaseLot(id) {
  const res = await fetch(`${BASE}/purchases/lots/${id}`, { method: "DELETE" });
  return res.json();
}

export async function syncPurchasesMigration(purchasePortfolios, individualPurchases) {
  const res = await safeFetch(`${BASE}/purchases/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchasePortfolios, individualPurchases }),
  });
  return res.json();
}

/** ── FIXED INCOME & SAVINGS ACCOUNTS API ── */

export async function fetchFixedIncomeData() {
  const res = await safeFetch(`${BASE}/fixed-income/data`, {}, 2, 500);
  if (!res.ok) throw new Error("Error fetching fixed income data");
  return res.json();
}

export async function createFixedIncomeEntity(entity) {
  const res = await safeFetch(`${BASE}/fixed-income/entities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entity),
  });
  return res.json();
}

export async function updateFixedIncomeEntityApi(id, entity) {
  const res = await safeFetch(`${BASE}/fixed-income/entities/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entity),
  });
  return res.json();
}

export async function deleteFixedIncomeEntityApi(id) {
  const res = await safeFetch(`${BASE}/fixed-income/entities/${id}`, { method: "DELETE" });
  return res.json();
}

export async function createFixedIncomeAccount(account) {
  const res = await safeFetch(`${BASE}/fixed-income/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  return res.json();
}

export async function updateFixedIncomeAccountApi(id, account) {
  const res = await safeFetch(`${BASE}/fixed-income/accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  return res.json();
}

export async function deleteFixedIncomeAccountApi(id) {
  const res = await safeFetch(`${BASE}/fixed-income/accounts/${id}`, { method: "DELETE" });
  return res.json();
}

export async function createFixedIncomeCDT(cdt) {
  const res = await safeFetch(`${BASE}/fixed-income/cdts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cdt),
  });
  return res.json();
}

export async function updateFixedIncomeCDTApi(id, cdt) {
  const res = await safeFetch(`${BASE}/fixed-income/cdts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cdt),
  });
  return res.json();
}

export async function deleteFixedIncomeCDTApi(id) {
  const res = await safeFetch(`${BASE}/fixed-income/cdts/${id}`, { method: "DELETE" });
  return res.json();
}

export async function syncFixedIncomeStateApi(state) {
  const res = await safeFetch(`${BASE}/fixed-income/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  return res.json();
}

export async function suggestFixedIncomeRate(
  entityId,
  productType = "savings",
  termDays = null,
  date = null,
) {
  const params = new URLSearchParams({
    entity_id: entityId,
    product_type: productType,
  });
  if (termDays) params.set("term_days", String(termDays));
  if (date) params.set("date", date);

  try {
    const res = await safeFetch(`${BASE}/fixed-income/rates/suggest?${params}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback defaults
  }
  return { rateEA: 12.0, label: "Tasa Estándar", tiers: [] };
}

export async function fetchHistoricalRates() {
  try {
    const res = await safeFetch(`${BASE}/fixed-income/rates`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Error fetching historical rates database:", e);
  }
  return { entities: {} };
}

export async function calculateCompoundHistory(entityId, deposits, currentDate = null) {
  const res = await safeFetch(`${BASE}/fixed-income/calculate-compound-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityId, deposits, currentDate }),
  });
  if (!res.ok) throw new Error("Error calculating compound history");
  return res.json();
}

export async function uploadStatementApi(filesInput, password = "", startYear = 2024) {
  const formData = new FormData();
  const fileArray = Array.isArray(filesInput) ? filesInput : [filesInput];

  fileArray.forEach((f) => {
    formData.append("files", f);
  });

  if (password) formData.append("password", password);
  if (startYear) formData.append("start_year", String(startYear));

  const res = await safeFetch(`${BASE}/fixed-income/upload-statement`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Error al procesar el lote de extractos PDF o imágenes");
  return res.json();
}

export async function confirmStatementImportApi(
  entityId,
  accounts = [],
  cdts = [],
  transactions = [],
) {
  const res = await safeFetch(`${BASE}/fixed-income/confirm-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityId, accounts, cdts, transactions }),
  });
  if (!res.ok) throw new Error("Error al importar la información del extracto");
  return res.json();
}
