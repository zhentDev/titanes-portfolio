"""
Market data service using yfinance.
Provides historical OHLCV data and real-time quotes.
Cache is simple in-memory with TTL to avoid hammering Yahoo Finance.
"""

import warnings
warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

import threading
import time
from datetime import datetime, timezone
import traceback
from typing import Any, Dict

import pandas as pd
import polars as pl
import yfinance as yf
from curl_cffi import requests as cureq

_yf_session = cureq.Session(impersonate="chrome", verify=False)


def get_yf_ticker(ticker: str) -> yf.Ticker:
    return yf.Ticker(ticker, session=_yf_session)


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
BENCHMARKS: list[str] = ["^GSPC", "^IXIC", "IJH", "^MID"]

# Catálogo oficial de metadatos para Titanes Tecnológicos y acciones de MM20
TICKER_METADATA: dict[str, dict[str, str]] = {
    "AMD": {
        "name": "Advanced Micro Devices, Inc.",
        "sector": "Semiconductores & GPUs",
        "exchange": "NASDAQ",
    },
    "AMAT": {
        "name": "Applied Materials, Inc.",
        "sector": "Equipamiento de Semiconductores",
        "exchange": "NASDAQ",
    },
    "HPQ": {"name": "HP Inc.", "sector": "Hardware, PCs & Impresión", "exchange": "NYSE"},
    "INTC": {
        "name": "Intel Corporation",
        "sector": "Procesadores & Fabricación",
        "exchange": "NASDAQ",
    },
    "ON": {
        "name": "ON Semiconductor Corporation",
        "sector": "Semiconductores & Automoción",
        "exchange": "NASDAQ",
    },
    "ORCL": {
        "name": "Oracle Corporation",
        "sector": "Software Empresarial & Nube",
        "exchange": "NYSE",
    },
    "POWI": {
        "name": "Power Integrations, Inc.",
        "sector": "Chips de Alta Eficiencia",
        "exchange": "NASDAQ",
    },
    "QCOM": {"name": "Qualcomm Incorporated", "sector": "Chips Móviles & 5G", "exchange": "NASDAQ"},
    "TXN": {
        "name": "Texas Instruments Incorporated",
        "sector": "Semiconductores Analógicos",
        "exchange": "NASDAQ",
    },
    "MRVL": {
        "name": "Marvell Technology, Inc.",
        "sector": "Infraestructura & Centros de Datos",
        "exchange": "NASDAQ",
    },
    "HIMX": {
        "name": "Himax Technologies, Inc.",
        "sector": "Controladores de Pantalla",
        "exchange": "NASDAQ",
    },
    "NTAP": {
        "name": "NetApp, Inc.",
        "sector": "Almacenamiento Híbrido & Nube",
        "exchange": "NASDAQ",
    },
    "KD": {
        "name": "Kyndryl Holdings, Inc.",
        "sector": "Infraestructura TI & Servicios",
        "exchange": "NYSE",
    },
    "ARM": {
        "name": "Arm Holdings plc",
        "sector": "Arquitectura de Microchips",
        "exchange": "NASDAQ",
    },
    # Mid-caps MM20
    "ARLP": {
        "name": "Alliance Resource Partners",
        "sector": "Energía / Carbón",
        "exchange": "NASDAQ",
    },
    "ACLS": {"name": "Axcelis Technologies", "sector": "Semiconductores", "exchange": "NASDAQ"},
    "BHC": {"name": "Bausch Health", "sector": "Salud / Farmacéutica", "exchange": "NYSE"},
    "DIOD": {"name": "Diodes Inc", "sector": "Semiconductores", "exchange": "NASDAQ"},
    "HAE": {"name": "Haemonetics Corp", "sector": "Dispositivos Médicos", "exchange": "NYSE"},
    "NSIT": {
        "name": "Insight Enterprises",
        "sector": "Soluciones IT & Cloud",
        "exchange": "NASDAQ",
    },
    "VECO": {"name": "Veeco Instruments", "sector": "Equipamiento de Chips", "exchange": "NASDAQ"},
    "OSK": {"name": "Oshkosh Corp", "sector": "Maquinaria Industrial", "exchange": "NYSE"},
    "SM": {"name": "SM Energy", "sector": "Petróleo & Gas", "exchange": "NYSE"},
    "IJH": {
        "name": "iShares Core S&P Mid-Cap ETF",
        "sector": "Benchmark S&P MidCap 400",
        "exchange": "NYSE",
    },
}


