from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from services.db import (
    add_rebalance,
    delete_custom_strategy,
    delete_rebalance,
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
def get_rebalances(strategy_id: str = Query("historical")):
    return get_all_rebalances(strategy_id=strategy_id)


@router.post("/rebalances")
def create_rebalance(req: RebalanceRequest):
    if len(req.tickers) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers allowed")

    strat_id = req.strategy_id or "historical"
    add_rebalance(req.rebalance_date, req.cash_added, req.tickers, strategy_id=strat_id)
    return {"status": "ok", "strategy_id": strat_id}


@router.delete("/rebalances/{rebalance_date}")
def remove_rebalance(rebalance_date: date, strategy_id: str = Query("historical")):
    delete_rebalance(rebalance_date, strategy_id=strategy_id)
    return {"status": "ok", "strategy_id": strategy_id}


# ── CUSTOM STRATEGIES ENDPOINTS ────────────────────────────────────────────────


@router.get("/custom-strategies")
def list_custom_strategies():
    return get_custom_strategies()


@router.post("/custom-strategies")
def create_or_update_strategy(strat: CustomStrategyModel):
    save_custom_strategy(strat.dict())
    return {"status": "ok", "strategy": strat.dict()}


@router.delete("/custom-strategies/{strategy_id}")
def delete_strategy(strategy_id: str):
    delete_custom_strategy(strategy_id)
    return {"status": "ok", "strategy_id": strategy_id}

