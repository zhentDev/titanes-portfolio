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
    Validate a ticker and return basic info (name, price, exchange, sector).
    Used by the PortfolioManager add-ticker search.
    """
    from services.market_data import get_ticker_meta

    ticker_clean = q.strip().upper()
    meta = get_ticker_meta(ticker_clean)

    try:
        t = yf.Ticker(ticker_clean)
        info = t.fast_info
        last_price = info.last_price
        return {
            "ticker": ticker_clean,
            "name": meta.get("name") or ticker_clean,
            "sector": meta.get("sector") or "Tecnología",
            "exchange": meta.get("exchange") or getattr(info, "exchange", "US"),
            "price": round(last_price or 0.0, 2),
            "valid": last_price is not None,
        }
    except Exception as exc:
        return {
            "ticker": ticker_clean,
            "name": meta.get("name", ticker_clean),
            "sector": meta.get("sector", "Tecnología"),
            "exchange": "US",
            "valid": False,
            "error": str(exc),
        }

