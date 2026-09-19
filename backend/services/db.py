from datetime import date
from pathlib import Path
from typing import Optional, List, Dict, Any
import duckdb

DB_PATH = str(Path(__file__).resolve().parent.parent / "titanes.duckdb")


def get_connection():
    return duckdb.connect(DB_PATH)


def init_db():
    with get_connection() as con:
        # Table to store authenticated users
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR PRIMARY KEY,
                email VARCHAR UNIQUE,
                name VARCHAR,
                password_hash VARCHAR,
                provider VARCHAR DEFAULT 'local',
                provider_id VARCHAR,
                avatar_url VARCHAR,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Table to store rebalance events
        con.execute("""
            CREATE TABLE IF NOT EXISTS rebalances (
                rebalance_date DATE,
                cash_added DOUBLE,
                strategy_id VARCHAR DEFAULT 'historical',
                user_id VARCHAR,
                PRIMARY KEY (rebalance_date, strategy_id)
            )
        """)
        # Table to store tickers for each rebalance event
        con.execute("""
            CREATE TABLE IF NOT EXISTS rebalance_tickers (
                rebalance_date DATE,
                ticker VARCHAR,
                strategy_id VARCHAR DEFAULT 'historical',
                user_id VARCHAR
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
                user_id VARCHAR,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: Add columns to purchase_portfolios if missing
        try:
            columns = [
                row[1] for row in con.execute("PRAGMA table_info('purchase_portfolios')").fetchall()
            ]
            if "is_plan" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN is_plan BOOLEAN DEFAULT FALSE")
            if "plan_config" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN plan_config VARCHAR")
            if "base_currency" in columns and "local_currency" not in columns:
                con.execute("ALTER TABLE purchase_portfolios RENAME COLUMN base_currency TO local_currency")
            elif "local_currency" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN local_currency VARCHAR DEFAULT 'COP'")
            if "asset_currency" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN asset_currency VARCHAR DEFAULT 'USD'")
            if "annual_inflation_rate" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN annual_inflation_rate DOUBLE DEFAULT 0.0")
            if "use_auto_col_inflation" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN use_auto_col_inflation BOOLEAN DEFAULT FALSE")
            if "user_id" not in columns:
                con.execute("ALTER TABLE purchase_portfolios ADD COLUMN user_id VARCHAR")
        except duckdb.Error as e:
            print(f"Migration error (purchase_portfolios): {e}")

        con.execute("""
            CREATE TABLE IF NOT EXISTS individual_purchases (
                id VARCHAR PRIMARY KEY,
                portfolio_id VARCHAR,
                ticker VARCHAR,
                date DATE,
                purchase_price DOUBLE,
                shares DOUBLE,
                manual_current_price DOUBLE,
                purchase_time VARCHAR,
                user_id VARCHAR,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portfolio_id) REFERENCES purchase_portfolios(id)
            )
        """)

        # Migration: Add purchase_time and user_id to individual_purchases if missing
        try:
            ip_cols = [row[1] for row in con.execute("PRAGMA table_info('individual_purchases')").fetchall()]
            if "purchase_time" not in ip_cols:
                con.execute("ALTER TABLE individual_purchases ADD COLUMN purchase_time VARCHAR")
            if "user_id" not in ip_cols:
                con.execute("ALTER TABLE individual_purchases ADD COLUMN user_id VARCHAR")
        except duckdb.Error as e:
            print(f"Individual purchases migration error: {e}")

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
                is_real_money BOOLEAN DEFAULT FALSE,
                user_id VARCHAR,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: Add is_real_money and user_id to custom_strategies if missing
        try:
            strat_cols = [row[1] for row in con.execute("PRAGMA table_info('custom_strategies')").fetchall()]
            if "is_real_money" not in strat_cols:
                con.execute("ALTER TABLE custom_strategies ADD COLUMN is_real_money BOOLEAN DEFAULT FALSE")
            if "user_id" not in strat_cols:
                con.execute("ALTER TABLE custom_strategies ADD COLUMN user_id VARCHAR")
        except duckdb.Error as e:
            print(f"Custom strategies migration error: {e}")

        # Migration: Add user_id and strategy_id to rebalances and rebalance_tickers if missing
        try:
            rebal_cols = [row[1] for row in con.execute("PRAGMA table_info('rebalances')").fetchall()]
            if "strategy_id" not in rebal_cols:
                con.execute("ALTER TABLE rebalances ADD COLUMN strategy_id VARCHAR DEFAULT 'historical'")
            if "user_id" not in rebal_cols:
                con.execute("ALTER TABLE rebalances ADD COLUMN user_id VARCHAR")
        except duckdb.Error as e:
            print(f"Rebalances migration error: {e}")

        try:
            rebal_tick_cols = [row[1] for row in con.execute("PRAGMA table_info('rebalance_tickers')").fetchall()]
            if "strategy_id" not in rebal_tick_cols:
                con.execute("ALTER TABLE rebalance_tickers ADD COLUMN strategy_id VARCHAR DEFAULT 'historical'")
            if "user_id" not in rebal_tick_cols:
                con.execute("ALTER TABLE rebalance_tickers ADD COLUMN user_id VARCHAR")
        except duckdb.Error as e:
            print(f"Rebalance tickers migration error: {e}")


# ── User Operations ───────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    with get_connection() as con:
        row = con.execute(
            """
            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at
            FROM users
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            """,
            [email],
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "email": row[1],
            "name": row[2],
            "password_hash": row[3],
            "provider": row[4],
            "provider_id": row[5],
            "avatar_url": row[6],
            "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
        }


def get_user_by_id(user_id: str) -> Optional[dict]:
    with get_connection() as con:
        row = con.execute(
            """
            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at
            FROM users
            WHERE id = ?
            """,
            [user_id],
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "email": row[1],
            "name": row[2],
            "password_hash": row[3],
            "provider": row[4],
            "provider_id": row[5],
            "avatar_url": row[6],
            "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
        }


def create_user(user_data: dict) -> dict:
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                user_data["id"],
                user_data["email"].lower().strip(),
                user_data.get("name") or user_data["email"].split("@")[0],
                user_data.get("password_hash"),
                user_data.get("provider", "local"),
                user_data.get("provider_id"),
                user_data.get("avatar_url"),
            ],
        )
    return get_user_by_id(user_data["id"])


def count_users() -> int:
    with get_connection() as con:
        row = con.execute("SELECT COUNT(*) FROM users").fetchone()
        return row[0] if row else 0


def claim_legacy_data(user_id: str):
    """
    Assigns all legacy data (where user_id IS NULL) to the designated user_id.
    Guarantees absolute zero data loss for existing investments.
    """
    with get_connection() as con:
        con.execute("UPDATE purchase_portfolios SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE individual_purchases SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE custom_strategies SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE rebalances SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE rebalance_tickers SET user_id = ? WHERE user_id IS NULL", [user_id])


# ── Rebalances ────────────────────────────────────────────────────────────────

def add_rebalance(
    rebalance_date: date,
    cash_added: float,
    tickers: list[str],
    strategy_id: str = "historical",
    user_id: Optional[str] = None,
):
    with get_connection() as con:
        if user_id:
            con.execute(
                "DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [rebalance_date, strategy_id, user_id],
            )
            con.execute(
                "DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [rebalance_date, strategy_id, user_id],
            )
        else:
            con.execute(
                "DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ?",
                [rebalance_date, strategy_id],
            )
            con.execute(
                "DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ?",
                [rebalance_date, strategy_id],
            )

        con.execute(
            """
            INSERT INTO rebalances (rebalance_date, cash_added, strategy_id, user_id) 
            VALUES (?, ?, ?, ?)
            """,
            [rebalance_date, cash_added, strategy_id, user_id],
        )

        for ticker in tickers:
            con.execute(
                "INSERT INTO rebalance_tickers (rebalance_date, ticker, strategy_id, user_id) VALUES (?, ?, ?, ?)",
                [rebalance_date, ticker, strategy_id, user_id],
            )


def get_all_rebalances(strategy_id: str = "historical", user_id: Optional[str] = None) -> list[dict]:
    with get_connection() as con:
        if user_id:
            results = con.execute("""
                SELECT r.rebalance_date, r.cash_added, list(t.ticker) as tickers
                FROM rebalances r
                LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
                WHERE r.strategy_id = ? AND (r.user_id = ? OR r.user_id IS NULL)
                GROUP BY r.rebalance_date, r.cash_added
                ORDER BY r.rebalance_date ASC
            """, [strategy_id, user_id]).fetchall()
        else:
            # Unauthenticated: only return system/global baseline rebalances (where user_id IS NULL)
            results = con.execute("""
                SELECT r.rebalance_date, r.cash_added, list(t.ticker) as tickers
                FROM rebalances r
                LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
                WHERE r.strategy_id = ? AND r.user_id IS NULL
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


