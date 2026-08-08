"""
NAV Engine — Polars (Rust-backed) portfolio NAV calculator.

Tracks real NAV by stringing together the performance of the portfolio
across different rebalance periods based on the user's rebalance history.
"""

from __future__ import annotations

import polars as pl

from services.db import get_all_rebalances


def calculate_nav(
    prices_df: pl.DataFrame,
    investment: float = 2000.0,
    num_slots: int = 15,
) -> dict:
    """
    Calculate portfolio NAV using DuckDB rebalance history.
    """
    rebalances = get_all_rebalances()
    if not rebalances:
        return _empty_response(investment)

    # Sort rebalances by date
    rebalances.sort(key=lambda r: r["date"])

    # Initial state
    current_shares = {}
    rebalance_prices = {}
    current_cash = 0.0
    current_value = 0.0
    total_invested = investment

    nav_series = []

    # Process each day in prices_df
    # To do this efficiently in Polars, we can compute the value for each period between rebalances.

    # Convert prices_df to a dictionary of {date_str: {ticker: price}} for fast row-by-row simulation
    # since rebalances are stateful.
    # We only care about dates >= first rebalance date
    start_date_str = rebalances[0]["date"]

    prices_pd = prices_df.to_pandas()
    prices_pd["date_str"] = prices_pd["date"].astype(str).str[:10]
    prices_pd = prices_pd[prices_pd["date_str"] >= start_date_str]
    prices_pd.set_index("date_str", inplace=True)

    # We will simulate day by day
    rebalance_idx = 0
    next_rebalance = rebalances[rebalance_idx]

    for date_str, row in prices_pd.iterrows():
        # Check if today is a rebalance day
        while next_rebalance and date_str >= next_rebalance["date"]:
            # Execute rebalance
            # 1. Determine cash to add (only on the very first rebalance)
            cash_to_add = investment if rebalance_idx == 0 else 0.0

            # 2. Calculate total portfolio value before rebalance
            # Value = cash + value of all current shares
            stock_value = 0.0
            for t, shares in current_shares.items():
                price = row.get(t)
                if (
                    price is not None
                    and not pl.Series([price]).is_null()[0]
                    and not str(price) == "nan"
                ):
                    stock_value += shares * price

            total_portfolio_value = stock_value + current_cash + cash_to_add

            # 3. Distribute equally among the new tickers
            new_tickers = next_rebalance["tickers"]
            # Filter out tickers that don't have price data today
            valid_tickers = []
            for t in new_tickers:
                if t in row and not pl.Series([row[t]]).is_null()[0] and not str(row[t]) == "nan":
                    valid_tickers.append(t)

            allocated_slots = len(valid_tickers)
            unallocated_slots = num_slots - allocated_slots

            slot_value = total_portfolio_value / num_slots

            # Buy new shares
            current_shares = {}
            rebalance_prices = {}
            for t in valid_tickers:
                price = row[t]
                current_shares[t] = slot_value / price
                rebalance_prices[t] = price

            # Remaining cash is unallocated slots
            current_cash = slot_value * unallocated_slots

            # Advance to next rebalance
            rebalance_idx += 1
            if rebalance_idx < len(rebalances):
                next_rebalance = rebalances[rebalance_idx]
            else:
                next_rebalance = None

        # Calculate end of day value
        eod_stock_value = 0.0
        for t, shares in current_shares.items():
            price = row.get(t)
            if price is not None and not str(price) == "nan":
                eod_stock_value += shares * price

        eod_total_value = eod_stock_value + current_cash
        nav_series.append(
            {
                "date": str(date_str),
                "value": round(eod_total_value, 4),
                "invested": round(total_invested, 4),  # Base line
            }
        )
        current_value = eod_total_value

    if not nav_series:
        return _empty_response(investment)

    # Current holdings breakdown & active capital
    from services.market_data import get_ticker_meta

    last_rebalance = rebalances[-1]
    active_tickers = last_rebalance["tickers"]

    # Active capital deployed in equities
    active_count = len([t for t in active_tickers if t in current_shares])
    active_invested = round(investment * (active_count / num_slots), 4) if num_slots > 0 else investment

    def _benchmark_series(col: str) -> list[dict]:
        if col not in prices_df.columns:
            return []
        bdf = (
            prices_df.filter(pl.col("date").cast(pl.String) >= str(start_date_str))
            .select(["date", col])
            .drop_nulls()
        )
        if bdf.is_empty():
            return []
        b0 = float(bdf[col][0])
        # Escala el benchmark al capital real invertido en acciones
        bdf = bdf.with_columns(
            (pl.col(col) / b0 * active_invested).alias("value"),
        )
        points = [
            {"date": str(r["date"]), "value": round(r["value"], 4)}
            for r in bdf.iter_rows(named=True)
        ]
        return points

    last_row = prices_pd.iloc[-1]


    holdings = []
    slot_weight_pct = 100.0 / num_slots

    current_stock_value = 0.0
    for t in active_tickers:
        shares = current_shares.get(t, 0.0)
        current_price = last_row.get(t, 0.0)
        if str(current_price) == "nan":
            current_price = 0.0

        start_price = rebalance_prices.get(t, 0.0)
        val = shares * current_price
        current_stock_value += val

        return_pct = 0.0
        if start_price > 0:
            return_pct = ((current_price - start_price) / start_price) * 100.0

        meta = get_ticker_meta(t)

        holdings.append(
            {
                "ticker": t,
                "name": meta.get("name", t),
                "sector": meta.get("sector", "Tecnología"),
                "exchange": meta.get("exchange", "NASDAQ"),
                "weight": round(slot_weight_pct, 2) if shares > 0 else 0.0,
                "shares": round(shares, 6),
                "start_price": round(start_price, 4),
                "current_price": round(current_price, 4),
                "current_value": round(val, 4),
                "return_pct": round(return_pct, 4),
            }
        )

    unallocated_slots = num_slots - len([t for t in active_tickers if t in current_shares])
    cash_reserved = current_cash

    sp500_series = _benchmark_series("SP500")
    nasdaq_series = _benchmark_series("NASDAQ")

    # Rendimiento sobre capital activo en acciones (puro Titanes)
    active_return = current_stock_value - active_invested
    active_return_pct = (active_return / active_invested * 100) if active_invested > 0 else 0.0

    # Rendimiento de los benchmarks sobre ese mismo capital
    sp500_end_val = sp500_series[-1]["value"] if sp500_series else active_invested
    sp500_return_pct = ((sp500_end_val - active_invested) / active_invested * 100) if active_invested > 0 else 0.0

    nasdaq_end_val = nasdaq_series[-1]["value"] if nasdaq_series else active_invested
    nasdaq_return_pct = ((nasdaq_end_val - active_invested) / active_invested * 100) if active_invested > 0 else 0.0

    # Métricas ProPicks AI: Alfa (Exceso de retorno sobre benchmarks)
    alpha_sp500 = round(active_return_pct - sp500_return_pct, 2)
    alpha_nasdaq = round(active_return_pct - nasdaq_return_pct, 2)

    # Max Drawdown histórico
    max_dd = 0.0
    peak = -1.0
    for pt in nav_series:
        v = pt["value"]
        if v > peak:
            peak = v
        dd = ((v - peak) / peak * 100.0) if peak > 0 else 0.0
        if dd < max_dd:
            max_dd = dd

    total_return = current_value - total_invested
    total_return_pct = (
        (total_return / total_invested * 100) if total_invested > 0 else 0.0
    )

    return {
        "nav": nav_series,
        "sp500": sp500_series,
        "nasdaq": nasdaq_series,
        "holdings": sorted(holdings, key=lambda h: h["current_value"], reverse=True),
        "summary": {
            "start_value": round(investment, 2),
            "end_value": round(current_value, 2),
            "invested_value": round(total_invested, 2),
            "active_invested": round(active_invested, 2),
            "active_stock_value": round(current_stock_value, 2),
            "active_return_pct": round(active_return_pct, 2),
            "sp500_return_pct": round(sp500_return_pct, 2),
            "nasdaq_return_pct": round(nasdaq_return_pct, 2),
            "alpha_sp500": alpha_sp500,
            "alpha_nasdaq": alpha_nasdaq,
            "max_drawdown_pct": round(max_dd, 2),
            "cash_reserved": round(cash_reserved, 2),
            "total_return": round(total_return, 2),
            "total_return_pct": round(total_return_pct, 2),
            "num_holdings": len([t for t in active_tickers if t in current_shares]),
            "num_slots": num_slots,
            "unallocated_slots": unallocated_slots,
        },
    }



def _empty_response(investment: float) -> dict:
    return {
        "nav": [],
        "sp500": [],
        "nasdaq": [],
        "holdings": [],
        "summary": {
            "start_value": investment,
            "end_value": investment,
            "invested_value": investment,
            "cash_reserved": 0.0,
            "total_return": 0.0,
            "total_return_pct": 0.0,
            "num_holdings": 0,
            "num_slots": 15,
            "unallocated_slots": 15,
        },
    }
