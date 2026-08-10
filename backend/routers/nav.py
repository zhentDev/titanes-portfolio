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
    period: str = "1Y",
    investment: float = 2000.0,
    num_slots: int = 15,
    selected_tickers: str | None = None,
):
    rebalances = get_all_rebalances()
    if not rebalances:
        return calculate_nav(None, investment=investment, num_slots=num_slots)

    # Parse selected tickers list
    selected_list = None
    if selected_tickers and isinstance(selected_tickers, str):
        selected_list = [t.strip().upper() for t in selected_tickers.split(",") if t.strip()]

    # Collect all unique tickers ever held in the portfolio
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])

    ticker_list = list(all_tickers)
    prices_df = get_historical_prices(ticker_list, period=period)

    result = calculate_nav(
        prices_df,
        investment=investment,
        num_slots=num_slots,
        selected_tickers=selected_list,
    )
    return result