def delete_rebalance(rebalance_date: date, strategy_id: str = "historical", user_id: Optional[str] = None):
    with get_connection() as con:
        if user_id:
            con.execute(
                "DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [rebalance_date, strategy_id, user_id],
            )
            con.execute(
                "DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [rebalance_date, strategy_id, user_id],
            )
        else:
            con.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])
            con.execute("DELETE FROM rebalances WHERE rebalance_date = ? AND strategy_id = ?", [rebalance_date, strategy_id])


def update_rebalance_date(old_date: date, new_date: date, strategy_id: str = "historical", user_id: Optional[str] = None):
    with get_connection() as con:
        if old_date == new_date:
            return
        delete_rebalance(new_date, strategy_id, user_id)
        if user_id:
            con.execute(
                "UPDATE rebalance_tickers SET rebalance_date = ? WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [new_date, old_date, strategy_id, user_id],
            )
            con.execute(
                "UPDATE rebalances SET rebalance_date = ? WHERE rebalance_date = ? AND strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [new_date, old_date, strategy_id, user_id],
            )
        else:
            con.execute(
                "UPDATE rebalance_tickers SET rebalance_date = ? WHERE rebalance_date = ? AND strategy_id = ?",
                [new_date, old_date, strategy_id],
            )
            con.execute(
                "UPDATE rebalances SET rebalance_date = ? WHERE rebalance_date = ? AND strategy_id = ?",
                [new_date, old_date, strategy_id],
            )


