/**
 * API client — wraps fetch calls to the FastAPI backend.
 */

const BASE = 'http://localhost:8000/api';
const TIMEOUT_MS = 30_000; // 30 seconds

/** Fetch with timeout */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`Error ${res.status} — ¿está corriendo el backend en localhost:8000?`);
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Timeout (30s) — el backend no respondió. Ejecuta: uv run uvicorn main:app --reload');
    }
    if (err.message.includes('Failed to fetch') || err.message.includes('fetch')) {
      throw new Error('No se pudo conectar al servidor. El backend está apagado o colapsó (Ej. DBeaver bloqueando la Base de Datos).');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/nav */
export async function fetchNAV({ period, investment, numSlots }) {
  const params = new URLSearchParams({
    period,
    investment: String(investment),
    num_slots: String(numSlots),
  });
  return fetchWithTimeout(`${BASE}/nav?${params}`);
}

/** GET /api/prices/live */
export async function fetchLiveQuotes(tickers) {
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  return fetchWithTimeout(`${BASE}/prices/live?${params}`);
}

/** GET /api/prices/intraday/:ticker */
export async function fetchIntraday(ticker) {
  return fetchWithTimeout(`${BASE}/prices/intraday/${ticker}`);
}

/** GET /api/tickers/search?q=... */
export async function searchTicker(q) {
  return fetchWithTimeout(`${BASE}/tickers/search?q=${encodeURIComponent(q)}`);
}

/** GET /api/rebalances */
export async function fetchRebalances() {
  return fetchWithTimeout(`${BASE}/rebalances`);
}

/** POST /api/rebalances */
export async function createRebalance({ rebalance_date, cash_added, tickers }) {
  return fetchWithTimeout(`${BASE}/rebalances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rebalance_date, cash_added, tickers })
  });
}

/** DELETE /api/rebalances/:date */
export async function deleteRebalance(date) {
  return fetchWithTimeout(`${BASE}/rebalances/${date}`, {
    method: 'DELETE'
  });
}
