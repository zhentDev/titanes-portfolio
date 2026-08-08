"""
/api/prices  — Live quotes & intraday endpoint.
/api/tickers — Ticker search/validation endpoint.
"""

import yfinance as yf
from fastapi import APIRouter, Query
from services.market_data import DEFAULT_TICKERS, get_intraday, get_live_quotes

router = APIRouter(tags=["Prices"])


@router.get("/prices/live")
def live_quotes(
    tickers: str = Query(
        default=",".join(DEFAULT_TICKERS),
        description="Comma-separated list of tickers",
    ),
):
    """
    Returns current price, daily change and % change for each ticker.
    Data is cached for 60 seconds to avoid rate-limiting Yahoo Finance.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    return get_live_quotes(ticker_list)


@router.get("/prices/intraday/{ticker}")
def intraday(ticker: str):
    """
    Returns 5-minute intraday candles for the current trading day.
    Useful for the Live mode sparkline chart.
    """
    return get_intraday(ticker.upper())


@router.get("/tickers/search")
def search_ticker(
    q: str = Query(..., min_length=1, description="Ticker symbol or company name"),
):
    """
    Validate a ticker and return basic info (name, price, exchange).
    Used by the PortfolioManager add-ticker search.
    """
    try:
        t = yf.Ticker(q.upper())
        info = t.fast_info
        name = getattr(t, "info", {}).get("longName", q.upper())
        return {
            "ticker": q.upper(),
            "name": name,
            "price": round(info.last_price or 0.0, 4),
            "exchange": getattr(info, "exchange", ""),
            "valid": info.last_price is not None,
        }
    except Exception as exc:
        return {"ticker": q.upper(), "valid": False, "error": str(exc)}
