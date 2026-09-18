from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from services.auth import get_optional_current_user
from services.db import (
    add_rebalance,
    delete_custom_strategy,
    delete_rebalance,
    update_rebalance_date,
    get_all_rebalances,
    get_custom_strategies,
    save_custom_strategy,
)

router = APIRouter()


class RebalanceRequest(BaseModel):
    rebalance_date: date
    cash_added: float = 0.0
    tickers: list[str]
    strategy_id: Optional[str] = "historical"


class UpdateRebalanceDateRequest(BaseModel):
    old_date: date
    new_date: date
    strategy_id: Optional[str] = "historical"


class CustomStrategyModel(BaseModel):
    id: str
    name: str
    country: Optional[str] = "🌎"
    numSlots: Optional[int] = 20
    capital: Optional[float] = 1000.0
    activeInvested: Optional[float] = 1000.0
    benchmark: Optional[str] = "S&P 500"
    color: Optional[str] = "#a855f7"
    isSystem: Optional[bool] = False
    isRealMoney: Optional[bool] = False


# ── REBALANCES ENDPOINTS ────────────────────────────────────────────────────────


@router.get("/rebalances")
def get_rebalances(request: Request, strategy_id: str = Query("historical")):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return get_all_rebalances(strategy_id=strategy_id, user_id=user_id)


@router.post("/rebalances")
def create_rebalance(req: RebalanceRequest, request: Request):
    if len(req.tickers) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers allowed")

    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    strat_id = req.strategy_id or "historical"
    add_rebalance(req.rebalance_date, req.cash_added, req.tickers, strategy_id=strat_id, user_id=user_id)
    return {"status": "ok", "strategy_id": strat_id}


@router.delete("/rebalances/{rebalance_date}")
def remove_rebalance(rebalance_date: date, request: Request, strategy_id: str = Query("historical")):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    delete_rebalance(rebalance_date, strategy_id=strategy_id, user_id=user_id)
    return {"status": "ok", "strategy_id": strategy_id}


@router.put("/rebalances/date")
def change_rebalance_date(req: UpdateRebalanceDateRequest, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    strat_id = req.strategy_id or "historical"
    update_rebalance_date(req.old_date, req.new_date, strategy_id=strat_id, user_id=user_id)
    return {"status": "ok", "old_date": req.old_date, "new_date": req.new_date, "strategy_id": strat_id}


# ── CUSTOM STRATEGIES ENDPOINTS ────────────────────────────────────────────────


@router.get("/custom-strategies")
def list_custom_strategies(request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return get_custom_strategies(user_id=user_id)


@router.post("/custom-strategies")
def create_or_update_strategy(strat: CustomStrategyModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    save_custom_strategy(strat.dict(), user_id=user_id)
    return {"status": "ok", "strategy": strat.dict()}


@router.delete("/custom-strategies/{strategy_id}")
def delete_strategy(strategy_id: str, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    delete_custom_strategy(strategy_id, user_id=user_id)
    return {"status": "ok", "strategy_id": strategy_id}

