"""Fixed Income, Savings Accounts, and CDTs REST API Router.

Manages multi-currency banking entities, high-yield savings accounts,
term deposits (CDTs with ReteFuente tax deductions), crypto staking/USD yields,
and quantitative compound interest projections.
"""

import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "fixed_income.json"


def clean_category(cat_str: str) -> str:
    if not cat_str:
        return ""
    # Convert to lowercase
    s = cat_str.lower().strip()
    # Remove action prefixes
    s = re.sub(r'^(?:venció|vencio|vencimiento|invertiste)\s+(?:el|en)\s+cdt\s+(?:en\s+)?', '', s)
    # Remove trailing positive amount/payout strings
    s = re.sub(r'\+[\d\.,\s]+', '', s)
    # Keep only alphanumeric chars (normalized)
    s = re.sub(r'[^a-z0-9áéíóúñ]', '', s)
    return s.strip()

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


def load_fixed_income_db() -> dict[str, Any]:
    """Load JSON database with failover to default initial state."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        save_fixed_income_db(DEFAULT_FIXED_INCOME_DATA)
        return DEFAULT_FIXED_INCOME_DATA
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_FIXED_INCOME_DATA


def save_fixed_income_db(data: dict[str, Any]) -> None:
    """Save data safely to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# --- Pydantic Data Models ---

class EntityModel(BaseModel):
    id: str | None = None
    name: str
    country: str = "🇨🇴"
    color: str = "#10b981"
    icon: str = "🏦"
    createdAt: str | None = None


class AccountModel(BaseModel):
    id: str | None = None
    entityId: str
    name: str
    type: str = "savings"  # 'savings' | 'pocket' | 'wallet' | 'crypto'
    currency: str = "COP"  # 'COP' | 'USD' | 'EUR' | 'USDC'
    balance: float = 0.0
    interestRateEA: float = 0.0
    isTaxExemptGMF: bool = True
    rateHistory: list[dict[str, Any]] | None = []
    createdAt: str | None = None


class CDTModel(BaseModel):
    id: str | None = None
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
    createdAt: str | None = None


class TransactionModel(BaseModel):
    id: str | None = None
    accountId: str
    type: str = "deposit"  # 'deposit' | 'withdrawal' | 'interest_adjustment'
    amount: float
    date: str
    note: str | None = ""


class SyncStateModel(BaseModel):
    entities: list[dict[str, Any]] | None = None
    accounts: list[dict[str, Any]] | None = None
    cdts: list[dict[str, Any]] | None = None
    transactions: list[dict[str, Any]] | None = None


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


def load_historical_rates_db() -> dict[str, Any]:
    if HISTORICAL_RATES_FILE.exists():
        try:
            with open(HISTORICAL_RATES_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"entities": {}}


@router.get("/rates")
def get_all_historical_rates():
    """Return the entire historical rates database for the frontend to query dynamically."""
    return load_historical_rates_db()


