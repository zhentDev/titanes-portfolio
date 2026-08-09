from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from services.db import get_connection
import json

router = APIRouter()

class PortfolioItem(BaseModel):
    id: str
    name: str
    isPlan: Optional[bool] = False
    planConfig: Optional[dict] = None

class PurchaseLot(BaseModel):
    id: str
    portfolioId: str
    ticker: str
    date: str
    purchasePrice: float
    shares: float
    manualCurrentPrice: Optional[float] = None

class SyncPayload(BaseModel):
    purchasePortfolios: List[PortfolioItem]
    individualPurchases: List[PurchaseLot]

@router.get("/purchases/portfolios")
def get_all_purchases_data():
    with get_connection() as con:
        portfolios = con.execute("SELECT id, name, is_plan, plan_config FROM purchase_portfolios").fetchall()
        lots = con.execute("SELECT id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price FROM individual_purchases").fetchall()
        
        return {
            "purchasePortfolios": [{"id": p[0], "name": p[1], "isPlan": bool(p[2]), "planConfig": json.loads(p[3]) if p[3] else None} for p in portfolios],
            "individualPurchases": [
                {
                    "id": lot[0],
                    "portfolioId": lot[1],
                    "ticker": lot[2],
                    "date": str(lot[3]),
                    "purchasePrice": lot[4],
                    "shares": lot[5],
                    "manualCurrentPrice": lot[6]
                }
                for lot in lots
            ]
        }

@router.post("/purchases/portfolios")
def create_portfolio(item: PortfolioItem):
    with get_connection() as con:
        config_str = json.dumps(item.planConfig) if item.planConfig else None
        con.execute(
            "INSERT INTO purchase_portfolios (id, name, is_plan, plan_config) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, is_plan=EXCLUDED.is_plan, plan_config=EXCLUDED.plan_config",
            [item.id, item.name, item.isPlan, config_str]
        )
    return {"success": True}

class PlanTogglePayload(BaseModel):
    isPlan: bool
    planConfig: Optional[dict] = None

@router.put("/purchases/portfolios/{portfolio_id}/plan")
def toggle_portfolio_plan(portfolio_id: str, payload: PlanTogglePayload):
    with get_connection() as con:
        config_str = json.dumps(payload.planConfig) if payload.planConfig else None
        con.execute(
            "UPDATE purchase_portfolios SET is_plan = ?, plan_config = ? WHERE id = ?",
            [payload.isPlan, config_str, portfolio_id]
        )
    return {"success": True}

@router.delete("/purchases/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: str):
    with get_connection() as con:
        con.execute("DELETE FROM individual_purchases WHERE portfolio_id = ?", [portfolio_id])
        con.execute("DELETE FROM purchase_portfolios WHERE id = ?", [portfolio_id])
    return {"success": True}

@router.post("/purchases/lots")
def create_lot(lot: PurchaseLot):
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO individual_purchases 
            (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET 
                portfolio_id=EXCLUDED.portfolio_id,
                ticker=EXCLUDED.ticker,
                date=EXCLUDED.date,
                purchase_price=EXCLUDED.purchase_price,
                shares=EXCLUDED.shares,
                manual_current_price=EXCLUDED.manual_current_price
            """,
            [lot.id, lot.portfolioId, lot.ticker, lot.date, lot.purchasePrice, lot.shares, lot.manualCurrentPrice]
        )
    return {"success": True}

@router.put("/purchases/lots")
def update_lots(lots: List[PurchaseLot]):
    with get_connection() as con:
        for lot in lots:
            con.execute(
                """
                UPDATE individual_purchases 
                SET portfolio_id=?, ticker=?, date=?, purchase_price=?, shares=?, manual_current_price=?
                WHERE id=?
                """,
                [lot.portfolioId, lot.ticker, lot.date, lot.purchasePrice, lot.shares, lot.manualCurrentPrice, lot.id]
            )
    return {"success": True}

@router.delete("/purchases/lots/{lot_id}")
def delete_lot(lot_id: str):
    with get_connection() as con:
        con.execute("DELETE FROM individual_purchases WHERE id = ?", [lot_id])
    return {"success": True}

@router.post("/purchases/sync")
def sync_migration(payload: SyncPayload):
    # This is for migrating local storage to DuckDB seamlessly
    with get_connection() as con:
        for p in payload.purchasePortfolios:
            con.execute(
                "INSERT INTO purchase_portfolios (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                [p.id, p.name]
            )
        for lot in payload.individualPurchases:
            con.execute(
                """
                INSERT INTO individual_purchases 
                (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO NOTHING
                """,
                [lot.id, lot.portfolioId, lot.ticker, lot.date, lot.purchasePrice, lot.shares, lot.manualCurrentPrice]
            )
    return {"success": True, "migratedPortfolios": len(payload.purchasePortfolios), "migratedLots": len(payload.individualPurchases)}
