"""
Titanes Tech Portfolio — FastAPI backend entry point.
Run with:  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.nav import router as nav_router
from routers.prices import router as prices_router
from routers.rebalance import router as rebalance_router

app = FastAPI(
    title="Titanes Portfolio API",
    description="Custom ETF-style portfolio tracker for the 15 Tech Titans",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nav_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(rebalance_router, prefix="/api")


@app.get("/")
def root():
    return {
        "name": "Titanes Portfolio API",
        "docs": "/docs",
        "endpoints": ["/api/nav", "/api/prices/live", "/api/prices/intraday/{ticker}", "/api/tickers/search", "/api/rebalances"],
    }