@router.get("/rates/suggest")
def suggest_rate(
    entity_id: str,
    product_type: str = "savings",
    term_days: int | None = None,
    date: str | None = None,
):
    """Suggest exact historical or term-based E.A. interest rate for an entity."""
    rates_db = load_historical_rates_db()
    entity_data = rates_db.get("entities", {}).get(entity_id)

    if not entity_data:
        # Fallback: search by entity name in fixed_income database
        fi_db = load_fixed_income_db()
        target_ent = next((e for e in fi_db.get("entities", []) if e.get("id") == entity_id), None)
        if target_ent:
            ent_name_clean = target_ent.get("name", "").lower().replace(" ", "").replace("banco", "")
            for k, ed in rates_db.get("entities", {}).items():
                k_clean = k.lower().replace("ent_", "").replace("_", "")
                ed_name_clean = ed.get("name", "").lower().replace(" ", "").replace("banco", "")
                if k_clean in ent_name_clean or ent_name_clean in k_clean or ed_name_clean in ent_name_clean or ent_name_clean in ed_name_clean:
                    entity_data = ed
                    break

    if not entity_data:
        if product_type == "cdt":
            return {"rateEA": 11.5, "label": "CDT Estándar", "tiers": []}
        return {"rateEA": 12.0, "label": "Cuenta Estándar", "tiers": []}

    target_date = date or datetime.now().strftime("%Y-%m-%d")

    # If CDT, check term tiers (Nu 60d, 90d, 180d, 360d, 540d, 720d, 1080d etc.)
    if product_type == "cdt":
        term = term_days or 180
        cdt_tiers = entity_data.get("cdt_term_rates", [])
        history = entity_data.get("cdt_term_rates_history", [])
        if date and history:
            for period in history:
                if period.get("from", "") <= target_date <= period.get("to", ""):
                    cdt_tiers = period.get("tiers", cdt_tiers)
                    break

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
                "notes": f"Tasa CDT {entity_data.get('name')} para {term} días ({matched_tier['rateEA']}%)",
            }
        return {
            "rateEA": cdt_tiers[-1]["rateEA"] if cdt_tiers else 12.0,
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
    note: str | None = ""


class CompoundHistoryRequest(BaseModel):
    entityId: str
    deposits: list[DepositItem]
    currentDate: str | None = None


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


from fastapi import File, Form, UploadFile

from services.statement_parser import process_batch_statement_documents


@router.post("/upload-statement")
async def upload_statement(
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    password: str | None = Form(None),
    start_year: int | None = Form(2024)
):
    """
    Upload a batch of bank statements (PDFs or mobile screenshots) protected with password (e.g. Cedula/NIT).
    Decrypts, auto-identifies entity, and extracts accounts, Cajitas by name, CDTs, and movements.
    """
    files_to_process = files or ([file] if file else [])
    if not files_to_process:
        raise HTTPException(status_code=400, detail="No se enviaron archivos para procesar")

    contents = []
    for f in files_to_process:
        c = await f.read()
        if c:
            contents.append(c)

    res = process_batch_statement_documents(contents, password=password, start_year=start_year or 2024)
    return res


class ConfirmImportRequest(BaseModel):
    entityId: str
    accounts: list[dict[str, Any]] = []
    cdts: list[dict[str, Any]] = []
    transactions: list[dict[str, Any]] = []


@router.post("/confirm-import")
def confirm_statement_import(payload: ConfirmImportRequest):
    """Batch import approved accounts, CDTs, and transactions extracted from PDF."""
    db = load_fixed_income_db()
    
    # 1. Ensure entity exists
    existing_entities = {e["id"]: e for e in db.get("entities", [])}
    if payload.entityId not in existing_entities:
        # Create entity if missing
        db["entities"].append({
            "id": payload.entityId,
            "name": "Entidad Detectada",
            "country": "🇨🇴",
            "color": "#820ad1",
            "icon": "🏦",
            "createdAt": datetime.now().isoformat()
        })

    # 2. Append or update accounts
    created_accounts = 0
    existing_accounts_map = {
        a["name"].lower().strip(): a 
        for a in db.get("accounts", []) 
        if a["entityId"] == payload.entityId
    }

    for acc in payload.accounts:
        acc_name = acc.get("name", "Cuenta Detectada").strip()
        acc_name_lower = acc_name.lower()
        balance_val = float(acc.get("balance", 0.0))
        rate_val = float(acc.get("interestRateEA", 12.0))
        
        if acc_name_lower in existing_accounts_map:
            # Update existing account's balance and interest rate to avoid duplicates
            existing_acc = existing_accounts_map[acc_name_lower]
            existing_acc["balance"] = balance_val
            existing_acc["interestRateEA"] = rate_val
            
            if "rateHistory" not in existing_acc:
                existing_acc["rateHistory"] = []
                
            if not existing_acc["rateHistory"] or existing_acc["rateHistory"][-1]["rateEA"] != rate_val:
                existing_acc["rateHistory"].append({
                    "date": datetime.now().strftime("%Y-%m-%d"), 
                    "rateEA": rate_val
                })
        else:
            # Create new account if not present
            acc_id = acc.get("id") or f"acc_{uuid.uuid4().hex}"
            db["accounts"].append({
                "id": acc_id,
                "entityId": payload.entityId,
                "name": acc_name,
                "type": acc.get("type", "pocket"),
                "currency": acc.get("currency", "COP"),
                "balance": balance_val,
                "interestRateEA": rate_val,
                "isTaxExemptGMF": bool(acc.get("isTaxExemptGMF", True)),
                "rateHistory": [{"date": datetime.now().strftime("%Y-%m-%d"), "rateEA": rate_val}],
                "createdAt": datetime.now().isoformat()
            })
            created_accounts += 1

    # 3. Append or update CDTs
    created_cdts = 0
    for cdt in payload.cdts:
        cdt_id = cdt.get("id") or f"cdt_{uuid.uuid4().hex}"
        start_dt = cdt.get("startDate") or datetime.now().strftime("%Y-%m-%d")
        term_days = int(cdt.get("termDays", 180))
        category = cdt.get("category") or "General"
        status = cdt.get("status") or "active"
        capital_val = float(cdt.get("capital", 0.0))
        rate_val = float(cdt.get("interestRateEA", 12.0))
        
        # calculate maturity date if missing
        try:
            start_obj = datetime.strptime(start_dt, "%Y-%m-%d")
            maturity_obj = datetime.fromtimestamp(start_obj.timestamp() + term_days * 86400)
            maturity_dt = maturity_obj.strftime("%Y-%m-%d")
        except Exception:
            maturity_dt = start_dt

        # If it is active, check if we can update/deduplicate an existing active one of the same category AND approximate capital/date
        if status == "active":
            updated_existing = False
            for existing_cdt in db.get("cdts", []):
                if (
                    existing_cdt.get("entityId") == payload.entityId
                    and clean_category(existing_cdt.get("category", "")) == clean_category(category)
                    and existing_cdt.get("status", "active") == "active"
                ):
                    # To be a duplicate, the capital must be very close AND start date must be close (same month/year or within 30 days)
                    capital_close = abs(existing_cdt["capital"] - capital_val) / max(1.0, existing_cdt["capital"]) <= 0.05
                    try:
                        ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                        im_start = datetime.strptime(start_dt, "%Y-%m-%d")
                        date_close = abs((ex_start - im_start).days) <= 30
                    except Exception:
                        date_close = True
                    
                    if capital_close and date_close:
                        # Update fields of the duplicate active CDT
                        existing_cdt["startDate"] = start_dt
                        existing_cdt["capital"] = capital_val
                        existing_cdt["interestRateEA"] = rate_val
                        existing_cdt["termDays"] = term_days
                        existing_cdt["maturityDate"] = maturity_dt
                        existing_cdt["name"] = cdt.get("name", existing_cdt.get("name"))
                        updated_existing = True
                        created_cdts += 1
                        logger.info("CDT Activo existente '%s' actualizado con nueva fecha/valores de importación", existing_cdt["name"])
                        break
            if updated_existing:
                continue

        # If the imported CDT is matured, check if we can pair it with an existing active one in the DB
        paired = False
        if status == "matured":
            payout_amount = float(cdt.get("payoutAmount", capital_val))
            payout_date = cdt.get("payoutDate") or start_dt
            
            # Pasada 1: Coincidencia exacta de categoría (limpia) y cronológica
            for existing_cdt in db.get("cdts", []):
                if (
                    existing_cdt.get("entityId") == payload.entityId
                    and clean_category(existing_cdt.get("category", "")) == clean_category(category)
                    and existing_cdt.get("status", "active") == "active"
                ):
                    # Enforce chronological date check (investment date must be strictly anterior to payout date)
                    is_chronological = False
                    try:
                        ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                        pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                        is_chronological = ex_start < pay_date
                    except Exception:
                        is_chronological = True
                        
                    if is_chronological:
                        # Check if capital is within a reasonable range of payout
                        if existing_cdt["capital"] <= payout_amount <= existing_cdt["capital"] * 1.15:
                            existing_cdt["status"] = "matured"
                            existing_cdt["payoutAmount"] = payout_amount
                            existing_cdt["payoutDate"] = payout_date
                            existing_cdt["category"] = category  # Actualizar la categoría al nombre real limpio si tenía basura
                            existing_cdt["netProfit"] = payout_amount - existing_cdt["capital"]
                            
                            # Calcular el plazo real en días entre el inicio y el pago
                            try:
                                ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                                pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                                diff_days = (pay_date - ex_start).days
                                if diff_days > 0:
                                    existing_cdt["termDays"] = diff_days
                                    existing_cdt["maturityDate"] = payout_date
                            except Exception:
                                pass
                                
                            paired = True
                            created_cdts += 1
                            logger.info("CDT Vencido '%s' enlazado (Exacto) en DB con ganancia %.2f y plazo de %d días", 
                                        existing_cdt["name"], existing_cdt["netProfit"], existing_cdt.get("termDays", 180))
                            break
            
            # Pasada 2 (Fallback): Si no se emparejó, buscar coincidencia por capital y fecha si es candidato único cronológico
            if not paired:
                candidates = []
                for existing_cdt in db.get("cdts", []):
                    if (
                        existing_cdt.get("entityId") == payload.entityId
                        and existing_cdt.get("status", "active") == "active"
                    ):
                        # Enforce chronological check
                        is_chronological = False
                        try:
                            ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                            pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                            is_chronological = ex_start < pay_date
                        except Exception:
                            is_chronological = True
                            
                        if is_chronological:
                            # Verificar rango lógico de capital
                            if existing_cdt["capital"] <= payout_amount <= existing_cdt["capital"] * 1.15:
                                candidates.append(existing_cdt)
                
                if len(candidates) == 1:
                    # Candidato único! Pareja perfecta garantizada por matemática
                    matched_cdt = candidates[0]
                    matched_cdt["status"] = "matured"
                    matched_cdt["payoutAmount"] = payout_amount
                    matched_cdt["payoutDate"] = payout_date
                    matched_cdt["category"] = category  # Restaurar la categoría limpia correcta
                    matched_cdt["netProfit"] = payout_amount - matched_cdt["capital"]
                    
                    # Calcular el plazo real en días entre el inicio y el pago
                    try:
                        ex_start = datetime.strptime(matched_cdt["startDate"], "%Y-%m-%d")
                        pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                        diff_days = (pay_date - ex_start).days
                        if diff_days > 0:
                            matched_cdt["termDays"] = diff_days
                            matched_cdt["maturityDate"] = payout_date
                    except Exception:
                        pass
                        
                    paired = True
                    created_cdts += 1
                    logger.info("CDT Vencido enlazado por Heurística de Candidato Único (Monto: %.2f, Anterior categoría basura: '%s' -> Nueva: '%s', Plazo: %d días)", 
                                payout_amount, matched_cdt.get("category"), category, matched_cdt.get("termDays", 180))
        
        if not paired:
            # If not paired or not matured, create as a new CDT entry
            new_cdt = {
                "id": cdt_id,
                "entityId": payload.entityId,
                "name": cdt.get("name", "CDT Detectado"),
                "capital": capital_val,
                "currency": cdt.get("currency", "COP"),
                "interestRateEA": rate_val,
                "termDays": term_days,
                "startDate": start_dt,
                "maturityDate": cdt.get("maturityDate") or maturity_dt,
                "reteFuentePct": float(cdt.get("reteFuentePct", 4.0)),
                "isAutoRenew": bool(cdt.get("isAutoRenew", False)),
                "status": status,
                "category": category,
                "createdAt": datetime.now().isoformat()
            }
            if status == "matured":
                new_cdt["payoutAmount"] = float(cdt.get("payoutAmount", capital_val))
                new_cdt["payoutDate"] = cdt.get("payoutDate") or start_dt
                new_cdt["netProfit"] = new_cdt["payoutAmount"] - capital_val
                
            db["cdts"].append(new_cdt)
            created_cdts += 1

    # 4. Append transactions/movements safely with YYYY-MM-DD formatting and deduplication
    created_transactions = 0
    existing_transactions = db.get("transactions", [])
    existing_tx_keys = set()
    for tx in existing_transactions:
        tx_date = tx.get("date", "").split("T")[0]
        tx_desc = tx.get("description", "").lower().strip()
        tx_amount = float(tx.get("amount", 0.0))
        existing_tx_keys.add((tx_date, tx_desc, tx_amount))
        
    for tx in payload.transactions:
        tx_date = tx.get("date", "").split("T")[0]
        tx_desc = tx.get("description", "").lower().strip()
        tx_amount = float(tx.get("amount", 0.0))
        
        tx_key = (tx_date, tx_desc, tx_amount)
        if tx_key not in existing_tx_keys:
            new_tx = {
                "id": tx.get("id") or f"tx_pdf_{int(datetime.now().timestamp() * 1000)}_{created_transactions}_{uuid.uuid4().hex[:6]}",
                "entityId": payload.entityId,
                "date": tx_date,  # Format strictly as YYYY-MM-DD
                "description": tx.get("description", "").strip(),
                "amount": tx_amount,
                "type": tx.get("type", "credit"),
                "currency": tx.get("currency", "COP"),
                "createdAt": datetime.now().isoformat()
            }
            existing_transactions.append(new_tx)
            existing_tx_keys.add(tx_key)
            created_transactions += 1
            
    db["transactions"] = existing_transactions

    save_fixed_income_db(db)
    return {
        "success": True,
        "importedAccounts": created_accounts,
        "importedCDTs": created_cdts,
        "importedTransactions": created_transactions,
        "timestamp": datetime.now().isoformat()
    }
