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
            # Always simulate from earliest_rebal so trades, cost bases, and closed positions are 100% accurate
            effective_start = earliest_rebal
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
        period=period,
    )
    return result


@router.get("/nav/export/excel")
def export_nav_excel(
    request: Request,
    period: str = "MAX",
    investment: float = 2000.0,
    num_slots: int = 15,
    selected_tickers: str | None = None,
    strategy_id: str = "historical",
):
    from fastapi.responses import StreamingResponse
    from services.excel_exporter import generate_portfolio_excel
    from services.db import get_custom_strategies

    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    
    # 1. Determinar el nombre formal de la estrategia seleccionada
    custom_list = get_custom_strategies(user_id=user_id)
    strat_meta = next((s for s in custom_list if s["id"] == strategy_id), None)
    if strat_meta:
        strategy_name = strat_meta.get("name") or "Estrategia Personalizada"
    elif strategy_id == "historical":
        strategy_name = "Titanes Tecnológicos"
    else:
        strategy_name = strategy_id

    rebalances = get_all_rebalances(strategy_id=strategy_id, user_id=user_id)
    if not rebalances:
        empty_res = calculate_nav(None, investment=investment, num_slots=num_slots, strategy_id=strategy_id, user_id=user_id)
        excel_stream = generate_portfolio_excel(empty_res, investment=investment, strategy_name=strategy_name)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={strategy_name.replace(' ', '_')}_Reporte.xlsx"},
        )

    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])
    ticker_list = list(all_tickers)
    earliest_rebal = min([r["date"] for r in rebalances]) if rebalances else None

    selected_list = None
    if selected_tickers and isinstance(selected_tickers, str):
        selected_list = [t.strip().upper() for t in selected_tickers.split(",") if t.strip()]

    prices_df = get_historical_prices(ticker_list, period="MAX", start_date=earliest_rebal)
    nav_res = calculate_nav(
        prices_df,
        investment=investment,
        num_slots=num_slots,
        selected_tickers=selected_list,
        strategy_id=strategy_id,
        user_id=user_id,
        period="MAX",
    )

    # 2. Generar datos para la Hoja 4: Comparativa de todas las estrategias (Reales vs Simuladas)
    comparison_data = []
    
    # Agregamos primero la estrategia histórica (Titanes Tech)
    hist_rebalances = get_all_rebalances(strategy_id="historical", user_id=user_id)
    if hist_rebalances:
        hist_tickers = list({t for r in hist_rebalances for t in r["tickers"]})
        hist_start = min([r["date"] for r in hist_rebalances]) if hist_rebalances else None
        hist_prices = get_historical_prices(hist_tickers, period="MAX", start_date=hist_start)
        hist_nav = calculate_nav(hist_prices, investment=2000.0, num_slots=15, strategy_id="historical", user_id=user_id, period="MAX")
        hist_sum = hist_nav.get("summary", {})
        comparison_data.append({
            "id": "historical",
            "name": "Titanes Tech",
            "country": "🏆",
            "is_real_money": True,
            "num_slots": 15,
            "capital": 2000.0,
            "active_invested": hist_sum.get("active_invested", 0),
            "end_value": hist_sum.get("active_stock_value", hist_sum.get("end_value", 0)),
            "active_return": hist_sum.get("active_return", 0),
            "active_return_pct": hist_sum.get("active_return_pct", 0),
            "alpha_sp500": hist_sum.get("alpha_sp500", 0),
            "sharpe_ratio": hist_sum.get("sharpe_ratio", "N/A"),
            "win_rate_pct": hist_sum.get("win_rate_pct", 0),
            "closed_count": len(hist_nav.get("closed_holdings", [])),
        })

    # Agregamos cada estrategia personalizada registrada (reales y simuladas)
    for c_strat in custom_list:
        c_id = c_strat["id"]
        c_rebalances = get_all_rebalances(strategy_id=c_id, user_id=user_id)
        if not c_rebalances:
            continue
        c_tickers = list({t for r in c_rebalances for t in r["tickers"]})
        c_start = min([r["date"] for r in c_rebalances]) if c_rebalances else None
        c_prices = get_historical_prices(c_tickers, period="MAX", start_date=c_start)
        c_nav = calculate_nav(
            c_prices,
            investment=float(c_strat.get("capital") or 1000.0),
            num_slots=int(c_strat.get("numSlots") or 20),
            strategy_id=c_id,
            user_id=user_id,
            period="MAX",
        )
        c_sum = c_nav.get("summary", {})
        comparison_data.append({
            "id": c_id,
            "name": c_strat.get("name", c_id),
            "country": c_strat.get("country", "🌎"),
            "is_real_money": bool(c_strat.get("isRealMoney")),
            "num_slots": int(c_strat.get("numSlots") or 20),
            "capital": float(c_strat.get("capital") or 1000.0),
            "active_invested": c_sum.get("active_invested", 0),
            "end_value": c_sum.get("active_stock_value", c_sum.get("end_value", 0)),
            "active_return": c_sum.get("active_return", 0),
            "active_return_pct": c_sum.get("active_return_pct", 0),
            "alpha_sp500": c_sum.get("alpha_sp500", 0),
            "sharpe_ratio": c_sum.get("sharpe_ratio", "N/A"),
            "win_rate_pct": c_sum.get("win_rate_pct", 0),
            "closed_count": len(c_nav.get("closed_holdings", [])),
        })

    excel_stream = generate_portfolio_excel(
        nav_res,
        investment=investment,
        strategy_name=strategy_name,
        comparison_data=comparison_data,
    )
    safe_name = "".join(c for c in strategy_name if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    filename = f"{safe_name}_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


