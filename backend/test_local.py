import polars as pl
from services.nav_engine import calculate_nav
from services.market_data import get_historical_prices
from services.db import get_all_rebalances

try:
    rebalances = get_all_rebalances()
    print("Rebalances:", rebalances)
    
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r['tickers'])
        
    ticker_list = list(all_tickers)
    print("Fetching prices for:", ticker_list)
    prices_df = get_historical_prices(ticker_list, period="1Y")
    
    print("Calculating NAV...")
    result = calculate_nav(prices_df, num_slots=15)
    print("Success! Keys:", result.keys())
except Exception as e:
    import traceback
    traceback.print_exc()
