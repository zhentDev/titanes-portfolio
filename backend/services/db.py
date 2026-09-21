from datetime import date
import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, List, Dict, Any
import duckdb

DB_PATH = str(Path(__file__).resolve().parent.parent / "titanes.duckdb")
USERS_BACKUP_PATH = Path(__file__).resolve().parent.parent / "data" / "users_backup.json"
DATABASE_URL = os.getenv("DATABASE_URL")

_pg_pool = None
_pg_pool_failed = False


def get_pg_connection():
    global _pg_pool, _pg_pool_failed
    if not DATABASE_URL or _pg_pool_failed:
        return None
    if _pg_pool is None:
        try:
            from psycopg2.pool import ThreadedConnectionPool
            clean_url = DATABASE_URL.strip()
            if clean_url.startswith("postgres://"):
                clean_url = clean_url.replace("postgres://", "postgresql://", 1)
            _pg_pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=clean_url, connect_timeout=5)
            print("[POSTGRES] Connected to PostgreSQL pool successfully.")
        except Exception as e:
            print(f"[POSTGRES] Error initializing PostgreSQL pool: {e}")
            _pg_pool = None
            _pg_pool_failed = True
            return None
    try:
        return _pg_pool.getconn()
    except Exception as e:
        print(f"[POSTGRES] Error getting connection from pool: {e}")
        return None


def release_pg_connection(conn):
    global _pg_pool
    if _pg_pool and conn:
        try:
            _pg_pool.putconn(conn)
        except Exception:
            pass


@contextmanager
def pg_session():
    conn = get_pg_connection()
    if not conn:
        yield None
        return
    try:
        yield conn
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
    finally:
        release_pg_connection(conn)


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

        # Seed built-in simulated model strategy 'strat_mm20' (MM20 Mid-caps PRO)
        try:
            con.execute("""
                INSERT INTO custom_strategies (id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, user_id)
                VALUES ('strat_mm20', 'MM20 Mid-caps PRO', '🇺🇸', 20, 1000.0, 250.0, 'S&P MidCap 400', '#10b981', TRUE, FALSE, 'usr_9487dd2209d2')
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    benchmark = EXCLUDED.benchmark,
                    is_system = TRUE,
                    is_real_money = FALSE,
                    user_id = 'usr_9487dd2209d2'
            """)
            con.execute("""
                INSERT INTO rebalances (rebalance_date, cash_added, strategy_id, user_id)
                VALUES ('2026-08-01', 0.0, 'strat_mm20', 'usr_9487dd2209d2')
                ON CONFLICT (rebalance_date, strategy_id) DO NOTHING
            """)
            con.execute("DELETE FROM rebalance_tickers WHERE strategy_id = 'strat_mm20'")
            mm20_tickers = ['ARLP', 'ACLS', 'BHC', 'DIOD', 'HAE', 'NSIT', 'POWI', 'VECO', 'OSK', 'SM']
            for t in mm20_tickers:
                con.execute("""
                    INSERT INTO rebalance_tickers (rebalance_date, ticker, strategy_id, user_id)
                    VALUES ('2026-08-01', ?, 'strat_mm20', 'usr_9487dd2209d2')
                """, [t])
        except duckdb.Error as e:
            print(f"Seed strat_mm20 error: {e}")

        # Migration: Clean orphan rebalances whose strategy_id has no entry in custom_strategies
        # (excluding built-in 'historical' and 'strat_mm20' which are always valid)
        try:
            orphan_ids = con.execute("""
                SELECT DISTINCT r.strategy_id FROM rebalances r
                WHERE r.strategy_id NOT IN ('historical', 'strat_mm20')
                  AND r.strategy_id NOT IN (SELECT id FROM custom_strategies)
            """).fetchall()
            for (oid,) in orphan_ids:
                con.execute("DELETE FROM rebalance_tickers WHERE strategy_id = ?", [oid])
                con.execute("DELETE FROM rebalances WHERE strategy_id = ?", [oid])
                print(f"[MIGRATION] Cleaned orphan rebalances for strategy_id={oid}")
        except duckdb.Error as e:
            print(f"Orphan rebalances cleanup error: {e}")

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

        # Migration: Add is_pro column to users if missing
        try:
            user_cols = [row[1] for row in con.execute("PRAGMA table_info('users')").fetchall()]
            if "is_pro" not in user_cols:
                con.execute("ALTER TABLE users ADD COLUMN is_pro BOOLEAN DEFAULT FALSE")
        except duckdb.Error as e:
            print(f"Users is_pro migration error: {e}")

        # Auto-Restore users from persistent JSON backup (to prevent Docker rebuild wipes)
        _restore_users_from_backup(con)

        # PostgreSQL initialization and auto-migration
        if DATABASE_URL:
            try:
                with pg_session() as pg_conn:
                    if pg_conn:
                        with pg_conn.cursor() as cur:
                            cur.execute("""
                                CREATE TABLE IF NOT EXISTS users (
                                    id VARCHAR(64) PRIMARY KEY,
                                    email VARCHAR(255) UNIQUE NOT NULL,
                                    name VARCHAR(255),
                                    password_hash TEXT,
                                    provider VARCHAR(64) DEFAULT 'local',
                                    provider_id VARCHAR(255),
                                    avatar_url TEXT,
                                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                    is_pro BOOLEAN DEFAULT FALSE
                                );
                            """)
                        print("[POSTGRES] Initialized users table in PostgreSQL.")
                        _migrate_users_to_postgres_if_empty(pg_conn)
            except Exception as e:
                print(f"[POSTGRES] init_db error: {e}")

            # Auto-sync PostgreSQL users into local DuckDB so local joins continue working
            _sync_postgres_users_to_duckdb(con)


