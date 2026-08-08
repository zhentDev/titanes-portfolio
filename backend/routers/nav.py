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
    selected_tickers: str = Query(
        default=None,
        description="Comma-separated list of active tickers to include in simulation",
    ),
):
    rebalances = get_all_rebalances()
    if not rebalances:
        return calculate_nav(None, investment=investment, num_slots=num_slots)

    # Parse selected tickers list
    selected_list = None
    if selected_tickers:
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

