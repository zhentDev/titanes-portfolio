"""Fixed Income, Savings Accounts, and CDTs REST API Router.

Manages multi-currency banking entities, high-yield savings accounts,
term deposits (CDTs with ReteFuente tax deductions), crypto staking/USD yields,
and quantitative compound interest projections.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "fixed_income.json"

DEFAULT_FIXED_INCOME_DATA = {
    "entities": [
        {
            "id": "ent_nu",
            "name": "Nu Colombia",
            "country": "🇨🇴",
            "color": "#820ad1",
            "icon": "💜",
            "createdAt": "2025-01-01T00:00:00Z"
        },
        {
            "id": "ent_lulo",
            "name": "Lulo Bank",
            "country": "🇨🇴",
            "color": "#00e5ff",
            "icon": "⚡",
            "createdAt": "2025-01-01T00:00:00Z"
        },
        {
            "id": "ent_pibank",
            "name": "Pibank",
            "country": "🇨🇴",
            "color": "#f59e0b",
            "icon": "🏦",
            "createdAt": "2025-01-01T00:00:00Z"
        },
        {
            "id": "ent_ibkr",
            "name": "Interactive Brokers",
            "country": "🇺🇸",
            "color": "#e11d48",
            "icon": "💵",
            "createdAt": "2025-01-01T00:00:00Z"
        }
    ],
    "accounts": [
        {
            "id": "acc_nu_cajita",
            "entityId": "ent_nu",
            "name": "Cajita de Ahorro Nu",
            "type": "pocket",
            "currency": "COP",
            "balance": 5000000.0,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "rateHistory": [
                {"date": "2024-10-01", "rateEA": 13.0},
                {"date": "2025-01-15", "rateEA": 12.0}
            ],
            "createdAt": "2025-01-01T00:00:00Z"
        },
        {
            "id": "acc_lulo_pocket",
            "entityId": "ent_lulo",
            "name": "Bolsillo Lulo",
            "type": "pocket",
            "currency": "COP",
            "balance": 2500000.0,
            "interestRateEA": 13.0,
            "isTaxExemptGMF": True,
            "rateHistory": [
                {"date": "2024-11-01", "rateEA": 13.0}
            ],
            "createdAt": "2025-01-01T00:00:00Z"
        },
        {
            "id": "acc_ibkr_cash",
            "entityId": "ent_ibkr",
            "name": "USD Cash Yield",
            "type": "wallet",
            "currency": "USD",
            "balance": 1500.0,
            "interestRateEA": 4.83,
            "isTaxExemptGMF": False,
            "rateHistory": [
                {"date": "2025-01-01", "rateEA": 4.83}
            ],
            "createdAt": "2025-01-01T00:00:00Z"
        }
    ],
    "cdts": [
        {
            "id": "cdt_pibank_180",
            "entityId": "ent_pibank",
            "name": "CDT Digital 180 Días",
            "capital": 10000000.0,
            "currency": "COP",
            "interestRateEA": 11.5,
            "termDays": 180,
            "startDate": "2025-01-15",
            "maturityDate": "2025-07-14",
            "reteFuentePct": 4.0,
            "isAutoRenew": False,
            "createdAt": "2025-01-15T00:00:00Z"
        }
    ],
    "transactions": []
}


def load_fixed_income_db() -> Dict[str, Any]:
    """Load JSON database with failover to default initial state."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        save_fixed_income_db(DEFAULT_FIXED_INCOME_DATA)
        return DEFAULT_FIXED_INCOME_DATA
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_FIXED_INCOME_DATA


