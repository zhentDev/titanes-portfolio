"""
/api/nav — Historical portfolio NAV endpoint.
"""

from fastapi import APIRouter, Query
from services.market_data import get_historical_prices
from services.nav_engine import calculate_nav
from services.db import get_all_rebalances

router = APIRouter(tags=["NAV"])

@router.get("/nav")
def nav_endpoint(
    period: str = Query(default="1Y", description="1M | 3M | 6M | 1Y | 3Y | 5Y | MAX"),
    investment: float = Query(default=2000.0, ge=1.0, description="Starting capital in USD"),
    num_slots: int = Query(default=15, ge=1, description="Fixed number of portfolio slots (default 15)"),
):
    rebalances = get_all_rebalances()
    if not rebalances:
        return calculate_nav(None, investment=investment, num_slots=num_slots)
    
    # Collect all unique tickers ever held in the portfolio
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r['tickers'])
        
    ticker_list = list(all_tickers)
    # We still need the period because the user can zoom the chart (though the portfolio line will always start at the first rebalance date)
    prices_df = get_historical_prices(ticker_list, period=period)
    
    result = calculate_nav(prices_df, investment=investment, num_slots=num_slots)
    return result
