/**
 * API client — wraps fetch calls to the FastAPI backend.
 * Automatically falls back to static pre-calculated JSON data on GitHub Pages or when backend is offline!
 */

const BASE = 'http://127.0.0.1:8000/api';
const TIMEOUT_MS = 15000; // 15 seconds before checking static fallback

// Helper to get relative static data path on GitHub Pages
function getStaticDataPath(file) {
  const base = import.meta.env.BASE_URL || './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}data/${file}`;
}

async function fetchWithFallback(endpoint, staticFile, options = {}) {
  // If explicitly in static hosting or local backend is not available
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE}${endpoint}`, { ...options, signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend offline or running in static GitHub Pages environment
  }

  // Seamless static fallback
  if (staticFile) {
    const staticUrl = getStaticDataPath(staticFile);
    const staticRes = await fetch(staticUrl);
    if (staticRes.ok) {
      return await staticRes.json();
    }
  }

  throw new Error(`No se pudo cargar datos desde el backend ni desde el archivo estático ${staticFile}`);
}

/** GET /api/nav */
export async function fetchNAV({ period = '1Y', investment = 2000, numSlots = 15, selectedTickers }) {
  const params = new URLSearchParams({
    period,
    investment: String(investment),
    num_slots: String(numSlots),
  });
  if (selectedTickers && selectedTickers.length > 0) {
    params.set('selected_tickers', selectedTickers.join(','));
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
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  return fetchWithFallback(`/prices/live?${params}`, 'nav_1W.json');
}

/** GET /api/prices/intraday/:ticker */
export async function fetchIntraday(ticker) {
  return fetchWithFallback(`/prices/intraday/${ticker}`, 'nav_1W.json');
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
  return { price: null, error: 'Backend offline' };
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
  return fetchWithFallback('/rebalances', 'rebalances.json');
}

/** POST /api/rebalances */
export async function createRebalance({ rebalance_date, cash_added, tickers }) {
  const res = await fetch(`${BASE}/rebalances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rebalance_date, cash_added, tickers }),
  });
  if (!res.ok) throw new Error('Error al registrar rebalanceo');
  return res.json();
}

/** DELETE /api/rebalances/:date */
export async function deleteRebalance(date) {
  const res = await fetch(`${BASE}/rebalances/${date}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error al eliminar rebalanceo');
  return res.json();
}

/** PURCHASES API */
export async function fetchPurchasesData() {
  const res = await fetch(`${BASE}/purchases/portfolios`);
  if (!res.ok) throw new Error('Error fetching purchases data');
  return res.json();
}

export async function createPurchasePortfolio(id, name, isPlan = false) {
  const res = await fetch(`${BASE}/purchases/portfolios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, isPlan }),
  });
  return res.json();
}

export async function deletePurchasePortfolioApi(id) {
  const res = await fetch(`${BASE}/purchases/portfolios/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function togglePortfolioPlanApi(id, isPlan) {
  const res = await fetch(`${BASE}/purchases/portfolios/${id}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPlan }),
  });
  return res.json();
}

export async function createPurchaseLot(lot) {
  const res = await fetch(`${BASE}/purchases/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lot),
  });
  return res.json();
}

export async function updatePurchaseLots(lots) {
  const res = await fetch(`${BASE}/purchases/lots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lots),
  });
  if (!res.ok) throw new Error('Failed to update purchase lots');
  return res.json();
}

export async function deletePurchaseLot(id) {
  const res = await fetch(`${BASE}/purchases/lots/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function syncPurchasesMigration(purchasePortfolios, individualPurchases) {
  const res = await fetch(`${BASE}/purchases/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchasePortfolios, individualPurchases }),
  });
  return res.json();
}