# ── Persistent User Backup & Fusion ──────────────────────────────────────────

def _backup_users_to_disk(con=None):
    """Back up all registered users to a persistent JSON file."""
    try:
        def _dump(c):
            rows = c.execute("""
                SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                FROM users
            """).fetchall()
            users_list = []
            for r in rows:
                users_list.append({
                    "id": r[0],
                    "email": r[1],
                    "name": r[2],
                    "password_hash": r[3],
                    "provider": r[4],
                    "provider_id": r[5],
                    "avatar_url": r[6],
                    "created_at": r[7].isoformat() if hasattr(r[7], "isoformat") else str(r[7]),
                    "is_pro": bool(r[8]),
                })
            USERS_BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(USERS_BACKUP_PATH, "w", encoding="utf-8") as f:
                json.dump(users_list, f, indent=2)

        if con:
            _dump(con)
        else:
            with get_connection() as c:
                _dump(c)
    except Exception as e:
        print(f"[BACKUP] Error backing up users: {e}")


def _restore_users_from_backup(con):
    """Restore users from JSON backup on container start (ON CONFLICT DO NOTHING)."""
    if not USERS_BACKUP_PATH.exists():
        return
    try:
        with open(USERS_BACKUP_PATH, "r", encoding="utf-8") as f:
            users_list = json.load(f)
        for u in users_list:
            con.execute("""
                INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (email) DO UPDATE SET
                    name = COALESCE(EXCLUDED.name, users.name),
                    password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
                    is_pro = COALESCE(EXCLUDED.is_pro, users.is_pro)
            """, [
                u["id"],
                u["email"].lower().strip(),
                u.get("name"),
                u.get("password_hash"),
                u.get("provider", "local"),
                u.get("provider_id"),
                u.get("avatar_url"),
                u.get("created_at"),
                bool(u.get("is_pro", False)),
            ])
        print(f"[RESTORE] Synchronized {len(users_list)} user(s) from persistent backup.")
    except Exception as e:
        print(f"[RESTORE] Error restoring users from backup: {e}")


