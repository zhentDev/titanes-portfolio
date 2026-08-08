"""
Generates pre-calculated static JSON data files for GitHub Pages hosting.
Outputs data directly into frontend/public/data/
"""

import json
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from services.db import get_all_rebalances
from services.market_data import get_historical_prices
from services.nav_engine import calculate_nav

def generate_static():
    print("[STATIC GEN] Inicializando base de datos DuckDB...")

    out_dir = backend_dir.parent / "frontend" / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    rebalances = get_all_rebalances()
    rebalances_path = out_dir / "rebalances.json"
    with open(rebalances_path, "w", encoding="utf-8") as f:
        json.dump(rebalances, f, indent=2)
    print(f"[STATIC GEN] Guardado: {rebalances_path}")

    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])
    ticker_list = list(all_tickers)

    periods = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"]
    all_period_data = {}

    for p in periods:
        print(f"[STATIC GEN] Descargando y calculando periodo {p}...")
        try:
            prices_df = get_historical_prices(ticker_list, period=p)
            data = calculate_nav(prices_df, investment=2000.0, num_slots=15)
            all_period_data[p] = data

            # Save individual period file
            p_file = out_dir / f"nav_{p}.json"
            with open(p_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"[STATIC GEN] Guardado: {p_file}")
        except Exception as e:
            print(f"[STATIC GEN] Error calculando {p}: {e}")

    # Save default 1Y as default nav.json
    default_nav = all_period_data.get("1Y") or all_period_data.get("MAX")
    if default_nav:
        with open(out_dir / "nav.json", "w", encoding="utf-8") as f:
            json.dump(default_nav, f, indent=2)
        print("[STATIC GEN] Guardado: nav.json por defecto")

    # Save all periods combined
    with open(out_dir / "nav_all.json", "w", encoding="utf-8") as f:
        json.dump(all_period_data, f, indent=2)
    print("[STATIC GEN] Guardado: nav_all.json completo")

    print("[STATIC GEN] Generación de datos estáticos completada con éxito!")

if __name__ == "__main__":
    generate_static()
