"""
Titanes Tech Portfolio — FastAPI backend entry point.
Run with:  uvicorn main:app --reload --port 8000
"""

import os
import traceback
import warnings

# Suppress ALL noisy DeprecationWarnings (from pandas, yfinance, etc)
warnings.simplefilter("ignore", DeprecationWarning)
warnings.filterwarnings("ignore")

import warnings

warnings.simplefilter("ignore", DeprecationWarning)
warnings.simplefilter("ignore", FutureWarning)

import os
import certifi

os.environ["CURL_CA_BUNDLE"] = certifi.where()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers.nav import router as nav_router
from routers.prices import router as prices_router
from routers.rebalance import router as rebalance_router
from routers.purchases import router as purchases_router
from routers.fixed_income import router as fixed_income_router

app = FastAPI(
    title="Titanes Portfolio API",
    description="Custom ETF-style portfolio tracker for the 15 Tech Titans",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Captura cualquier excepción y extrae únicamente la línea de código del proyecto
    donde ocurrió el error (sin contaminar con librerías externas o uvicorn).
    """
    tb_list = traceback.extract_tb(exc.__traceback__)
    # Filtramos únicamente los archivos del proyecto (excluyendo site-packages, uvicorn, etc.)
    project_frames = [
        frame
        for frame in tb_list
        if not any(
            pkg in frame.filename
            for pkg in [
                "site-packages",
                "uvicorn",
                "starlette",
                "fastapi",
                "anyio",
                "asyncio",
                "Lib",
            ]
        )
    ]

    target_frame = project_frames[-1] if project_frames else (tb_list[-1] if tb_list else None)

    file_rel = os.path.relpath(target_frame.filename) if target_frame else "unknown"
    line_no = target_frame.lineno if target_frame else 0
    code_line = target_frame.line if target_frame else ""
    func_name = target_frame.name if target_frame else ""

    error_payload = {
        "error": True,
        "error_type": type(exc).__name__,
        "message": str(exc),
        "file": file_rel.replace("\\", "/"),
        "line": line_no,
        "code": code_line,
        "function": func_name,
    }

    return JSONResponse(status_code=500, content=error_payload)


app.include_router(nav_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(rebalance_router, prefix="/api")
app.include_router(purchases_router, prefix="/api")
app.include_router(fixed_income_router, prefix="/api/fixed-income", tags=["fixed-income"])


@app.get("/")
def root():
    return {
        "name": "Titanes Portfolio API",
        "docs": "/docs",
        "endpoints": [
            "/api/nav",
            "/api/prices/live",
            "/api/prices/intraday/{ticker}",
            "/api/tickers/search",
            "/api/rebalances",
        ],
    }