def _migrate_users_to_postgres_if_empty(conn):
    """If PostgreSQL users table is empty, auto-seed with users from backup or DuckDB."""
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            count = cur.fetchone()[0]
            if count > 0:
                return

            print("[POSTGRES] users table is empty. Migrating users from backup/DuckDB...")
            users_to_insert = []
            if USERS_BACKUP_PATH.exists():
                try:
                    with open(USERS_BACKUP_PATH, "r", encoding="utf-8") as f:
                        users_to_insert = json.load(f)
                except Exception as e:
                    print(f"[POSTGRES] Error loading users_backup.json: {e}")

            if not users_to_insert:
                try:
                    with get_connection() as duck_con:
                        rows = duck_con.execute("""
                            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                            FROM users
                        """).fetchall()
                        for r in rows:
                            users_to_insert.append({
                                "id": r[0],
                                "email": r[1],
                                "name": r[2],
                                "password_hash": r[3],
                                "provider": r[4],
                                "provider_id": r[5],
                                "avatar_url": r[6],
                                "created_at": r[7].isoformat() if hasattr(r[7], "isoformat") else str(r[7]),
                                "is_pro": bool(r[8]),
                            })
                except Exception as e:
                    print(f"[POSTGRES] Error reading users from DuckDB: {e}")

            for u in users_to_insert:
                cur.execute("""
                    INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO NOTHING
                """, [
                    u["id"],
                    u["email"].lower().strip(),
                    u.get("name"),
                    u.get("password_hash"),
                    u.get("provider", "local"),
                    u.get("provider_id"),
                    u.get("avatar_url"),
                    u.get("created_at"),
                    bool(u.get("is_pro", False)),
                ])
            print(f"[POSTGRES] Migrated {len(users_to_insert)} user(s) to PostgreSQL.")
    except Exception as e:
        print(f"[POSTGRES] Migration error: {e}")


def _sync_postgres_users_to_duckdb(duck_con):
    """Sync all users from PostgreSQL into DuckDB so local joins work."""
    if not DATABASE_URL:
        return
    try:
        with pg_session() as conn:
            if not conn:
                return
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                    FROM users
                """)
                pg_users = cur.fetchall()
            for r in pg_users:
                duck_con.execute("""
                    INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (email) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, users.name),
                        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
                        is_pro = COALESCE(EXCLUDED.is_pro, users.is_pro)
                """, [
                    r[0],
                    r[1].lower().strip() if r[1] else "",
                    r[2],
                    r[3],
                    r[4] or "local",
                    r[5],
                    r[6],
                    r[7],
                    bool(r[8]),
                ])
            print(f"[POSTGRES->DUCKDB] Synchronized {len(pg_users)} user(s) from PostgreSQL to DuckDB.")
    except Exception as e:
        print(f"[POSTGRES->DUCKDB] Sync error: {e}")


# ── User Operations ───────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    clean_email = email.lower().strip()
    if DATABASE_URL:
        try:
            with pg_session() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                            FROM users
                            WHERE LOWER(TRIM(email)) = %s
                        """, [clean_email])
                        row = cur.fetchone()
                        if row:
                            is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
                            return {
                                "id": row[0],
                                "email": row[1],
                                "name": row[2],
                                "password_hash": row[3],
                                "provider": row[4],
                                "provider_id": row[5],
                                "avatar_url": row[6],
                                "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
                                "is_pro": bool(row[8] or is_owner),
                            }
        except Exception as e:
            print(f"[POSTGRES] get_user_by_email error: {e}")

    # Fallback to DuckDB
    with get_connection() as con:
        row = con.execute(
            """
            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
            FROM users
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            """,
            [clean_email],
        ).fetchone()
        if not row:
            return None
        is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
        return {
            "id": row[0],
            "email": row[1],
            "name": row[2],
            "password_hash": row[3],
            "provider": row[4],
            "provider_id": row[5],
            "avatar_url": row[6],
            "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
            "is_pro": bool(row[8] or is_owner),
        }


