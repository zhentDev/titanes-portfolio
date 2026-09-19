"""
/api/nav — Historical portfolio NAV endpoint.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Query, Request
from services.auth import get_optional_current_user
from services.db import get_all_rebalances
from services.market_data import get_historical_prices
from services.nav_engine import calculate_nav

router = APIRouter(tags=["NAV"])

# Map UI period codes to approximate timedelta offsets
_PERIOD_DELTAS = {
    "1W": timedelta(weeks=1),
    "1M": timedelta(days=30),
    "3M": timedelta(days=90),
    "6M": timedelta(days=180),
    "1Y": timedelta(days=365),
    "3Y": timedelta(days=365 * 3),
    "5Y": timedelta(days=365 * 5),
    "MAX": timedelta(days=365 * 30),  # effectively "all history"
}


@router.get("/nav")
def nav_endpoint(
    request: Request,
    period: str = "1Y",
    investment: float = 2000.0,
    num_slots: int = 15,
    selected_tickers: str | None = None,
    strategy_id: str = "historical",
):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    rebalances = get_all_rebalances(strategy_id=strategy_id, user_id=user_id)
    if not rebalances:
        return calculate_nav(None, investment=investment, num_slots=num_slots, strategy_id=strategy_id, user_id=user_id)

    # Parse selected tickers list
    selected_list = None
    if selected_tickers and isinstance(selected_tickers, str):
        selected_list = [t.strip().upper() for t in selected_tickers.split(",") if t.strip()]

    # Collect all unique tickers ever held in the portfolio
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])

    ticker_list = list(all_tickers)
    earliest_rebal = min([r["date"] for r in rebalances]) if rebalances else None

    # Compute period-aware start date:
    # Use the LATER of (earliest_rebal, today - period_delta) so that
    # short periods (1W, 1M) return fewer data points instead of the full history.
    # For 1D, we don't pass start_date so get_historical_prices downloads 1d with 1h interval.
    is_intraday = period.upper() == "1D"
    if is_intraday:
        effective_start = None
    else:
        period_delta = _PERIOD_DELTAS.get(period.upper(), _PERIOD_DELTAS["1Y"])
        period_start_str = (date.today() - period_delta).isoformat()
        if earliest_rebal:
            # Use whichever is MORE recent: earliest_rebal or period-implied start
            effective_start = max(earliest_rebal, period_start_str)
        else:
            effective_start = period_start_str

    prices_df = get_historical_prices(ticker_list, period=period, start_date=effective_start)

    result = calculate_nav(
        prices_df,
        investment=investment,
        num_slots=num_slots,
        selected_tickers=selected_list,
        strategy_id=strategy_id,
        user_id=user_id,
    )
    return result

