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
// Try local backend first when on localhost, but seamlessly fallback to Render cloud backend if local is not running
let ACTIVE_BASE = IS_LOCAL_HOST ? LOCAL_BACKEND_BASE : RENDER_BACKEND_BASE;
export const getBase = () => ACTIVE_BASE;
const BASE = ACTIVE_BASE;
const TIMEOUT_MS = 4000; // 4 seconds timeout before fallback

// Helper to get relative static data path on GitHub Pages
function getStaticDataPath(file) {
  const base = import.meta.env.BASE_URL || "./";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return `${cleanBase}data/${file}`;
}

export function getAuthHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("titanes_auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Resilient fetch helper with automatic retry for server cold starts (Render sleep / 500s / 502s / 503s / 504s)
async function safeFetch(url, options = {}, retries = 3, delayMs = 1500) {
  const mergedHeaders = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const finalOptions = {
    ...options,
    headers: mergedHeaders,
  };

  let lastError = null;
  let lastResponse = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, finalOptions);
      if (res.ok) return res;

      lastResponse = res;
      // If server returned 500, 502, 503 or 504 (typical Render waking-up errors)
      if (res.status >= 500 && i < retries) {
        // Exponential backoff: 1.5s -> 3s -> 4.5s... gives Render 10-15s to finish booting
        const waitTime = delayMs * (i + 1);
        console.warn(`[API] Servidor respondiendo ${res.status}. Posible inicio en frío de Render. Reintentando en ${waitTime}ms (intento ${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        const waitTime = delayMs * (i + 1);
        console.warn(`[API] Fallo de conexión (${err.message}). Reintentando en ${waitTime}ms (intento ${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }
      throw err;
    }
  }

  return lastResponse;
}

// ── Client-Side In-Memory Cache (0ms latency on tab switching) ──
const API_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora normal en días de semana

function isWeekend() {
  const day = new Date().getDay(); // 0 = Domingo, 6 = Sábado
  return day === 0 || day === 6;
}

export function invalidateApiCache(prefix = "") {
  if (!prefix) {
    API_CACHE.clear();
    return;
  }
  for (const key of API_CACHE.keys()) {
    if (key.includes(prefix)) {
      API_CACHE.delete(key);
    }
  }
}

async function fetchWithFallback(endpoint, staticFile, options = {}) {
  const cacheKey = `${endpoint}_${staticFile || ""}`;
  const now = Date.now();

  // 1. Instant Cache hit (0 ms)
  // En fines de semana (Sábado y Domingo), los mercados están 100% cerrados: la caché no expira
  if (!options.bypassCache && API_CACHE.has(cacheKey)) {
    const cached = API_CACHE.get(cacheKey);
    const ttl = isWeekend() ? 48 * 60 * 60 * 1000 : CACHE_TTL_MS;
    if (now - cached.timestamp < ttl) {
      return cached.data;
    }
    API_CACHE.delete(cacheKey);
  }

  let resultData = null;

  // Function to execute request against a base url
  const tryFetchBase = async (baseUrl, timeoutMs, retries = 0) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await safeFetch(
        `${baseUrl}${endpoint}`,
        { ...options, signal: controller.signal },
        retries,
        1500,
      );
      clearTimeout(timer);
      if (res && res.ok) {
        return await res.json();
      }
    } catch {
      clearTimeout(timer);
    }
    return null;
  };

  // 1. Primary backend try
  const isRenderPrimary = ACTIVE_BASE === RENDER_BACKEND_BASE;
  const timeout = options.timeoutMs || (isRenderPrimary ? 12000 : TIMEOUT_MS);
  // If we are already pointing to Render, give it 2 retries to wake up
  resultData = await tryFetchBase(ACTIVE_BASE, timeout, isRenderPrimary ? 2 : 0);

  // 2. If localhost was used and failed, automatically try Render cloud backend with wake-up retries!
  if (!resultData && ACTIVE_BASE === LOCAL_BACKEND_BASE) {
    resultData = await tryFetchBase(RENDER_BACKEND_BASE, 15000, 2);
    if (resultData) {
      // Switch active base so subsequent calls don't hang waiting for dead localhost
      ACTIVE_BASE = RENDER_BACKEND_BASE;
    }
  }

  // Filter check for authenticated empty state
  if (staticFile && resultData && typeof resultData === "object") {
    const hasAuth = Boolean(getAuthHeaders().Authorization);
    const isEmptyAccounts = Array.isArray(resultData.accounts) && resultData.accounts.length === 0;
    const isEmptyCDTs = Array.isArray(resultData.cdts) && resultData.cdts.length === 0;
    const isEmptyInflows = Array.isArray(resultData.inflows) && resultData.inflows.length === 0;
    const isEmptyNeeds = Array.isArray(resultData.needs) && resultData.needs.length === 0;
    if (!hasAuth && ((isEmptyAccounts && isEmptyCDTs) || (isEmptyInflows && isEmptyNeeds))) {
      resultData = null; // trigger static fallback below
    }
  }

  // 3. Seamless static fallback
  if (!resultData && staticFile) {
    try {
      const staticUrl = getStaticDataPath(staticFile);
      const staticRes = await fetch(staticUrl);
      if (staticRes.ok) {
        resultData = await staticRes.json();
      }
    } catch {
      // ignore static error
    }
  }

  if (resultData != null) {
    // Store in client memory cache
    API_CACHE.set(cacheKey, { timestamp: now, data: resultData });
    return resultData;
  }

  // If no static fallback file was configured (e.g. live quotes/intraday), return empty/null gracefully
  if (!staticFile) {
    return null;
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
  strategyId = "historical",
}) {
  const params = new URLSearchParams({
    period,
    investment: String(investment),
    num_slots: String(numSlots),
    strategy_id: strategyId || "historical",
  });
  if (selectedTickers && selectedTickers.length > 0) {
    params.set("selected_tickers", selectedTickers.join(","));
  }

  const staticFile = strategyId === "historical" || !strategyId ? `nav_${period}.json` : null;
  let data;
  try {
    data = await fetchWithFallback(`/nav?${params}`, staticFile, { timeoutMs: 15000 });
  } catch (err) {
    // If backend is unreachable and it's a custom strategy, try returning null rather than hard crashing
    console.warn(`fetchNAV could not fetch data for strategy ${strategyId}:`, err);
    return null;
  }

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
  return fetchWithFallback(`/prices/live?${params}`, null);
}

