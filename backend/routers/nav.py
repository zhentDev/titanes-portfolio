"""
/api/nav — Historical portfolio NAV endpoint.
"""

from fastapi import APIRouter, Query
from services.db import get_all_rebalances
from services.market_data import get_historical_prices
from services.nav_engine import calculate_nav

router = APIRouter(tags=["NAV"])


@router.get("/nav")
def nav_endpoint(
    period: str = Query(default="1Y", description="1M | 3M | 6M | 1Y | 3Y | 5Y | MAX"),
    investment: float = Query(default=2000.0, ge=1.0, description="Starting capital in USD"),
    num_slots: int = Query(
        default=15, ge=1, description="Fixed number of portfolio slots (default 15)"
    ),
):
    rebalances = get_all_rebalances()
    print(f"\n[BACKEND NAV] === Petición /api/nav (period={period}, inv={investment}) ===")
    print(f"[BACKEND NAV] 1. Rebalanceos en DuckDB: {len(rebalances) if rebalances else 0}")
    if not rebalances:
        print("[BACKEND NAV] ⚠️ No hay rebalanceos en DuckDB. Devolviendo arrays vacíos.")
        return calculate_nav(None, investment=investment, num_slots=num_slots)

    # Collect all unique tickers ever held in the portfolio
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])

    ticker_list = list(all_tickers)
    print(f"[BACKEND NAV] 2. Tickers del portafolio ({len(ticker_list)}): {ticker_list}")
    prices_df = get_historical_prices(ticker_list, period=period)
    print(f"[BACKEND NAV] 3. Columnas en prices_df ({len(prices_df)} filas): {prices_df.columns}")

    result = calculate_nav(prices_df, investment=investment, num_slots=num_slots)
    sp500_res = result.get("sp500", [])
    nasdaq_res = result.get("nasdaq", [])
    nav_res = result.get("nav", [])
    print(f"[BACKEND NAV] 4. Puntos calculados -> NAV: {len(nav_res)} | S&P500: {len(sp500_res)} | NASDAQ: {len(nasdaq_res)}")
    if sp500_res:
        print(f"[BACKEND NAV]    Muestra S&P500 (primer punto): {sp500_res[0]}")
    else:
        print("[BACKEND NAV] ⚠️ 'sp500' devolvió un array vacío []")
    return result
