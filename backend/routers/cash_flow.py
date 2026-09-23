"""Cash Flow & Budget Allocation REST API Router.

Manages monthly income inflows, 50/30/20 & dynamic rule allocations,
fixed essential expenses (Needs), variable lifestyle spending (Wants),
and wealth-building / emergency fund runway metrics.
"""

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.auth import get_optional_current_user
from services.db import get_user_cash_flow_db, save_user_cash_flow_db

logger = logging.getLogger(__name__)

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "cash_flow.json"
BACKUP_FILE = DATA_DIR / "cash_flow_backup.json"
PUBLIC_DATA_FILE = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "data" / "cash_flow.json"

DEFAULT_CASH_FLOW_DATA = {
    "activePeriod": "2026-08",
    "startPeriod": "2026-08",
    "currency": "COP",
    "allocationModel": "custom",
    "customRatios": {"needs": 35.0, "wants": 30.0, "savings": 35.0},
    "emergencyFundTargetMonths": 6,
    "inflows": [],
    "needs": [],
    "wants": [],
    "wealth": [],
    "expensesLog": [],
    "creditCards": [],
    "creditCardPayments": [],
    "periodsData": {}
}


OWNER_ID = "usr_9487dd2209d2"


def get_user_cash_flow_file(user_id: Optional[str] = None) -> Path:
    if not user_id:
        return DATA_FILE
    user_dir = DATA_DIR / "users"
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir / f"{user_id}_cash_flow.json"