def get_ticker_meta(ticker: str) -> dict[str, str]:
    """Retorna el nombre completo, sector y bolsa para un símbolo dado."""
    t_clean = ticker.strip().upper()
    if t_clean in TICKER_METADATA:
        return {"ticker": t_clean, **TICKER_METADATA[t_clean]}
    try:
        t = get_yf_ticker(t_clean)
        info = getattr(t, "info", {}) or {}
        name = info.get("longName") or info.get("shortName") or t_clean
        sector = info.get("sector") or info.get("industry") or "Tecnología"
        exchange = info.get("exchange") or "US"
        return {"ticker": t_clean, "name": name, "sector": sector, "exchange": exchange}
    except Exception:
        return {"ticker": t_clean, "name": t_clean, "sector": "Tecnología", "exchange": "US"}


# ──────────────────────────────────────────────
# Redis Cache Integration
# ──────────────────────────────────────────────
import logging
import os
import pickle

import redis

try:
    _redis_host = os.environ.get("REDIS_HOST", "localhost")
    _redis_client = redis.Redis(
        host=_redis_host,
        port=6379,
        db=0,
        decode_responses=False,
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
    )
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


def _cache_set(key: str, data: object, ttl: int | None = None) -> None:
    if ttl is None:
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
        return cached.clone() if hasattr(cached, "clone") else cached  # type: ignore[return-value]

    yf_period = PERIOD_MAP.get(period.upper(), "1y")

    raw: pd.DataFrame = yf.download(
        all_tickers,
        period=yf_period,
        auto_adjust=True,
        progress=False,
        threads=True,
        session=_yf_session,
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
    Uses fast_info with fallback to 5d history for London (.L) and international tickers.
    Cached to avoid Yahoo Finance rate-limiting.
    """
    if not tickers:
        return []

    cache_key = f"live:{','.join(sorted(tickers))}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    results: list[dict] = []
    for ticker in tickers:
        ticker_clean = ticker.strip().upper()
        try:
            t = get_yf_ticker(ticker_clean)
            price = None
            prev = None

            # 1. Try fast_info
            try:
                fi = t.fast_info
                price = getattr(fi, "last_price", None)
                prev = getattr(fi, "previous_close", None)
            except Exception:
                pass

            # 2. Fallback to 5-day history if fast_info returns None or 0
            if not price or pd.isna(price) or price <= 0:
                hist = t.history(period="5d")
                if not hist.empty and "Close" in hist.columns:
                    closes = hist["Close"].dropna()
                    if not closes.empty:
                        price = float(closes.iloc[-1])
                        prev = float(closes.iloc[-2]) if len(closes) > 1 else price

            # Handle GBP vs GBX (Pence) conversion for London tickers (.L)
            currency = "USD"
            if ticker_clean.endswith(".L"):
                currency = "GBP"

            if price is not None and not pd.isna(price) and price > 0:
                price = float(price)
                prev = float(prev) if prev and not pd.isna(prev) else price
                change = price - prev
                change_pct = (change / prev * 100) if prev > 0 else 0.0

                meta = get_ticker_meta(ticker_clean)
                results.append(
                    {
                        "ticker": ticker_clean,
                        "name": meta.get("name") or ticker_clean,
                        "sector": meta.get("sector") or "Tecnología",
                        "exchange": meta.get("exchange") or ("LSE" if ticker_clean.endswith(".L") else "US"),
                        "currency": currency,
                        "quoteType": "EQUITY",
                        "price": round(price, 4),
                        "change": round(change, 4),
                        "change_pct": round(change_pct, 4),
                        "previous_close": round(prev, 4),
                        "market_open": _is_market_open(),
                    }
                )
            else:
                raise ValueError(f"No price data available for {ticker_clean}")

        except Exception as exc:
            meta = get_ticker_meta(ticker)
            results.append(
                {
                    "ticker": ticker,
                    "name": meta.get("name") or ticker,
                    "sector": meta.get("sector") or "Desconocido",
                    "exchange": "US",
                    "currency": "USD",
                    "quoteType": "EQUITY",
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
        df = yf.download(
            ticker,
            period="1d",
            interval="5m",
            auto_adjust=True,
            progress=False,
            session=_yf_session,
        )
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


# ──────────────────────────────────────────────
# FX / Currency Data
# ──────────────────────────────────────────────
def get_fx_data(currency_str: str) -> dict:
    """
    Fetch historical and current FX rates for an asset currency to local currency.
    Format of currency_str is 'ASSET-LOCAL' (e.g. 'USD-COP').
    Returns: { "current": 4200.5, "history": { "2024-01-01": 3900.2, ... } }
    """
    parts = currency_str.split("-")
    asset_currency = parts[0].strip().upper() if len(parts) > 0 else "USD"
    local_currency = parts[1].strip().upper() if len(parts) > 1 else "COP"

    if asset_currency == local_currency:
        return {"current": 1.0, "history": {}}

    ticker_sym = f"{asset_currency}{local_currency}=X"
    cache_key = f"fx:{ticker_sym}"

    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        # Get historical data for the last 10 years (or max)
        df = yf.download(
            ticker_sym, period="10y", auto_adjust=True, progress=False, session=_yf_session
        )
        history_dict = {}

        if not df.empty:
            # Handle MultiIndex if present
            if isinstance(df.columns, pd.MultiIndex):
                closes = df["Close"].copy()
            else:
                closes = df[["Close"]].copy()
                closes.columns = [ticker_sym]

            closes.index.name = "date"
            closes = closes.reset_index()
            closes["date"] = pd.to_datetime(closes["date"]).dt.date

            for _, row in closes.iterrows():
                val = row.iloc[1] if len(row) > 1 else None
                if pd.isna(val):
                    continue
                history_dict[str(row["date"])] = float(val)

        # Get current price
        t = get_yf_ticker(ticker_sym)
        fi = t.fast_info
        current_price = fi.last_price or 0.0

        if current_price == 0.0 and history_dict:
            # Fallback to last available day
            last_date = sorted(history_dict.keys())[-1]
            current_price = history_dict[last_date]

        result = {"current": current_price, "history": history_dict}

        # Cache for 1 hour
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logging.error(f"Error fetching FX data for {currency_str}: {e}")
        return {"current": 1.0, "history": {}}


# ──────────────────────────────────────────────
# Inflation Data
# ──────────────────────────────────────────────
import io


def get_colombia_cpi_history() -> dict:
    """
    Fetch Colombian CPI (Consumer Price Index) from FRED (Federal Reserve Economic Data).
    Series: COLCPALTT01IXOBM
    Returns a dictionary of date strings to CPI values, latest summary, and monthly rates.
    """
    cache_key = "inflation:colombia"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=COLCPALTT01IXOBM"
    try:
        if _yf_session:
            resp = _yf_session.get(url, timeout=10)
            df = pd.read_csv(io.StringIO(resp.text))
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                df = pd.read_csv(response)

        # Detect column names dynamically
        date_col = (
            "observation_date"
            if "observation_date" in df.columns
            else ("DATE" if "DATE" in df.columns else df.columns[0])
        )
        val_col = "COLCPALTT01IXOBM" if "COLCPALTT01IXOBM" in df.columns else df.columns[1]

        history_dict = {}
        for _, row in df.iterrows():
            date_str = str(row[date_col])[:10]
            try:
                val = float(row[val_col])
                history_dict[date_str] = val
            except (ValueError, TypeError):
                pass

        sorted_dates = sorted(history_dict.keys())
        monthly_rates = []
        for i, d in enumerate(sorted_dates):
            cpi = history_dict[d]
            mom = 0.0
            yoy = 0.0
            if i > 0:
                prev_cpi = history_dict[sorted_dates[i - 1]]
                mom = ((cpi - prev_cpi) / prev_cpi) * 100 if prev_cpi > 0 else 0.0
            if i >= 12:
                year_ago_cpi = history_dict[sorted_dates[i - 12]]
                yoy = ((cpi - year_ago_cpi) / year_ago_cpi) * 100 if year_ago_cpi > 0 else 0.0

            monthly_rates.append(
                {"date": d, "cpi": round(cpi, 4), "mom": round(mom, 2), "yoy": round(yoy, 2)}
            )

        latest = monthly_rates[-1] if monthly_rates else {"date": "", "cpi": 0, "mom": 0, "yoy": 0}

        result = {
            "history": history_dict,
            "latest": latest,
            "monthly_rates": list(reversed(monthly_rates)),  # newest first
        }
        _cache_set(cache_key, result, ttl=86400)
        return result
    except Exception as e:
        logging.error(f"Error fetching Colombian CPI data: {e}")
        return {
            "history": {},
            "latest": {"date": "", "cpi": 0, "mom": 0, "yoy": 0},
            "monthly_rates": [],
        }