def save_fixed_income_db(data: Dict[str, Any]) -> None:
    """Save data safely to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# --- Pydantic Data Models ---

class EntityModel(BaseModel):
    id: Optional[str] = None
    name: str
    country: str = "🇨🇴"
    color: str = "#10b981"
    icon: str = "🏦"
    createdAt: Optional[str] = None


class AccountModel(BaseModel):
    id: Optional[str] = None
    entityId: str
    name: str
    type: str = "savings"  # 'savings' | 'pocket' | 'wallet' | 'crypto'
    currency: str = "COP"  # 'COP' | 'USD' | 'EUR' | 'USDC'
    balance: float = 0.0
    interestRateEA: float = 0.0
    isTaxExemptGMF: bool = True
    rateHistory: Optional[List[Dict[str, Any]]] = []
    createdAt: Optional[str] = None


class CDTModel(BaseModel):
    id: Optional[str] = None
    entityId: str
    name: str
    capital: float
    currency: str = "COP"
    interestRateEA: float
    termDays: int
    startDate: str
    maturityDate: str
    reteFuentePct: float = 4.0
    isAutoRenew: bool = False
    createdAt: Optional[str] = None


class TransactionModel(BaseModel):
    id: Optional[str] = None
    accountId: str
    type: str = "deposit"  # 'deposit' | 'withdrawal' | 'interest_adjustment'
    amount: float
    date: str
    note: Optional[str] = ""


class SyncStateModel(BaseModel):
    entities: Optional[List[Dict[str, Any]]] = None
    accounts: Optional[List[Dict[str, Any]]] = None
    cdts: Optional[List[Dict[str, Any]]] = None
    transactions: Optional[List[Dict[str, Any]]] = None


# --- Endpoints ---

@router.get("/data")
def get_all_fixed_income_data():
    """Retrieve full fixed income state."""
    return load_fixed_income_db()


@router.post("/entities")
def create_entity(entity: EntityModel):
    db = load_fixed_income_db()
    new_id = entity.id or f"ent_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "name": entity.name,
        "country": entity.country,
        "color": entity.color,
        "icon": entity.icon,
        "createdAt": entity.createdAt or datetime.now().isoformat()
    }
    db["entities"].append(item)
    save_fixed_income_db(db)
    return item


@router.put("/entities/{entity_id}")
def update_entity(entity_id: str, entity: EntityModel):
    db = load_fixed_income_db()
    for idx, e in enumerate(db["entities"]):
        if e["id"] == entity_id:
            db["entities"][idx] = {
                **e,
                "name": entity.name,
                "country": entity.country,
                "color": entity.color,
                "icon": entity.icon
            }
            save_fixed_income_db(db)
            return db["entities"][idx]
    raise HTTPException(status_code=404, detail="Entity not found")


@router.delete("/entities/{entity_id}")
def delete_entity(entity_id: str):
    db = load_fixed_income_db()
    db["entities"] = [e for e in db["entities"] if e["id"] != entity_id]
    db["accounts"] = [a for a in db["accounts"] if a["entityId"] != entity_id]
    db["cdts"] = [c for c in db["cdts"] if c["entityId"] != entity_id]
    save_fixed_income_db(db)
    return {"success": True, "deleted": entity_id}


@router.post("/accounts")
def create_account(account: AccountModel):
    db = load_fixed_income_db()
    new_id = account.id or f"acc_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "entityId": account.entityId,
        "name": account.name,
        "type": account.type,
        "currency": account.currency,
        "balance": float(account.balance),
        "interestRateEA": float(account.interestRateEA),
        "isTaxExemptGMF": account.isTaxExemptGMF,
        "rateHistory": account.rateHistory or [{"date": datetime.now().strftime("%Y-%m-%d"), "rateEA": float(account.interestRateEA)}],
        "createdAt": account.createdAt or datetime.now().isoformat()
    }
    db["accounts"].append(item)
    save_fixed_income_db(db)
    return item


@router.put("/accounts/{account_id}")
def update_account(account_id: str, account: AccountModel):
    db = load_fixed_income_db()
    for idx, a in enumerate(db["accounts"]):
        if a["id"] == account_id:
            db["accounts"][idx] = {
                **a,
                "name": account.name,
                "type": account.type,
                "currency": account.currency,
                "balance": float(account.balance),
                "interestRateEA": float(account.interestRateEA),
                "isTaxExemptGMF": account.isTaxExemptGMF,
                "rateHistory": account.rateHistory or a.get("rateHistory", [])
            }
            save_fixed_income_db(db)
            return db["accounts"][idx]
    raise HTTPException(status_code=404, detail="Account not found")


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str):
    db = load_fixed_income_db()
    db["accounts"] = [a for a in db["accounts"] if a["id"] != account_id]
    db["transactions"] = [t for t in db["transactions"] if t.get("accountId") != account_id]
    save_fixed_income_db(db)
    return {"success": True, "deleted": account_id}


@router.post("/cdts")
def create_cdt(cdt: CDTModel):
    db = load_fixed_income_db()
    new_id = cdt.id or f"cdt_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "entityId": cdt.entityId,
        "name": cdt.name,
        "capital": float(cdt.capital),
        "currency": cdt.currency,
        "interestRateEA": float(cdt.interestRateEA),
        "termDays": int(cdt.termDays),
        "startDate": cdt.startDate,
        "maturityDate": cdt.maturityDate,
        "reteFuentePct": float(cdt.reteFuentePct),
        "isAutoRenew": cdt.isAutoRenew,
        "createdAt": cdt.createdAt or datetime.now().isoformat()
    }
    db["cdts"].append(item)
    save_fixed_income_db(db)
    return item


@router.put("/cdts/{cdt_id}")
def update_cdt(cdt_id: str, cdt: CDTModel):
    db = load_fixed_income_db()
    for idx, c in enumerate(db["cdts"]):
        if c["id"] == cdt_id:
            db["cdts"][idx] = {
                **c,
                "name": cdt.name,
                "capital": float(cdt.capital),
                "currency": cdt.currency,
                "interestRateEA": float(cdt.interestRateEA),
                "termDays": int(cdt.termDays),
                "startDate": cdt.startDate,
                "maturityDate": cdt.maturityDate,
                "reteFuentePct": float(cdt.reteFuentePct),
                "isAutoRenew": cdt.isAutoRenew
            }
            save_fixed_income_db(db)
            return db["cdts"][idx]
    raise HTTPException(status_code=404, detail="CDT not found")


@router.delete("/cdts/{cdt_id}")
def delete_cdt(cdt_id: str):
    db = load_fixed_income_db()
    db["cdts"] = [c for c in db["cdts"] if c["id"] != cdt_id]
    save_fixed_income_db(db)
    return {"success": True, "deleted": cdt_id}


HISTORICAL_RATES_FILE = DATA_DIR / "historical_rates.json"


def load_historical_rates_db() -> Dict[str, Any]:
    if HISTORICAL_RATES_FILE.exists():
        try:
            with open(HISTORICAL_RATES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"entities": {}}


@router.get("/rates/suggest")
def suggest_rate(
    entity_id: str,
    product_type: str = "savings",
    term_days: Optional[int] = None,
    date: Optional[str] = None,
):
    """Suggest exact historical or term-based E.A. interest rate for an entity."""
    rates_db = load_historical_rates_db()
    entity_data = rates_db.get("entities", {}).get(entity_id)

    if not entity_data:
        if product_type == "cdt":
            return {"rateEA": 11.5, "label": "CDT Estándar", "tiers": []}
        return {"rateEA": 12.0, "label": "Cuenta Estándar", "tiers": []}

    target_date = date or datetime.now().strftime("%Y-%m-%d")

    # If CDT, check term tiers (Nu 30d, 90d, 180d, 360d etc.)
    if product_type == "cdt":
        term = term_days or 180
        cdt_tiers = entity_data.get("cdt_term_rates", [])
        matched_tier = None
        for tier in cdt_tiers:
            if tier["termDaysMin"] <= term <= tier["termDaysMax"]:
                matched_tier = tier
                break
        if matched_tier:
            return {
                "rateEA": matched_tier["rateEA"],
                "label": matched_tier.get("label", f"CDT {term} Días"),
                "tiers": cdt_tiers,
                "notes": f"Tasa CDT {entity_data.get('name')} para {term} días",
            }
        return {
            "rateEA": 12.0,
            "label": f"CDT {term} Días",
            "tiers": cdt_tiers,
            "notes": "Tasa referencial",
        }

    # For savings accounts / pockets, lookup date range
    savings_rates = entity_data.get("savings_rates", [])
    for interval in savings_rates:
        if interval["from"] <= target_date <= interval["to"]:
            return {
                "rateEA": interval["rateEA"],
                "label": f"{entity_data.get('name')} ({interval.get('notes', 'Vigente')})",
                "tiers": [],
                "notes": interval.get("notes", ""),
            }

    if savings_rates:
        latest = savings_rates[-1]
        return {
            "rateEA": latest["rateEA"],
            "label": f"{entity_data.get('name')} ({latest.get('notes', 'Última tasa')})",
            "tiers": [],
            "notes": latest.get("notes", ""),
        }

    return {"rateEA": 12.0, "label": "Tasa Referencial", "tiers": []}


class DepositItem(BaseModel):
    date: str
    amount: float
    note: Optional[str] = ""


class CompoundHistoryRequest(BaseModel):
    entityId: str
    deposits: List[DepositItem]
    currentDate: Optional[str] = None


@router.post("/calculate-compound-history")
def calculate_compound_history(payload: CompoundHistoryRequest):
    """Calculate multi-period step-wise daily compound growth across historical rate intervals."""
    rates_db = load_historical_rates_db()
    entity_data = rates_db.get("entities", {}).get(payload.entityId, {})
    savings_rates = entity_data.get("savings_rates", [])

    if not payload.deposits:
        return {
            "currentAccumulatedBalance": 0.0,
            "totalContributedCapital": 0.0,
            "totalInterestsEarned": 0.0,
            "timeline": [],
        }

    sorted_deposits = sorted(payload.deposits, key=lambda d: d.date)
    start_date_str = sorted_deposits[0].date
    end_date_str = payload.currentDate or datetime.now().strftime("%Y-%m-%d")

    start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")

    if end_dt < start_dt:
        end_dt = start_dt

    deposits_by_date = {}
    total_contributed = 0.0
    for d in sorted_deposits:
        deposits_by_date[d.date] = deposits_by_date.get(d.date, 0.0) + d.amount
        total_contributed += d.amount

    timeline = []
    current_balance = 0.0
    current_dt = start_dt

    while current_dt <= end_dt:
        date_str = current_dt.strftime("%Y-%m-%d")

        if date_str in deposits_by_date:
            current_balance += deposits_by_date[date_str]

        active_rate_ea = 12.0
        for interval in savings_rates:
            if interval["from"] <= date_str <= interval["to"]:
                active_rate_ea = interval["rateEA"]
                break

        daily_rate = ((1.0 + active_rate_ea / 100.0) ** (1.0 / 365.0)) - 1.0
        daily_interest = current_balance * daily_rate
        current_balance += daily_interest

        timeline.append({
            "date": date_str,
            "balance": round(current_balance, 2),
            "rateEA": active_rate_ea,
        })

        current_dt = datetime.fromtimestamp(current_dt.timestamp() + 86400)

    total_interests = max(0.0, current_balance - total_contributed)

    return {
        "currentAccumulatedBalance": round(current_balance, 2),
        "totalContributedCapital": round(total_contributed, 2),
        "totalInterestsEarned": round(total_interests, 2),
        "timeline": timeline,
    }


@router.post("/sync")
def sync_full_state(payload: SyncStateModel):
    """Batch sync entire fixed income state from frontend store."""
    db = load_fixed_income_db()
    if payload.entities is not None:
        db["entities"] = payload.entities
    if payload.accounts is not None:
        db["accounts"] = payload.accounts
    if payload.cdts is not None:
        db["cdts"] = payload.cdts
    if payload.transactions is not None:
        db["transactions"] = payload.transactions
    save_fixed_income_db(db)
    return {"success": True, "timestamp": datetime.now().isoformat()}