# ── Custom Strategies ─────────────────────────────────────────────────────────

def get_custom_strategies(user_id: Optional[str] = None) -> list[dict]:
    with get_connection() as con:
        if user_id:
            rows = con.execute("""
                SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
                FROM custom_strategies
                WHERE user_id = ? OR (user_id IS NULL AND is_system = TRUE)
                ORDER BY created_at ASC
            """, [user_id]).fetchall()
        else:
            # Unauthenticated: only return system/template strategies, NEVER private user strategies
            rows = con.execute("""
                SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
                FROM custom_strategies
                WHERE is_system = TRUE
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
                "isRealMoney": bool(r[9]),
                "createdAt": r[10].isoformat() if hasattr(r[10], 'isoformat') else str(r[10]),
            })
        return strategies


def save_custom_strategy(strat: dict, user_id: Optional[str] = None):
    with get_connection() as con:
        con.execute("""
            INSERT INTO custom_strategies (id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                country = EXCLUDED.country,
                num_slots = EXCLUDED.num_slots,
                capital = EXCLUDED.capital,
                active_invested = EXCLUDED.active_invested,
                benchmark = EXCLUDED.benchmark,
                color = EXCLUDED.color,
                is_system = EXCLUDED.is_system,
                is_real_money = EXCLUDED.is_real_money,
                user_id = COALESCE(EXCLUDED.user_id, custom_strategies.user_id)
        """, [
            strat["id"],
            strat.get("name", "Nueva Estrategia"),
            strat.get("country", "🌎"),
            int(strat.get("numSlots", 20)),
            float(strat.get("capital", 1000.0)),
            float(strat.get("activeInvested", 1000.0)),
            strat.get("benchmark", "S&P 500"),
            strat.get("color", "#a855f7"),
            bool(strat.get("isSystem", False)),
            bool(strat.get("isRealMoney", strat.get("is_real_money", False))),
            user_id,
        ])


def delete_custom_strategy(strategy_id: str, user_id: Optional[str] = None):
    with get_connection() as con:
        if user_id:
            con.execute(
                "DELETE FROM custom_strategies WHERE id = ? AND is_system = FALSE AND (user_id = ? OR user_id IS NULL)",
                [strategy_id, user_id],
            )
            con.execute(
                "DELETE FROM rebalance_tickers WHERE strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [strategy_id, user_id],
            )
            con.execute(
                "DELETE FROM rebalances WHERE strategy_id = ? AND (user_id = ? OR user_id IS NULL)",
                [strategy_id, user_id],
            )
        else:
            con.execute("DELETE FROM custom_strategies WHERE id = ? AND is_system = FALSE", [strategy_id])
            con.execute("DELETE FROM rebalance_tickers WHERE strategy_id = ?", [strategy_id])
            con.execute("DELETE FROM rebalances WHERE strategy_id = ?", [strategy_id])


# Initialize database schema and run migrations
init_db()
