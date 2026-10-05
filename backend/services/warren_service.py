"""
WarrenAI Prompt Generator & Analysis Service.
Gathers cross-portfolio investment data (Titanes, Purchases, Fixed Income, Cash Flow),
uses Ollama to synthesize a specialized, high-context prompt tailored for WarrenAI (Investing.com ProPicks),
and provides copy-to-clipboard or direct CLI interaction.
"""

import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional
from datetime import datetime

from services.db import get_connection
from services.market_data import get_live_quotes

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_OLLAMA_MODEL = os.getenv("WARREN_OLLAMA_MODEL", "qwen2.5-coder:14b")


def query_ollama(prompt: str, system: Optional[str] = None, model: str = DEFAULT_OLLAMA_MODEL) -> str:
    """Send request to local Ollama instance."""
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.4,
            "num_predict": 1500,
        }
    }
    if system:
        payload["system"] = system

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "").strip()
    except Exception as e:
        logger.error(f"[WARREN_AI] Ollama query failed: {e}")
        return ""


def get_all_investments_summary(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts all investment categories registered in the platform:
    1. Purchases portfolios and lots (active stocks, shares, cost basis, return)
    2. Titanes & Custom Strategies (current active allocations, slots)
    3. Fixed income accounts & CDTs
    """
    effective_user_id = user_id or "usr_9487dd2209d2"
    result: Dict[str, Any] = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "purchases_portfolios": [],
        "titanes_holdings": [],
        "custom_strategies": [],
        "fixed_income_summary": {},
    }

    with get_connection() as con:
        # 1. Individual Purchases Portfolios
        try:
            portfolios = con.execute(
                "SELECT id, name, asset_currency FROM purchase_portfolios WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()

            lots = con.execute(
                "SELECT portfolio_id, ticker, purchase_price, shares, date FROM individual_purchases WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()

            # Group lots by portfolio
            p_map: Dict[str, Dict[str, Any]] = {}
            all_tickers = set()
            for p in portfolios:
                p_map[p[0]] = {
                    "id": p[0],
                    "name": p[1],
                    "currency": p[2] or "USD",
                    "lots": [],
                }

            for lot in lots:
                pid, ticker, price, shares, pdate = lot
                all_tickers.add(ticker.upper())
                if pid in p_map:
                    p_map[pid]["lots"].append({
                        "ticker": ticker.upper(),
                        "shares": shares,
                        "buy_price": price,
                        "date": str(pdate),
                        "cost": round(shares * price, 2)
                    })

            # Fetch live quotes for US/liquid tickers if desired, else use buy_price as current_price baseline
            live_quotes = {}
            # Quick check for prices already in cache or fast info without blocking
            if all_tickers:
                try:
                    # Only attempt live quote for non-exotic tickers or already cached
                    us_tickers = [t for t in all_tickers if not t.endswith(".L") and not t.endswith(".F")]
                    if us_tickers:
                        q_list = get_live_quotes(us_tickers)
                        for q in q_list:
                            if q.get("ticker"):
                                live_quotes[q["ticker"].upper()] = q
                except Exception as q_err:
                    logger.warning(f"Live quotes fetch in warren service: {q_err}")

            # Calculate aggregated portfolio values
            summary_portfolios = []
            for p in p_map.values():
                total_invested = 0.0
                total_current = 0.0
                ticker_summary = {}

                for l in p["lots"]:
                    t = l["ticker"]
                    cur_p = live_quotes.get(t, {}).get("price") or l["buy_price"]
                    chg_pct_1d = live_quotes.get(t, {}).get("change_pct", 0.0)
                    cost = l["cost"]
                    cur_val = l["shares"] * cur_p

                    total_invested += cost
                    total_current += cur_val

                    if t not in ticker_summary:
                        ticker_summary[t] = {
                            "ticker": t,
                            "shares": 0.0,
                            "total_cost": 0.0,
                            "current_price": cur_p,
                            "change_pct_1d": chg_pct_1d,
                        }
                    ticker_summary[t]["shares"] += l["shares"]
                    ticker_summary[t]["total_cost"] += cost

                for t, info in ticker_summary.items():
                    avg_p = info["total_cost"] / info["shares"] if info["shares"] > 0 else 0
                    info["avg_price"] = round(avg_p, 2)
                    info["shares"] = round(info["shares"], 4)
                    info["current_value"] = round(info["shares"] * info["current_price"], 2)
                    ret_usd = info["current_value"] - info["total_cost"]
                    info["return_pct"] = round((ret_usd / info["total_cost"] * 100), 2) if info["total_cost"] > 0 else 0.0

                summary_portfolios.append({
                    "id": p["id"],
                    "name": p["name"],
                    "currency": p["currency"],
                    "total_invested": round(total_invested, 2),
                    "total_current_value": round(total_current, 2),
                    "total_return_pct": round(((total_current - total_invested) / total_invested * 100), 2) if total_invested > 0 else 0.0,
                    "positions": list(ticker_summary.values()),
                })

            result["purchases_portfolios"] = summary_portfolios
        except Exception as e:
            logger.error(f"[WARREN_AI] Error reading purchases: {e}")

        # 2. Rebalance Titanes & Custom Strategies
        try:
            strats = con.execute(
                "SELECT id, name, capital, num_slots, benchmark, is_real_money FROM custom_strategies WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()
            for s in strats:
                result["custom_strategies"].append({
                    "id": s[0],
                    "name": s[1],
                    "capital": s[2],
                    "slots": s[3],
                    "benchmark": s[4],
                    "is_real_money": bool(s[5]),
                })
        except Exception:
            pass

    # 3. Fixed income summary
    fixed_income_file = os.path.join(os.path.dirname(__file__), "..", "data", "fixed_income.json")
    if os.path.exists(fixed_income_file):
        try:
            with open(fixed_income_file, "r", encoding="utf-8") as f:
                fi_data = json.load(f)
                cdts = fi_data.get("cdts", [])
                accounts = fi_data.get("accounts", [])
                total_cdt = sum(c.get("initialAmount", 0) for c in cdts)
                total_savings = sum(a.get("balance", 0) for a in accounts)
                result["fixed_income_summary"] = {
                    "total_cdts_capital": total_cdt,
                    "num_cdts": len(cdts),
                    "total_savings_accounts": total_savings,
                    "num_accounts": len(accounts),
                }
        except Exception:
            pass

    return result


def build_raw_context_text(data: Dict[str, Any]) -> str:
    """Builds a concise markdown context of the investor's whole portfolio."""
    lines = []
    lines.append(f"### FECHA Y HORA: {data.get('date')}")
    lines.append("")
    lines.append("### 1. PORTAFOLIOS DE COMPRAS REALES:")
    for p in data.get("purchases_portfolios", []):
        lines.append(f"**Portafolio: {p['name']}** (Moneda: {p['currency']})")
        lines.append(f"- Capital Invertido: ${p['total_invested']} | Valor Actual: ${p['total_current_value']} | Rendimiento: {p['total_return_pct']}%")
        lines.append("  Posiciones:")
        for pos in p.get("positions", []):
            lines.append(
                f"  * {pos['ticker']}: {pos['shares']} acciones @ Precio Medio ${pos['avg_price']} | "
                f"Precio Actual: ${pos['current_price']} | Hoy (24h): {pos.get('change_pct_1d', 0)}% | Retorno Total: {pos['return_pct']}%"
            )
        lines.append("")

    if data.get("custom_strategies"):
        lines.append("### 2. ESTRATEGIAS CUANTITATIVAS (PROPICKS / TITANES):")
        for s in data["custom_strategies"]:
            lines.append(f"- {s['name']}: Capital ${s['capital']} ({s['slots']} slots) | Benchmark: {s['benchmark']} | Dinero Real: {'Sí' if s['is_real_money'] else 'Simulado'}")
        lines.append("")

    fi = data.get("fixed_income_summary", {})
    if fi:
        lines.append("### 3. RENTA FIJA Y LIQUIDEZ (COLOMBIA / CDTs):")
        lines.append(f"- En CDTs a Plazo Fijo: ${fi.get('total_cdts_capital', 0):,.0f} COP ({fi.get('num_cdts', 0)} depósitos)")
        lines.append(f"- En Cuentas de Ahorro de Alto Rendimiento: ${fi.get('total_savings_accounts', 0):,.0f} COP ({fi.get('num_accounts', 0)} cuentas)")

    return "\n".join(lines)


def generate_warren_prompt(
    focus: Optional[str] = None,
    user_question: Optional[str] = None,
    user_id: Optional[str] = None,
    use_ollama: bool = True,
    ollama_model: str = DEFAULT_OLLAMA_MODEL,
) -> Dict[str, Any]:
    """
    Generates an optimized prompt ready to copy-paste into WarrenAI (Investing.com ProPicks).
    Uses Ollama to analyze and format it with ProPicks valuation criteria (Fair Value, ProTips, Health Score, Momentum).
    """
    portfolio_data = get_all_investments_summary(user_id=user_id)
    raw_context = build_raw_context_text(portfolio_data)

    if not use_ollama:
        # Fallback to high-quality template if Ollama is disabled or unreachable
        direct_prompt = (
            "Hola WarrenAI. Eres el analista cuantitativo de Investing.com y ProPicks AI. "
            "A continuación te presento la totalidad de mis inversiones actuales registradas en mi plataforma privada "
            "(incluyendo compras individuales, estrategias cuantitativas y renta fija). "
            "Por favor realiza un análisis profundo evaluando para cada acción su Fair Value (Valor Razonable de InvestingPro), "
            "su Puntuación de Salud Financiera (Financial Health Score), ProTips clave y si los movimientos recientes "
            "(incluyendo saltos bruscos recientes) sugieren mantener, tomar ganancias o rebalancear.\n\n"
            f"=== DATOS DE MI PORTAFOLIO ===\n{raw_context}\n\n"
        )
        if user_question:
            direct_prompt += f"=== PREGUNTA ESPECÍFICA ===\n{user_question}\n"
        return {
            "status": "success",
            "model_used": "template_fallback",
            "prompt_for_warren": direct_prompt,
            "raw_context": raw_context,
            "portfolio_summary": portfolio_data,
        }

    # System instruction for Ollama to construct the perfect prompt for WarrenAI
    system_prompt = (
        "Eres un arquitecto de prompts financiero de élite. Tu objetivo es redactar un prompt estructurado, "
        "exhaustivo y profesional en ESPAÑOL dirigido a 'WarrenAI' (la IA de Investing.com / InvestingPro / ProPicks). "
        "El prompt que redactes debe estar listo para que el usuario simplemente lo copie y pegue en el chat de WarrenAI de Investing.com. "
        "Debe pedirle a WarrenAI que aplique sus herramientas exclusivas: "
        "1. Fair Value (Valor Razonable InvestingPro basado en múltiplos de flujos descontados). "
        "2. Puntuación de Salud Financiera (Financial Health Score de 1 a 5). "
        "3. ProTips clave (dividendos, recompras, deuda, momentum). "
        "4. Evaluación de movimientos bruscos recientes (volatilidad y earnings). "
        "5. Recomendaciones de compra, venta o ajuste para optimizar el portafolio total frente a S&P 500 y NASDAQ. "
        "Devuelve ÚNICAMENTE el texto final del prompt para WarrenAI, sin introducciones tuyas."
    )

    user_instructions = (
        f"Genera el prompt definitivo para WarrenAI con los siguientes datos del usuario:\n\n"
        f"{raw_context}\n\n"
    )
    if focus:
        user_instructions += f"Enfoque solicitado: {focus}\n"
    if user_question:
        user_instructions += f"Pregunta específica del usuario: {user_question}\n"

    ollama_output = query_ollama(user_instructions, system=system_prompt, model=ollama_model)

    if not ollama_output:
        # Fallback if Ollama did not answer
        return generate_warren_prompt(focus, user_question, user_id, use_ollama=False)

    return {
        "status": "success",
        "model_used": ollama_model,
        "prompt_for_warren": ollama_output,
        "raw_context": raw_context,
        "portfolio_summary": portfolio_data,
    }
