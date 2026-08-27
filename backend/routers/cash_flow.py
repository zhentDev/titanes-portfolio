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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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


def load_cash_flow_db() -> dict[str, Any]:
    if not DATA_FILE.exists():
        save_cash_flow_db(DEFAULT_CASH_FLOW_DATA)
        return DEFAULT_CASH_FLOW_DATA.copy()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Ensure critical keys exist
            for k, v in DEFAULT_CASH_FLOW_DATA.items():
                if k not in data or data[k] is None:
                    data[k] = v
            return data
    except Exception as e:
        logger.error(f"[CashFlow] Failed reading data file {DATA_FILE}: {e}")
        if BACKUP_FILE.exists():
            try:
                with open(BACKUP_FILE, "r", encoding="utf-8") as bf:
                    return json.load(bf)
            except Exception:
                pass
        return DEFAULT_CASH_FLOW_DATA.copy()


def save_cash_flow_db(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_file = DATA_FILE.with_suffix(".tmp")
    try:
        # Keep a rotating backup before overwriting
        if DATA_FILE.exists():
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as curr_f:
                    curr_content = curr_f.read()
                    if curr_content.strip():
                        with open(BACKUP_FILE, "w", encoding="utf-8") as bk_f:
                            bk_f.write(curr_content)
            except Exception as bk_err:
                logger.warning(f"[CashFlow] Backup creation warning: {bk_err}")

        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_file.replace(DATA_FILE)

        # Mirror to frontend/public/data/cash_flow.json for offline/static resilience
        try:
            PUBLIC_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(PUBLIC_DATA_FILE, "w", encoding="utf-8") as pf:
                json.dump(data, pf, indent=2, ensure_ascii=False)
        except Exception as pub_err:
            logger.warning(f"[CashFlow] Public static sync warning: {pub_err}")

    except Exception as e:
        logger.error(f"[CashFlow] Failed writing data file: {e}")
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Database write failure")


# ── Pydantic Schemas ─────────────────────────────────────

class CustomRatiosSchema(BaseModel):
    needs: float = 35.0
    wants: float = 30.0
    savings: float = 35.0


class InflowItem(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = "salary"  # salary, freelance, business, passive_fixed, passive_equity, other
    amount: float
    currency: str = "COP"
    isPassive: bool = False
    frequency: str = "monthly"
    icon: Optional[str] = "💼"
    createdAt: Optional[str] = None


class NeedExpenseItem(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = "housing"  # housing, utilities, groceries, health_transport, debt, other
    amount: float
    currency: str = "COP"
    dueDate: Optional[str] = None
    icon: Optional[str] = "🏠"
    createdAt: Optional[str] = None


class WantExpenseItem(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = "dining"  # dining, subscriptions, leisure, shopping, travel, other
    amount: float
    currency: str = "COP"
    icon: Optional[str] = "🍷"
    createdAt: Optional[str] = None


class WealthItem(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = "emergency_fund"  # emergency_fund, equity_investment, fixed_savings, medium_term_goal, other
    targetAmount: Optional[float] = 0.0
    monthlyContribution: float = 0.0
    currentBalance: Optional[float] = 0.0
    currency: str = "COP"
    linkedModule: Optional[str] = "custom"  # fixed_income, variable_income, custom
    icon: Optional[str] = "🛡️"
    createdAt: Optional[str] = None


class CashFlowSyncPayload(BaseModel):
    activePeriod: Optional[str] = "2026-08"
    currency: Optional[str] = "COP"
    allocationModel: Optional[str] = "50_30_20"
    customRatios: Optional[CustomRatiosSchema] = None
    emergencyFundTargetMonths: Optional[int] = 6
    inflows: Optional[List[InflowItem]] = None
    needs: Optional[List[NeedExpenseItem]] = None
    wants: Optional[List[WantExpenseItem]] = None
    wealth: Optional[List[WealthItem]] = None
    payrollAccount: Optional[dict[str, Any]] = None
    creditCards: Optional[List[dict[str, Any]]] = None
    creditPurchases: Optional[List[dict[str, Any]]] = None
    expensesLog: Optional[List[dict[str, Any]]] = None
    creditCardPayments: Optional[List[dict[str, Any]]] = None
    periodsData: Optional[dict[str, Any]] = None


# ── REST API Endpoints ───────────────────────────────────

@router.get("/cash-flow")
def get_cash_flow_state():
    """Retrieve full cash flow, income inflows, budget allocations, credit cards and wealth building targets."""
    return load_cash_flow_db()


@router.post("/cash-flow/sync")
def sync_cash_flow_state(payload: CashFlowSyncPayload):
    """Synchronize full cash flow state from client to backend DuckDB / JSON storage."""
    db = load_cash_flow_db()

    if payload.activePeriod is not None:
        db["activePeriod"] = payload.activePeriod
    if payload.currency is not None:
        db["currency"] = payload.currency
    if payload.allocationModel is not None:
        db["allocationModel"] = payload.allocationModel
    if payload.customRatios is not None:
        db["customRatios"] = payload.customRatios.model_dump()
    if payload.emergencyFundTargetMonths is not None:
        db["emergencyFundTargetMonths"] = payload.emergencyFundTargetMonths
    if payload.inflows is not None:
        db["inflows"] = [item.model_dump() for item in payload.inflows]
    if payload.needs is not None:
        db["needs"] = [item.model_dump() for item in payload.needs]
    if payload.wants is not None:
        db["wants"] = [item.model_dump() for item in payload.wants]
    if payload.wealth is not None:
        db["wealth"] = [item.model_dump() for item in payload.wealth]
    if payload.payrollAccount is not None:
        db["payrollAccount"] = payload.payrollAccount
    if payload.creditCards is not None:
        db["creditCards"] = payload.creditCards
    if payload.creditPurchases is not None:
        db["creditPurchases"] = payload.creditPurchases
    if payload.expensesLog is not None:
        db["expensesLog"] = payload.expensesLog
    if payload.creditCardPayments is not None:
        db["creditCardPayments"] = payload.creditCardPayments
    if payload.periodsData is not None:
        db["periodsData"] = payload.periodsData

    save_cash_flow_db(db)
    return {"status": "ok", "message": "Cash flow synchronized successfully", "data": db}


@router.post("/cash-flow/inflow")
def create_inflow(item: InflowItem):
    """Add a new income stream."""
    db = load_cash_flow_db()
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"in_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["inflows"].append(data_dict)
    save_cash_flow_db(db)
    return data_dict


@router.delete("/cash-flow/inflow/{inflow_id}")
def delete_inflow(inflow_id: str):
    """Delete an income stream."""
    db = load_cash_flow_db()
    db["inflows"] = [x for x in db.get("inflows", []) if x.get("id") != inflow_id]
    save_cash_flow_db(db)
    return {"status": "ok", "deletedId": inflow_id}


@router.post("/cash-flow/need")
def create_need_expense(item: NeedExpenseItem):
    """Add or update an essential fixed expense."""
    db = load_cash_flow_db()
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"need_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["needs"].append(data_dict)
    save_cash_flow_db(db)
    return data_dict


@router.delete("/cash-flow/need/{need_id}")
def delete_need_expense(need_id: str):
    """Delete an essential fixed expense."""
    db = load_cash_flow_db()
    db["needs"] = [x for x in db.get("needs", []) if x.get("id") != need_id]
    save_cash_flow_db(db)
    return {"status": "ok", "deletedId": need_id}


@router.post("/cash-flow/want")
def create_want_expense(item: WantExpenseItem):
    """Add or update a variable lifestyle expense."""
    db = load_cash_flow_db()
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"want_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wants"].append(data_dict)
    save_cash_flow_db(db)
    return data_dict


@router.delete("/cash-flow/want/{want_id}")
def delete_want_expense(want_id: str):
    """Delete a variable lifestyle expense."""
    db = load_cash_flow_db()
    db["wants"] = [x for x in db.get("wants", []) if x.get("id") != want_id]
    save_cash_flow_db(db)
    return {"status": "ok", "deletedId": want_id}


@router.post("/cash-flow/wealth")
def create_wealth_item(item: WealthItem):
    """Add or update a wealth / savings / investment allocation."""
    db = load_cash_flow_db()
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"wealth_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wealth"].append(data_dict)
    save_cash_flow_db(db)
    return data_dict


@router.delete("/cash-flow/wealth/{wealth_id}")
def delete_wealth_item(wealth_id: str):
    """Delete a wealth / savings / investment allocation."""
    db = load_cash_flow_db()
    db["wealth"] = [x for x in db.get("wealth", []) if x.get("id") != wealth_id]
    save_cash_flow_db(db)
    return {"status": "ok", "deletedId": wealth_id}