/** GET /api/prices/intraday/:ticker */
export async function fetchIntraday(ticker) {
  return fetchWithFallback(`/prices/intraday/${ticker}`, null);
}

/** GET /api/prices/indices_history?start_date=YYYY-MM-DD */
export async function fetchIndicesHistory(startDate) {
  try {
    const res = await safeFetch(`${BASE}/prices/indices_history?start_date=${startDate}`, {}, 2, 1000);
    if (res && res.ok) {
      return await res.json();
    }
  } catch {}
  return {};
}

/** GET /api/prices/historical/:ticker?date=YYYY-MM-DD&time=HH:MM */
export async function fetchHistoricalPrice(ticker, date, time = null) {
  // Try to fetch from backend with automatic retry. If offline, return a mock object.
  try {
    const timeParam = time ? `&time=${encodeURIComponent(time)}` : "";
    const res = await safeFetch(
      `${BASE}/prices/historical/${encodeURIComponent(ticker)}?date=${date}${timeParam}`,
      {},
      2,
      1000,
    );
    if (res && res.ok) {
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
export async function fetchRebalances(strategyId = "historical", options = {}) {
  const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : "";
  const staticFile = (!strategyId || strategyId === "historical") ? "rebalances.json" : null;
  return fetchWithFallback(`/rebalances${query}`, staticFile, options);
}

/** POST /api/rebalances */
export async function createRebalance({ rebalance_date, cash_added, tickers, strategy_id = "historical" }) {
  const res = await safeFetch(`${BASE}/rebalances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rebalance_date, cash_added, tickers, strategy_id }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al registrar rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** DELETE /api/rebalances/:date */
export async function deleteRebalance(date, strategyId = "historical") {
  const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : "";
  const res = await safeFetch(`${BASE}/rebalances/${date}${query}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al eliminar rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** PUT /api/rebalances/date */
export async function updateRebalanceDateApi(oldDate, newDate, strategyId = "historical") {
  const res = await safeFetch(`${BASE}/rebalances/date`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_date: oldDate, new_date: newDate, strategy_id: strategyId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al actualizar fecha de rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** CUSTOM STRATEGIES API */
export async function fetchCustomStrategiesApi() {
  return await fetchWithFallback("/custom-strategies", "custom_strategies.json");
}

export async function saveCustomStrategyApi(strat) {
  try {
    const res = await safeFetch(`${BASE}/custom-strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(strat),
    });
    if (!res.ok) throw new Error("Error al guardar estrategia en backend");
    invalidateApiCache("/custom-strategies");
    invalidateApiCache("/nav");
    return res.json();
  } catch (e) {
    console.warn("Backend unavailable for saving custom strategy, using local storage", e);
    invalidateApiCache("/custom-strategies");
    return { status: "local_only" };
  }
}

export async function deleteCustomStrategyApi(strategyId) {
  try {
    const res = await safeFetch(`${BASE}/custom-strategies/${strategyId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Error al eliminar estrategia en backend");
    invalidateApiCache("/custom-strategies");
    invalidateApiCache("/nav");
    return res.json();
  } catch (e) {
    console.warn("Backend unavailable for deleting custom strategy", e);
    invalidateApiCache("/custom-strategies");
    return { status: "local_only" };
  }
}

/** PURCHASES API */
export async function fetchPurchasesData() {
  const data = await fetchWithFallback("/purchases/portfolios", "purchases.json");
  if (!data || (!data.purchasePortfolios && !data.individualPurchases)) {
    throw new Error("Error fetching purchases data");
  }
  return data;
}

export async function createPurchasePortfolio(id, name, isPlan = false) {
  const res = await safeFetch(`${BASE}/purchases/portfolios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, isPlan }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchasePortfolioApi(id) {
  const res = await safeFetch(`${BASE}/purchases/portfolios/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function togglePortfolioPlanApi(id, isPlan, planConfig = null) {
  const res = await safeFetch(`${BASE}/purchases/portfolios/${id}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPlan, planConfig }),
  });
  invalidateApiCache("/purchases");
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
  invalidateApiCache("/purchases");
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
  const res = await safeFetch(`${BASE}/purchases/lots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lot),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function updatePurchaseLots(lots) {
  const res = await safeFetch(`${BASE}/purchases/lots`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lots),
  });
  if (!res.ok) throw new Error("Failed to update purchase lots");
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchaseLot(id) {
  const res = await safeFetch(`${BASE}/purchases/lots/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function createPurchaseSale(sale) {
  const res = await safeFetch(`${BASE}/purchases/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchaseSale(id) {
  const res = await safeFetch(`${BASE}/purchases/sales/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function syncPurchasesMigration(purchasePortfolios, individualPurchases, purchaseSales = []) {
  const res = await safeFetch(`${BASE}/purchases/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchasePortfolios, individualPurchases, purchaseSales }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

/** ── FIXED INCOME & SAVINGS ACCOUNTS API ── */

export async function fetchFixedIncomeData(options = {}) {
  return await fetchWithFallback("/fixed-income/data", "fixed_income.json", options);
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

// ── Cash Flow & Budget Allocation API ────────────────────────────

export async function fetchCashFlowData(options = {}) {
  return await fetchWithFallback("/cash-flow", "cash_flow.json", options);
}

export async function syncCashFlowStateApi(payload) {
  const res = await safeFetch(`${BASE}/cash-flow/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Error al sincronizar el estado de Flujo de Caja");
  return res.json();
}

export async function createInflowApi(item) {
  const res = await safeFetch(`${BASE}/cash-flow/inflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar ingreso");
  return res.json();
}

export async function deleteInflowApi(id) {
  const res = await safeFetch(`${BASE}/cash-flow/inflow/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar ingreso");
  return res.json();
}

export async function createNeedExpenseApi(item) {
  const res = await safeFetch(`${BASE}/cash-flow/need`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar gasto esencial");
  return res.json();
}

export async function deleteNeedExpenseApi(id) {
  const res = await safeFetch(`${BASE}/cash-flow/need/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar gasto esencial");
  return res.json();
}

export async function createWantExpenseApi(item) {
  const res = await safeFetch(`${BASE}/cash-flow/want`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar gasto de estilo de vida");
  return res.json();
}

export async function deleteWantExpenseApi(id) {
  const res = await safeFetch(`${BASE}/cash-flow/want/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar gasto de estilo de vida");
  return res.json();
}

export async function createWealthItemApi(item) {
  const res = await safeFetch(`${BASE}/cash-flow/wealth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar aporte de ahorro/inversión");
  return res.json();
}

export async function deleteWealthItemApi(id) {
  const res = await safeFetch(`${BASE}/cash-flow/wealth/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar asignación de ahorro/inversión");
  return res.json();
}

// ── AUTH API ENDPOINTS ─────────────────────────────────────────────────────────

export async function loginApi(email, password) {
  const res = await safeFetch(
    `${BASE}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    2,
    1500,
  );
  if (!res) throw new Error("Servidor no disponible");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error al iniciar sesión");
  return data;
}

export async function registerApi(email, password, name) {
  const res = await safeFetch(
    `${BASE}/auth/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    },
    2,
    1500,
  );
  if (!res) throw new Error("Servidor no disponible");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error al registrarse");
  return data;
}

export async function oauthLoginApi(idToken, profile = {}) {
  const res = await safeFetch(
    `${BASE}/auth/oauth`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, ...profile }),
    },
    2,
    1500,
  );
  if (!res) throw new Error("Servidor no disponible");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error en autenticación OAuth");
  return data;
}

export async function fetchMeApi() {
  try {
    const res = await safeFetch(`${BASE}/auth/me`);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── WARREN AI PROMPT GENERATOR API ──────────────────────────────────────────

export async function generateWarrenPromptApi({
  focus,
  userQuestion,
  useOllama = true,
  model = "qwen2.5-coder:14b",
} = {}) {
  const res = await safeFetch(`${BASE}/warren/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      focus,
      user_question: userQuestion,
      use_ollama: useOllama,
      model,
    }),
  });
  if (!res || !res.ok) throw new Error("Error generando prompt para WarrenAI");
  return res.json();
}

export async function fetchWarrenSummaryApi() {
  const res = await safeFetch(`${BASE}/warren/summary`);
  if (!res || !res.ok) throw new Error("Error obteniendo resumen de inversiones");
  return res.json();
}

