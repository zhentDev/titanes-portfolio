from datetime import date

import duckdb

DB_PATH = "titanes.duckdb"


def get_connection():
    return duckdb.connect(DB_PATH)


def init_db():
    with get_connection() as con:
        # Table to store rebalance events
        con.execute("""
            CREATE TABLE IF NOT EXISTS rebalances (
                rebalance_date DATE PRIMARY KEY,
                cash_added DOUBLE
            )
        """)
        # Table to store the 15 tickers for each rebalance event
        con.execute("""
            CREATE TABLE IF NOT EXISTS rebalance_tickers (
                rebalance_date DATE,
                ticker VARCHAR,
                FOREIGN KEY (rebalance_date) REFERENCES rebalances(rebalance_date)
            )
        """)

        # New tables for Individual Purchases
        con.execute("""
            CREATE TABLE IF NOT EXISTS purchase_portfolios (
                id VARCHAR PRIMARY KEY,
                name VARCHAR,
                is_plan BOOLEAN DEFAULT FALSE,
                plan_config VARCHAR,
                asset_currency VARCHAR DEFAULT 'USD',
                local_currency VARCHAR DEFAULT 'COP',
                annual_inflation_rate DOUBLE DEFAULT 0.0,
                use_auto_col_inflation BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migration: Add columns to existing DB if missing
        try:
            columns = [
                row[1] for row in con.execute("PRAGMA table_info('purchase_portfolios')").fetchall()
            ]
            if "is_plan" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios ADD COLUMN is_plan BOOLEAN DEFAULT FALSE"
                )
            if "plan_config" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN plan_config VARCHAR")
            if "base_currency" in columns and "local_currency" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios RENAME COLUMN base_currency TO local_currency"
                )
            elif "local_currency" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios ADD COLUMN local_currency VARCHAR DEFAULT 'COP'"
                )
            if "asset_currency" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios ADD COLUMN asset_currency VARCHAR DEFAULT 'USD'"
                )
            if "annual_inflation_rate" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios ADD COLUMN annual_inflation_rate DOUBLE DEFAULT 0.0"
                )
            if "use_auto_col_inflation" not in columns:
                con.execute(
                    "ALTER TABLE purchase_portfolios ADD COLUMN use_auto_col_inflation BOOLEAN DEFAULT FALSE"
                )
        except duckdb.Error as e:
            print(f"Migration error: {e}")

        con.execute("""
            CREATE TABLE IF NOT EXISTS individual_purchases (
                id VARCHAR PRIMARY KEY,
                portfolio_id VARCHAR,
                ticker VARCHAR,
                date DATE,
                purchase_price DOUBLE,
                shares DOUBLE,
                manual_current_price DOUBLE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portfolio_id) REFERENCES purchase_portfolios(id)
            )
        """)

        con.execute("""
            CREATE TABLE IF NOT EXISTS custom_strategies (
                id VARCHAR PRIMARY KEY,
                name VARCHAR,
                country VARCHAR DEFAULT '🌎',
                num_slots INTEGER DEFAULT 20,
                capital DOUBLE DEFAULT 1000.0,
                active_invested DOUBLE DEFAULT 1000.0,
                benchmark VARCHAR DEFAULT 'S&P 500',
                color VARCHAR DEFAULT '#a855f7',
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: Add strategy_id to rebalances and rebalance_tickers if missing
        try:
            rebal_cols = [row[1] for row in con.execute("PRAGMA table_info('rebalances')").fetchall()]
            if "strategy_id" not in rebal_cols:
                con.execute("ALTER TABLE rebalances ADD COLUMN strategy_id VARCHAR DEFAULT 'historical'")
        except duckdb.Error as e:
            print(f"Rebalances migration error: {e}")

        try:
            rebal_tick_cols = [row[1] for row in con.execute("PRAGMA table_info('rebalance_tickers')").fetchall()]
            if "strategy_id" not in rebal_tick_cols:
                con.execute("ALTER TABLE rebalance_tickers ADD COLUMN strategy_id VARCHAR DEFAULT 'historical'")
        except duckdb.Error as e:
            print(f"Rebalance tickers migration error: {e}")


def add_rebalance(rebalance_date: date, cash_added: float, tickers: list[str], strategy_id: str = "historical"):
    with get_connection() as con:
        # Delete old tickers and rebalance for this specific strategy_id and date
        con.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])
        con.execute("DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])
        
        # Insert rebalance event
        con.execute(
            """
            INSERT INTO rebalances (rebalance_date, cash_added, strategy_id) 
            VALUES (?, ?, ?)
            """,
            [rebalance_date, cash_added, strategy_id],
        )

        # Insert new tickers
        for ticker in tickers:
            con.execute(
                "INSERT INTO rebalance_tickers (rebalance_date, ticker, strategy_id) VALUES (?, ?, ?)",
                [rebalance_date, ticker, strategy_id],
            )


def get_all_rebalances(strategy_id: str = "historical") -> list[dict]:
    with get_connection() as con:
        results = con.execute("""
            SELECT r.rebalance_date, r.cash_added, list(t.ticker) as tickers
            FROM rebalances r
            LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
            WHERE r.strategy_id = ?
            GROUP BY r.rebalance_date, r.cash_added
            ORDER BY r.rebalance_date ASC
        """, [strategy_id]).fetchall()

        rebalances = []
        for row in results:
            clean_tickers = [t for t in (row[2] or []) if t is not None]
            d_str = row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0])
            rebalances.append({
                "date": d_str,
                "rebalance_date": d_str,
                "cash_added": row[1] or 0.0,
                "tickers": clean_tickers
            })
        return rebalances