def load_cash_flow_db(user_id: Optional[str] = None) -> dict[str, Any]:
    """
    Load cash flow data with Database as primary source of truth (DuckDB / Postgres)
    and transparent dual-sync with existing JSON files as non-destructive backup.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    effective_uid = user_id or OWNER_ID
    target_file = get_user_cash_flow_file(user_id)

    # 1. Try reading from Database (Postgres / DuckDB)
    db_data = get_user_cash_flow_db(effective_uid)
    if db_data and (db_data.get("inflows") or db_data.get("needs") or db_data.get("wants") or db_data.get("wealth")):
        for k, v in DEFAULT_CASH_FLOW_DATA.items():
            if k not in db_data or db_data[k] is None:
                db_data[k] = v
        return db_data

    # 2. If DB has no records yet for this user:
    # If this is a separate registered user (not owner and not public demo), start with clean isolated defaults
    if user_id and user_id != OWNER_ID:
        if target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    seed_data = json.load(f)
                    for k, v in DEFAULT_CASH_FLOW_DATA.items():
                        if k not in seed_data or seed_data[k] is None:
                            seed_data[k] = v
                    return seed_data
            except Exception:
                pass
        initial_clean = DEFAULT_CASH_FLOW_DATA.copy()
        save_cash_flow_db(initial_clean, user_id)
        return initial_clean

    # For Owner or Public Showcase: seed from existing JSON backup without deleting anything
    seed_data = None
    if target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
        except Exception:
            pass

    if (not seed_data or not (seed_data.get("inflows") or seed_data.get("needs") or seed_data.get("wants") or seed_data.get("wealth"))):
        if DATA_FILE.exists():
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as df:
                    candidate = json.load(df)
                if candidate.get("inflows") or candidate.get("needs") or candidate.get("wants") or candidate.get("wealth"):
                    seed_data = candidate
            except Exception:
                pass

    if not seed_data:
        seed_data = DEFAULT_CASH_FLOW_DATA.copy()

    for k, v in DEFAULT_CASH_FLOW_DATA.items():
        if k not in seed_data or seed_data[k] is None:
            seed_data[k] = v

    # Save to Database and maintain JSON backup
    save_cash_flow_db(seed_data, effective_uid)
    return seed_data


def save_cash_flow_db(data: dict[str, Any], user_id: Optional[str] = None) -> None:
    """
    Save data safely to Database (DuckDB / Postgres) AND mirror to JSON file as permanent backup.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    effective_uid = user_id or OWNER_ID

    # 1. Primary: Save to Database
    try:
        save_user_cash_flow_db(effective_uid, data)
    except Exception as e:
        logger.error(f"[CashFlow DB] Error saving to database: {e}")

    # 2. Dual-Write: Mirror to JSON file as permanent backup (NO deletions)
    target_file = get_user_cash_flow_file(user_id)
    target_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = target_file.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_file.replace(target_file)

        # Mirror master legacy file if owner or global
        if not user_id or user_id == OWNER_ID:
            with open(DATA_FILE, "w", encoding="utf-8") as df:
                json.dump(data, df, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[CashFlow Backup] Failed writing JSON backup: {e}")
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Database write failure")


# --- Pydantic Data Models ---

class InflowItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    amount: float
    frequency: str = "monthly"
    isPassive: bool = False
    createdAt: str | None = None


class NeedExpenseItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    amount: float
    category: str = "general"
    isEssential: bool = True
    dueDate: int | None = None
    createdAt: str | None = None


class WantExpenseItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    budgetedAmount: float = 0.0
    actualSpent: float = 0.0
    category: str = "lifestyle"
    createdAt: str | None = None


class WealthItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    targetAmount: float = 0.0
    actualContributed: float = 0.0
    targetType: str = "investment"
    createdAt: str | None = None


class CustomRatiosModel(BaseModel):
    model_config = {"extra": "allow"}
    needs: float = 50.0
    wants: float = 30.0
    savings: float = 20.0


class CashFlowSyncPayload(BaseModel):
    model_config = {"extra": "allow"}
    activePeriod: str | None = None
    currency: str | None = None
    allocationModel: str | None = None
    customRatios: dict | None = None
    emergencyFundTargetMonths: int | None = None
    inflows: list[dict] | None = None
    needs: list[dict] | None = None
    wants: list[dict] | None = None
    wealth: list[dict] | None = None
    payrollAccount: dict | None = None
    creditCards: list[dict] | None = None
    creditPurchases: list[dict] | None = None
    expensesLog: list[dict] | None = None
    creditCardPayments: list[dict] | None = None
    periodsData: dict | None = None


# --- REST API Endpoints ---

@router.get("/cash-flow")
def get_cash_flow_state(request: Request):
    """Retrieve full cash flow, income inflows, budget allocations, credit cards and wealth building targets."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return load_cash_flow_db(user_id)


@router.post("/cash-flow/sync")
def sync_cash_flow_state(payload: CashFlowSyncPayload, request: Request):
    """Synchronize full cash flow state from client to backend DuckDB / JSON storage."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)

    def dump_val(v):
        if hasattr(v, "model_dump"):
            return v.model_dump()
        return v

    if payload.activePeriod is not None:
        db["activePeriod"] = payload.activePeriod
    if payload.currency is not None:
        db["currency"] = payload.currency
    if payload.allocationModel is not None:
        db["allocationModel"] = payload.allocationModel
    if payload.customRatios is not None:
        db["customRatios"] = dump_val(payload.customRatios)
    if payload.emergencyFundTargetMonths is not None:
        db["emergencyFundTargetMonths"] = payload.emergencyFundTargetMonths
    if payload.inflows is not None:
        db["inflows"] = [dump_val(item) for item in payload.inflows]
    if payload.needs is not None:
        db["needs"] = [dump_val(item) for item in payload.needs]
    if payload.wants is not None:
        db["wants"] = [dump_val(item) for item in payload.wants]
    if payload.wealth is not None:
        db["wealth"] = [dump_val(item) for item in payload.wealth]
    if payload.payrollAccount is not None:
        db["payrollAccount"] = dump_val(payload.payrollAccount)
    if payload.creditCards is not None:
        db["creditCards"] = [dump_val(item) for item in payload.creditCards] if isinstance(payload.creditCards, list) else payload.creditCards
    if payload.creditPurchases is not None:
        db["creditPurchases"] = [dump_val(item) for item in payload.creditPurchases] if isinstance(payload.creditPurchases, list) else payload.creditPurchases
    if payload.expensesLog is not None:
        db["expensesLog"] = [dump_val(item) for item in payload.expensesLog] if isinstance(payload.expensesLog, list) else payload.expensesLog
    if payload.creditCardPayments is not None:
        db["creditCardPayments"] = [dump_val(item) for item in payload.creditCardPayments] if isinstance(payload.creditCardPayments, list) else payload.creditCardPayments
    if payload.periodsData is not None:
        db["periodsData"] = dump_val(payload.periodsData)

    save_cash_flow_db(db, user_id)
    return {"status": "ok", "message": "Cash flow synchronized successfully", "data": db}


@router.post("/cash-flow/inflow")
def create_inflow(item: InflowItem, request: Request):
    """Add a new income stream."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"in_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["inflows"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/inflow/{inflow_id}")
def delete_inflow(inflow_id: str, request: Request):
    """Delete an income stream."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["inflows"] = [x for x in db.get("inflows", []) if x.get("id") != inflow_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": inflow_id}


@router.post("/cash-flow/need")
def create_need_expense(item: NeedExpenseItem, request: Request):
    """Add or update an essential fixed expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"need_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["needs"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/need/{need_id}")
def delete_need_expense(need_id: str, request: Request):
    """Delete an essential fixed expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["needs"] = [x for x in db.get("needs", []) if x.get("id") != need_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": need_id}


@router.post("/cash-flow/want")
def create_want_expense(item: WantExpenseItem, request: Request):
    """Add or update a variable lifestyle expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"want_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wants"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/want/{want_id}")
def delete_want_expense(want_id: str, request: Request):
    """Delete a variable lifestyle expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["wants"] = [x for x in db.get("wants", []) if x.get("id") != want_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": want_id}


@router.post("/cash-flow/wealth")
def create_wealth_item(item: WealthItem, request: Request):
    """Add or update a wealth / savings / investment allocation."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"wealth_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wealth"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/wealth/{wealth_id}")
def delete_wealth_item(wealth_id: str, request: Request):
    """Delete a wealth / savings / investment allocation."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["wealth"] = [x for x in db.get("wealth", []) if x.get("id") != wealth_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": wealth_id}
