"""
/api/prices  — Live quotes & intraday endpoint.
/api/tickers — Ticker search/validation endpoint.
"""

import datetime
import yfinance as yf
from fastapi import APIRouter, Query
from services.market_data import DEFAULT_TICKERS, get_intraday, get_live_quotes, get_ticker_meta

def get_yf_ticker(ticker: str) -> yf.Ticker:
    return yf.Ticker(ticker)

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

@router.get("/prices/indices_history")
def indices_history(start_date: str = Query("2020-01-01", description="Start date in YYYY-MM-DD")):
    """
    Returns daily historical prices for S&P 500 and NASDAQ from start_date to today.
    """
    from services.market_data import get_historical_prices
    df = get_historical_prices(["^GSPC", "^IXIC"], period="MAX", include_benchmarks=False)
    df_pd = df.to_pandas()
    df_pd["date_str"] = df_pd["date"].astype(str).str[:10]
    df_pd = df_pd[df_pd["date_str"] >= start_date]
    
    result = {}
    for _, row in df_pd.iterrows():
        result[row["date_str"]] = {
            "SP500": row.get("SP500", None) if "SP500" in row else None,
            "NASDAQ": row.get("NASDAQ", None) if "NASDAQ" in row else None
        }
    return result


@router.get("/prices/historical/{ticker}")
def historical_price(ticker: str, date: str = Query(..., description="Date in YYYY-MM-DD")):
    """
    Returns the historical closing price of the ticker on the specified date.
    If the date is a weekend/holiday, returns the closest previous trading day's close.
    """
    ticker_clean = ticker.strip().upper()
    try:
        t = get_yf_ticker(ticker_clean)
        target_date = datetime.datetime.strptime(date, "%Y-%m-%d")
        # end date is exclusive in yfinance, so we add 1 day
        end_date = target_date + datetime.timedelta(days=1)
        # go back 7 days to ensure we hit a trading day (e.g. over long weekends)
        start_date = target_date - datetime.timedelta(days=7)
        
        df = t.history(start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"))
        if not df.empty:
            last_close = df['Close'].iloc[-1]
            actual_date = df.index[-1].strftime("%Y-%m-%d")
            return {
                "ticker": ticker_clean,
                "requested_date": date,
                "actual_date": actual_date,
                "price": round(float(last_close), 4)
            }
        else:
            return {"error": "No historical data found for this date range."}
    except Exception as exc:
        return {"error": str(exc)}



@router.get("/tickers/search")
def search_ticker(
    q: str = Query(..., min_length=1, description="Ticker symbol or company name"),
):
    """
    Validate a ticker and return basic info (name, price, exchange, sector).
    Used by the PortfolioManager add-ticker search.
    """

    ticker_clean = q.strip().upper()
    meta = get_ticker_meta(ticker_clean)

    try:
        t = get_yf_ticker(ticker_clean)
        info = t.info
        last_price = info.get("currentPrice") or info.get("regularMarketPrice") or getattr(t.fast_info, "last_price", 0.0)
        return {
            "ticker": ticker_clean,
            "name": meta.get("name") or info.get("longName") or info.get("shortName") or ticker_clean,
            "sector": meta.get("sector") or info.get("sector") or info.get("industry") or "Tecnología",
            "exchange": meta.get("exchange") or info.get("exchange") or "US",
            "currency": info.get("currency") or "USD",
            "quoteType": info.get("quoteType") or "EQUITY",
            "price": round(last_price or 0.0, 2),
            "valid": last_price is not None,
        }
    except Exception as exc:
        return {
            "ticker": ticker_clean,
            "name": meta.get("name", ticker_clean),
            "sector": meta.get("sector", "Tecnología"),
            "exchange": "US",
            "currency": "USD",
            "quoteType": "EQUITY",
            "valid": False,
            "error": str(exc),
        }

@router.get("/tickers/search_multiple")
def search_tickers_multiple(
    q: str = Query(..., min_length=1, description="Ticker symbol or company name"),
):
    import requests
    import urllib3
    urllib3.disable_warnings()

    try:
        res = requests.get(
            f"https://query2.finance.yahoo.com/v1/finance/search?q={q}",
            headers={'User-Agent': 'Mozilla/5.0'},
            verify=False,
            timeout=5
        ).json()
    except Exception as e:
        return {"results": []}

    quotes = res.get("quotes", [])
    valid_quotes = [q for q in quotes if q.get("symbol")]
    
    results = []
    # limit to top 6 to avoid slow response
    for quote in valid_quotes[:6]:
        sym = quote["symbol"]
        try:
            t = get_yf_ticker(sym)
            info = t.info
            last_price = info.get("currentPrice") or info.get("regularMarketPrice") or getattr(t.fast_info, "last_price", 0.0)
            
            results.append({
                "ticker": sym,
                "name": info.get("longName") or info.get("shortName") or quote.get("longname") or quote.get("shortname") or sym,
                "sector": info.get("sector") or info.get("industry") or quote.get("sectorDisp") or "Tecnología",
                "exchange": info.get("exchange") or quote.get("exchange") or "US",
                "currency": info.get("currency") or "USD",
                "quoteType": info.get("quoteType") or quote.get("quoteType") or "EQUITY",
                "price": round(last_price or 0.0, 2),
                "valid": last_price is not None,
            })
        except Exception:
            results.append({
                "ticker": sym,
                "name": quote.get("longname") or quote.get("shortname") or sym,
                "sector": quote.get("sectorDisp") or "Tecnología",
                "exchange": quote.get("exchange") or "US",
                "currency": "USD",
                "quoteType": quote.get("quoteType") or "EQUITY",
                "price": 0.0,
                "valid": False,
            })
    return {"results": results}


