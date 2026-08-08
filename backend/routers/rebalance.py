from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from datetime import date
from services.db import add_rebalance, get_all_rebalances, delete_rebalance

router = APIRouter()

class RebalanceRequest(BaseModel):
    rebalance_date: date
    cash_added: float
    tickers: List[str]

@router.get("/rebalances")
def get_rebalances():
    return get_all_rebalances()

@router.post("/rebalances")
def create_rebalance(req: RebalanceRequest):
    if len(req.tickers) > 15:
        raise HTTPException(status_code=400, detail="Maximum 15 tickers allowed")
    
    add_rebalance(req.rebalance_date, req.cash_added, req.tickers)
    return {"status": "ok"}

@router.delete("/rebalances/{rebalance_date}")
def remove_rebalance(rebalance_date: date):
    delete_rebalance(rebalance_date)
    return {"status": "ok"}