def get_user_by_id(user_id: str) -> Optional[dict]:
    if DATABASE_URL:
        try:
            with pg_session() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                            FROM users
                            WHERE id = %s
                        """, [user_id])
                        row = cur.fetchone()
                        if row:
                            is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
                            return {
                                "id": row[0],
                                "email": row[1],
                                "name": row[2],
                                "password_hash": row[3],
                                "provider": row[4],
                                "provider_id": row[5],
                                "avatar_url": row[6],
                                "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
                                "is_pro": bool(row[8] or is_owner),
                            }
        except Exception as e:
            print(f"[POSTGRES] get_user_by_id error: {e}")

    # Fallback to DuckDB
    with get_connection() as con:
        row = con.execute(
            """
            SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
            FROM users
            WHERE id = ?
            """,
            [user_id],
        ).fetchone()
        if not row:
            return None
        is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
        return {
            "id": row[0],
            "email": row[1],
            "name": row[2],
            "password_hash": row[3],
            "provider": row[4],
            "provider_id": row[5],
            "avatar_url": row[6],
            "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
            "is_pro": bool(row[8] or is_owner),
        }


def create_user(user_data: dict) -> dict:
    email = user_data["email"].lower().strip()
    name = user_data.get("name") or email.split("@")[0]
    pwd_hash = user_data.get("password_hash")
    provider = user_data.get("provider", "local")
    provider_id = user_data.get("provider_id")
    avatar_url = user_data.get("avatar_url")
    is_pro = bool(user_data.get("is_pro", False))

    if DATABASE_URL:
        try:
            with pg_session() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url, is_pro)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (email) DO UPDATE SET
                                name = EXCLUDED.name,
                                password_hash = EXCLUDED.password_hash,
                                is_pro = EXCLUDED.is_pro
                        """, [
                            user_data["id"],
                            email,
                            name,
                            pwd_hash,
                            provider,
                            provider_id,
                            avatar_url,
                            is_pro,
                        ])
                    print(f"[POSTGRES] Saved user {email} in PostgreSQL.")
        except Exception as e:
            print(f"[POSTGRES] create_user error: {e}")

    # Mirror to DuckDB and local JSON backup
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                password_hash = EXCLUDED.password_hash
            """,
            [
                user_data["id"],
                email,
                name,
                pwd_hash,
                provider,
                provider_id,
                avatar_url,
            ],
        )
        _backup_users_to_disk(con)
    return get_user_by_id(user_data["id"])


def count_users() -> int:
    if DATABASE_URL:
        try:
            with pg_session() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT COUNT(*) FROM users")
                        row = cur.fetchone()
                        if row:
                            return row[0]
        except Exception as e:
            print(f"[POSTGRES] count_users error: {e}")

    with get_connection() as con:
        row = con.execute("SELECT COUNT(*) FROM users").fetchone()
        return row[0] if row else 0


def claim_legacy_data(user_id: str):
    """
    Assigns all legacy data (where user_id IS NULL) to the designated user_id.
    Guarantees absolute zero data loss for existing investments, while keeping
    system baseline strategies ('historical', 'strat_mm20') global.
    """
    with get_connection() as con:
        con.execute("UPDATE purchase_portfolios SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE individual_purchases SET user_id = ? WHERE user_id IS NULL", [user_id])
        con.execute("UPDATE custom_strategies SET user_id = ? WHERE user_id IS NULL AND is_system = FALSE", [user_id])
        con.execute(
            "UPDATE rebalances SET user_id = ? WHERE user_id IS NULL AND strategy_id NOT IN ('historical', 'strat_mm20')",
            [user_id],
        )
        con.execute(
            "UPDATE rebalance_tickers SET user_id = ? WHERE user_id IS NULL AND strategy_id NOT IN ('historical', 'strat_mm20')",
            [user_id],
        )


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
    # Proprietary quant strategies ('historical', 'strat_mm20', etc.) and custom strategies
    # are restricted to PRO subscribers and the platform owner.
    # Non-authenticated or free users do not receive proprietary backtest/rebalance data.
    if not user_id:
        return []

    # Check if user is PRO / owner
    user = get_user_by_id(user_id)
    if not user or not user.get("is_pro"):
        return []

    with get_connection() as con:
        results = con.execute("""
            SELECT r.rebalance_date, r.cash_added, list(t.ticker) as tickers
            FROM rebalances r
            LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
            WHERE r.strategy_id = ? AND (r.user_id = ? OR r.user_id IS NULL)
            GROUP BY r.rebalance_date, r.cash_added
            ORDER BY r.rebalance_date ASC
        """, [strategy_id, user_id]).fetchall()

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
    if not user_id:
        return []

    # Custom algorithmic strategies are locked for PRO members and owner
    user = get_user_by_id(user_id)
    if not user or not user.get("is_pro"):
        return []

    with get_connection() as con:
        rows = con.execute("""
            SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
            FROM custom_strategies
            WHERE user_id = ?
            ORDER BY created_at ASC
        """, [user_id]).fetchall()

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
