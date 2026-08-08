"""
Market data service using yfinance.
Provides historical OHLCV data and real-time quotes.
Cache is simple in-memory with TTL to avoid hammering Yahoo Finance.
"""

import threading
import time
from datetime import datetime, timezone

import pandas as pd
import polars as pl
import yfinance as yf

# ──────────────────────────────────────────────
# Default portfolio & benchmarks
# ──────────────────────────────────────────────
DEFAULT_TICKERS: list[str] = [
    "AMD",
    "AMAT",
    "HPQ",
    "INTC",
    "ON",
    "ORCL",
    "POWI",
    "QCOM",
    "TXN",
    "MRVL",
    "HIMX",
    "NTAP",
    "KD",
    "ARM",
]
BENCHMARKS: list[str] = ["^GSPC", "^IXIC"]

# ──────────────────────────────────────────────
# Redis Cache Integration
# ──────────────────────────────────────────────
import logging
import os
import pickle

import redis

try:
    _redis_host = os.environ.get("REDIS_HOST", "localhost")
    _redis_client = redis.Redis(host=_redis_host, port=6379, db=0, decode_responses=False)
    # Test connection
    _redis_client.ping()
    _use_redis = True
except Exception as e:
    logging.warning(f"Redis not available, falling back to in-memory cache. Error: {e}")
    _use_redis = False

_memory_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()
HISTORICAL_TTL = 3600  # 1 hour for daily historical data
LIVE_TTL = 60  # 1 minute for live quotes


def _cache_get(key: str) -> object | None:
    if _use_redis:
        try:
            cached = _redis_client.get(key)
            if cached:
                return pickle.loads(cached)
            return None
        except Exception:
            pass

    # Fallback to memory
    with _cache_lock:
        if key in _memory_cache:
            ts, data = _memory_cache[key]
            ttl = LIVE_TTL if key.startswith("live:") else HISTORICAL_TTL
            if time.time() - ts < ttl:
                return data
    return None


def _cache_set(key: str, data: object) -> None:
    ttl = LIVE_TTL if key.startswith("live:") else HISTORICAL_TTL
    if _use_redis:
        try:
            _redis_client.setex(key, ttl, pickle.dumps(data))
            return
        except Exception:
            pass

    # Fallback to memory
    with _cache_lock:
        _memory_cache[key] = (time.time(), data)


# ──────────────────────────────────────────────
# Historical prices
# ──────────────────────────────────────────────
PERIOD_MAP = {
    "1W": "1wk",
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1Y": "1y",
    "3Y": "3y",
    "5Y": "5y",
    "MAX": "max",
}


def get_historical_prices(
    tickers: list[str],
    period: str = "1Y",
    include_benchmarks: bool = True,
) -> pl.DataFrame:
    """
    Download adjusted closing prices for tickers (and benchmarks).
    Returns a Polars DataFrame with columns: date, <ticker1>, <ticker2>, …
    """
    all_tickers = list(tickers)
    if include_benchmarks:
        all_tickers += BENCHMARKS

    cache_key = f"hist:{','.join(sorted(all_tickers))}:{period}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    yf_period = PERIOD_MAP.get(period.upper(), "1y")

    raw: pd.DataFrame = yf.download(
        all_tickers,
        period=yf_period,
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    # yfinance returns MultiIndex when multiple tickers
    if isinstance(raw.columns, pd.MultiIndex):
        closes: pd.DataFrame = raw["Close"].copy()
    else:
        # Single ticker — raw is already the OHLCV df
        closes = raw[["Close"]].copy()
        closes.columns = [all_tickers[0]]

    closes.index.name = "date"
    closes = closes.reset_index()
    closes["date"] = pd.to_datetime(closes["date"]).dt.date

    df = pl.from_pandas(closes)

    # Rename benchmark columns to friendly names
    rename_map: dict[str, str] = {}
    if "^GSPC" in df.columns:
        rename_map["^GSPC"] = "SP500"
    if "^IXIC" in df.columns:
        rename_map["^IXIC"] = "NASDAQ"
    if rename_map:
        df = df.rename(rename_map)

    _cache_set(cache_key, df)
    return df


# ──────────────────────────────────────────────
# Live / current quotes
# ──────────────────────────────────────────────
def get_live_quotes(tickers: list[str]) -> list[dict]:
    """
    Fetch current price, change, % change for each ticker.
    Returns a list of dicts ready to be serialised as JSON.
    """
    cache_key = f"live:{','.join(sorted(tickers))}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    results: list[dict] = []
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            fi = t.fast_info
            price: float = fi.last_price or 0.0
            prev: float = fi.previous_close or price
            change = price - prev
            change_pct = (change / prev * 100) if prev else 0.0
            results.append(
                {
                    "ticker": ticker,
                    "price": round(price, 4),
                    "change": round(change, 4),
                    "change_pct": round(change_pct, 4),
                    "previous_close": round(prev, 4),
                    "market_open": _is_market_open(),
                }
            )
        except Exception as exc:
            results.append(
                {
                    "ticker": ticker,
                    "price": None,
                    "change": None,
                    "change_pct": None,
                    "previous_close": None,
                    "market_open": False,
                    "error": str(exc),
                }
            )

    _cache_set(cache_key, results)
    return results


def get_intraday(ticker: str) -> list[dict]:
    """
    Return intraday 5-minute prices for a single ticker (today).
    """
    cache_key = f"intraday:{ticker}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        df = yf.download(ticker, period="1d", interval="5m", auto_adjust=True, progress=False)
        records = []
        for idx, row in df.iterrows():
            # Check for NaN safely
            try:
                val = float(row.iloc[0] if isinstance(row, pd.Series) else row["Close"])
                if pd.isna(val):
                    continue
                records.append(
                    {
                        "time": int(idx.timestamp()),
                        "value": round(val, 4),
                    }
                )
            except Exception:
                continue
    except Exception:
        records = []

    _cache_set(cache_key, records)
    return records


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def _is_market_open() -> bool:
    """
    Rough check: NYSE is open Mon–Fri 14:30–21:00 UTC.
    Does NOT account for holidays — good enough for UI indicator.
    """
    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:  # Saturday / Sunday
        return False
    hour_utc = now.hour + now.minute / 60
    return 14.5 <= hour_utc < 21.0
