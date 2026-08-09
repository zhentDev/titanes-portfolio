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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migration: Add columns to existing DB if missing
        try:
            columns = [row[1] for row in con.execute("PRAGMA table_info('purchase_portfolios')").fetchall()]
            if 'is_plan' not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN is_plan BOOLEAN DEFAULT FALSE")
            if 'plan_config' not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN plan_config VARCHAR")
        except duckdb.Error:
            pass
        
        
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


def add_rebalance(rebalance_date: date, cash_added: float, tickers: list[str]):
    with get_connection() as con:
        # Upsert rebalance event
        con.execute(
            """
            INSERT INTO rebalances (rebalance_date, cash_added) 
            VALUES (?, ?)
            ON CONFLICT (rebalance_date) DO UPDATE SET cash_added = EXCLUDED.cash_added
        """,
            [rebalance_date, cash_added],
        )

        # Delete old tickers for this date if overwriting
        con.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = ?", [rebalance_date])

        # Insert new tickers
        for ticker in tickers:
            con.execute(
                "INSERT INTO rebalance_tickers (rebalance_date, ticker) VALUES (?, ?)",
                [rebalance_date, ticker],
            )


def get_all_rebalances() -> list[dict]:
    with get_connection() as con:
        results = con.execute("""
            SELECT r.rebalance_date, r.cash_added, list(t.ticker) as tickers
            FROM rebalances r
            LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date
            GROUP BY r.rebalance_date, r.cash_added
            ORDER BY r.rebalance_date ASC
        """).fetchall()

        rebalances = []
        for row in results:
            rebalances.append({"date": row[0].isoformat(), "cash_added": row[1], "tickers": row[2]})
        return rebalances


def delete_rebalance(rebalance_date: date):
    with get_connection() as con:
        con.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = ?", [rebalance_date])
        con.execute("DELETE FROM rebalances WHERE rebalance_date = ?", [rebalance_date])


# Initialize the database when the module is imported
init_db()
