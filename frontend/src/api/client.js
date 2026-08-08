/**
 * API client — wraps fetch calls to the FastAPI backend.
 */

const BASE = 'http://localhost:8000/api';
const TIMEOUT_MS = 30_000; // 30 seconds

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch {
        errorData = null;
      }
      const err = new Error(errorData?.message || `Error ${res.status} en backend`);
      err.backendError = errorData;
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Timeout (30s) — el backend tardó demasiado en responder.');
      e.isConnectionError = true;
      throw e;
    }
    if (err.message.includes('Failed to fetch') || err.message.includes('fetch')) {
      const e = new Error('No se pudo conectar al servidor en localhost:8000. Verifica que el backend esté encendido.');
      e.isConnectionError = true;
      throw e;
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
  const data = await fetchWithTimeout(`${BASE}/nav?${params}`);
  console.log('[FRONTEND API /nav] Respuesta completa del Backend:', data);
  console.log('[FRONTEND API /nav] Puntos SP500 recibidos:', data?.sp500?.length, data?.sp500);
  console.log('[FRONTEND API /nav] Puntos NASDAQ recibidos:', data?.nasdaq?.length, data?.nasdaq);
  return data;
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