def delete_rebalance(rebalance_date: date, strategy_id: str = "historical"):
    with get_connection() as con:
        con.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])
        con.execute("DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])


def get_custom_strategies() -> list[dict]:
    with get_connection() as con:
        rows = con.execute("""
            SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, created_at
            FROM custom_strategies
            ORDER BY created_at ASC
        """).fetchall()
        strategies = []
        for r in rows:
            strategies.append({
                "id": r[0],
                "name": r[1],
                "country": r[2] or "🌎",
                "numSlots": r[3] or 20,
                "capital": r[4] or 1000.0,
                "activeInvested": r[5] or 1000.0,
                "benchmark": r[6] or "S&P 500",
                "color": r[7] or "#a855f7",
                "isSystem": bool(r[8]),
                "createdAt": r[9].isoformat() if hasattr(r[9], 'isoformat') else str(r[9]),
            })
        return strategies


def save_custom_strategy(strat: dict):
    with get_connection() as con:
        con.execute("""
            INSERT INTO custom_strategies (id, name, country, num_slots, capital, active_invested, benchmark, color, is_system)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                country = EXCLUDED.country,
                num_slots = EXCLUDED.num_slots,
                capital = EXCLUDED.capital,
                active_invested = EXCLUDED.active_invested,
                benchmark = EXCLUDED.benchmark,
                color = EXCLUDED.color,
                is_system = EXCLUDED.is_system
        """, [
            strat["id"],
            strat.get("name", "Nueva Estrategia"),
            strat.get("country", "🌎"),
            int(strat.get("numSlots", 20)),
            float(strat.get("capital", 1000.0)),
            float(strat.get("activeInvested", 1000.0)),
            strat.get("benchmark", "S&P 500"),
            strat.get("color", "#a855f7"),
            bool(strat.get("isSystem", False))
        ])


def delete_custom_strategy(strategy_id: str):
    with get_connection() as con:
        con.execute("DELETE FROM custom_strategies WHERE id = ? AND is_system = FALSE", [strategy_id])
        con.execute("DELETE FROM rebalance_tickers WHERE strategy_id = ?", [strategy_id])
        con.execute("DELETE FROM rebalances WHERE strategy_id = ?", [strategy_id])


# Initialize the database when the module is imported
init_db()
