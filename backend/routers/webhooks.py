"""Mobile Webhooks Router for Titanes Portfolio.

Automates bank expense and income registration triggered by Android automation tools
(e.g., MacroDroid, Tasker) via secure webhook endpoints.
Updates account balances, registers transactions in DuckDB and fixed_income.json,
and keeps the dual database in perfect sync.
"""

import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from routers.cash_flow import load_cash_flow_db, save_cash_flow_db
from routers.fixed_income import OWNER_ID, load_fixed_income_db, save_fixed_income_db

# Ensure environment variables are loaded
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger("webhooks")
router = APIRouter()

# Timezone Colombia (UTC-5)
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def get_current_colombia_time() -> datetime:
    return datetime.now(COLOMBIA_TZ)


def normalize_text(text: str | None) -> str:
    """Normalize text removing accents, punctuation, and lowering for robust matching."""
    if not text:
        return ""
    text_str = str(text).lower().strip()
    return "".join(
        c for c in unicodedata.normalize("NFD", text_str)
        if unicodedata.category(c) != "Mn"
    )


def parse_cop_amount(val: Any) -> float:
    """Safely parse Colombian currency representations into positive float.

    Handles:
      - 35000 -> 35000.0
      - "$35.000" -> 35000.0 (Colombian thousand separator)
      - "1.250.000,50" -> 1250000.5
      - "$ 45,000" -> 45000.0
      - 45000.5 -> 45000.5
    """
    if isinstance(val, (int, float)):
        return abs(float(val))
    if not isinstance(val, str):
        return 0.0

    s = val.replace("$", "").replace("COP", "").replace("cop", "").strip()

    # Comma and dot both present: 1.250.000,50 -> 1250000.50
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            s = parts[0].replace(".", "") + "." + parts[1]
        else:
            s = s.replace(",", "")
    elif "." in s:
        parts = s.split(".")
        # If last part has 3 digits or there are multiple dots, it's thousands separator
        if len(parts[-1]) == 3 or len(parts) > 2:
            s = s.replace(".", "")

    cleaned = re.sub(r"[^\d.]", "", s)
    try:
        return abs(float(cleaned)) if cleaned else 0.0
    except ValueError:
        return 0.0


def verify_secret_auth(
    token: str | None = None,
    secret: str | None = None,
    x_webhook_secret: str | None = None,
    authorization: str | None = None,
) -> bool:
    """Verify webhook authentication against WEBHOOK_SECRET_KEY in environment."""
    expected_secret = os.getenv("WEBHOOK_SECRET_KEY", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
    if not expected_secret:
        logger.error("[Webhook Auth] WEBHOOK_SECRET_KEY is not defined in environment variables.")
        raise HTTPException(status_code=500, detail="Server configuration error: WEBHOOK_SECRET_KEY is missing.")

    candidate = None
    if x_webhook_secret:
        candidate = x_webhook_secret.strip()
    elif authorization:
        parts = authorization.strip().split()
        candidate = parts[-1] if len(parts) > 1 else parts[0]
    elif token:
        candidate = token.strip()
    elif secret:
        candidate = secret.strip()

    if not candidate or candidate != expected_secret.strip():
        logger.warning(f"[Webhook Auth] Unauthorized attempt. Received: '{candidate}'")
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing webhook authentication key.",
        )
    return True


# --- Models ---


class MobileTransactionPayload(BaseModel):
    entity: str = Field(..., description="Entity name or ID (e.g. 'Nu Colombia', 'Nu', 'RappiPay', 'Caja Social')")
    account: str = Field(..., description="Account or pocket name/id (e.g. 'acc_viaje', 'Viaje', 'Estudios', 'Principal')")
    amount: Any = Field(..., description="Amount (e.g. 45000, '$45.000', 35000.5)")
    description: str = Field(..., description="Commerce or transaction description (e.g. 'Éxito', 'Uber', 'D1')")
    type: str = Field("debit", description="Transaction type: 'debit' (gasto/compra) or 'credit' (ingreso/abono)")
    date: str | None = Field(None, description="Date in YYYY-MM-DD or ISO format. Defaults to current date in Colombia")
    category: str | None = Field(None, description="Optional category (e.g. 'Alimentación', 'Transporte')")
    raw_text: str | None = Field(None, description="Raw notification body from Android for logging/audit")
    user_id: str | None = Field(None, description="Target user ID (defaults to OWNER_ID)")


# --- Resolution Helpers ---


def resolve_entity(db: dict[str, Any], entity_query: str) -> dict[str, Any]:
    """Finds an existing entity by ID or name (including common aliases), or auto-creates it."""
    eq_norm = normalize_text(entity_query)
    entities = db.get("entities", [])

    # Common aliases mapping
    alias_map = {
        "nu": "Nu Colombia",
        "nubank": "Nu Colombia",
        "cuenta nu": "Nu Colombia",
        "tarjeta nu": "Nu Colombia",
        "rappi": "RappiPay",
        "rappipay": "RappiPay",
        "davivienda rappi": "RappiPay",
        "finandina": "Finandina",
        "banco finandina": "Finandina",
        "caja social": "Banco Caja Social",
        "banco caja social": "Banco Caja Social",
        "bcs": "Banco Caja Social",
        "plenti": "Plenti (Ahorros)",
        "pibank": "Pibank",
        "lulo": "Lulo Bank",
        "lulo bank": "Lulo Bank",
        "google wallet": "Google Wallet",
        "billetera de google": "Google Wallet",
        "google pay": "Google Wallet",
        "gpay": "Google Wallet",
        "nequi": "Nequi Colombia",
        "nequi colombia": "Nequi Colombia",
    }

    resolved_name = alias_map.get(eq_norm, entity_query.strip())
    resolved_norm = normalize_text(resolved_name)

    # 1. Search exact ID or normalized name
    for e in entities:
        if normalize_text(e.get("id")) == eq_norm or normalize_text(e.get("name")) == resolved_norm:
            return e

    # 2. Substring matching
    for e in entities:
        e_norm = normalize_text(e.get("name"))
        if resolved_norm in e_norm or e_norm in resolved_norm:
            return e

    # 3. Not found -> auto-create new entity so expense is never discarded
    clean_id_suffix = re.sub(r"[^a-z0-9]", "", resolved_norm)[:12] or "bank"
    new_entity_id = f"ent_{clean_id_suffix}_{uuid.uuid4().hex[:4]}"
    new_entity = {
        "id": new_entity_id,
        "name": resolved_name,
        "country": "🇨🇴",
        "color": "#3b82f6",
        "icon": "🏦",
        "createdAt": get_current_colombia_time().isoformat(),
    }
    entities.append(new_entity)
    db["entities"] = entities
    logger.info(f"[Webhook] Auto-created new entity: {new_entity}")
    return new_entity


def clean_account_query(query: str) -> str:
    """Clean selection strings from interactive dialogs (strip emojis, balances, bank prefixes)."""
    if not query:
        return ""
    # Strip common leading emojis and icons
    s = re.sub(r"^[^\w\s]+", "", query).strip()
    # Remove trailing balance like ($119,257) or ($0)
    s = re.sub(r"\s*\(\$[\d\.,]+\)\s*$", "", s).strip()
    # Remove bank prefix like "Nu - " or "Rappi: "
    if " - " in s:
        s = s.split(" - ", 1)[1].strip()
    elif ": " in s:
        s = s.split(": ", 1)[1].strip()
    return s.strip()


def resolve_account(db: dict[str, Any], entity: dict[str, Any], account_query: str) -> dict[str, Any]:
    """Finds an existing account/pocket belonging to the entity or globally, or auto-creates it."""
    cleaned_query = clean_account_query(account_query)
    aq_norm = normalize_text(cleaned_query)
    accounts = db.get("accounts", [])
    entity_id = entity.get("id")

    # Filter candidate accounts for this entity first
    candidate_accounts = [a for a in accounts if a.get("entityId") == entity_id]

    # 0. Check if account_query is a numeric index from dialog (e.g. "1", "2", "3")
    if cleaned_query.isdigit():
        idx = int(cleaned_query)
        if idx == 1:
            for a in candidate_accounts:
                if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"]):
                    return a
            # Will be auto-created below as Cuenta Nómina / Principal
            cleaned_query = "Cuenta Nómina / Principal"
            aq_norm = normalize_text(cleaned_query)
        else:
            pockets = [
                a for a in candidate_accounts
                if not any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"])
            ]
            pocket_idx = idx - 2
            if 0 <= pocket_idx < len(pockets):
                return pockets[pocket_idx]

    # 1. Check exact ID match in entity accounts
    for a in candidate_accounts:
        if a.get("id") == account_query or a.get("id") == cleaned_query:
            return a

    # 2. Check exact name match in entity accounts
    for a in candidate_accounts:
        if normalize_text(a.get("name")) == aq_norm:
            return a

    # 3. Check substring match in entity accounts (e.g. "viaje" in "Cajita Viaje")
    for a in candidate_accounts:
        a_norm = normalize_text(a.get("name"))
        if aq_norm in a_norm or a_norm in aq_norm:
            return a

    # 4. Check if requesting salary / principal account
    is_main_account = any(k in aq_norm for k in ["principal", "nomina", "ahorros", "cuenta"])
    if is_main_account:
        for a in candidate_accounts:
            if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"]):
                return a

    # 5. Fallback search across all accounts if entity filter was too strict
    for a in accounts:
        if a.get("id") == account_query or normalize_text(a.get("name")) == aq_norm:
            return a

    # 6. Account not found -> Auto-create account under this entity
    clean_name = "Cuenta Nómina / Principal" if is_main_account else cleaned_query
    new_acc_id = f"acc_{re.sub(r'[^a-z0-9]', '', aq_norm)[:10]}_{uuid.uuid4().hex[:4]}"
    new_account = {
        "id": new_acc_id,
        "entityId": entity_id,
        "name": clean_name if clean_name else "Cuenta Principal",
        "type": "savings" if is_main_account else "pocket",
        "currency": "COP",
        "balance": 0.0,
        "interestRateEA": 12.0,
        "isTaxExemptGMF": True,
        "rateHistory": [
            {
                "date": get_current_colombia_time().strftime("%Y-%m-%d"),
                "rateEA": 12.0,
            }
        ],
        "createdAt": get_current_colombia_time().isoformat(),
    }
    accounts.append(new_account)
    db["accounts"] = accounts
    logger.info(f"[Webhook] Auto-created new account: {new_account}")
    return new_account


# --- Endpoints ---


@router.get("/health")
def webhook_health(
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
):
    """Healthcheck endpoint to verify endpoint status and authentication from mobile."""
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    now_col = get_current_colombia_time()
    return {
        "status": "healthy",
        "service": "Titanes Portfolio Mobile Webhooks",
        "server_time_colombia": now_col.isoformat(),
    }


@router.get("/mobile-accounts")
def list_mobile_accounts(
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
    user_id: str | None = Query(None),
):
    """Returns available entities and their pockets/accounts with balances.

    Ideal for setting up MacroDroid variables and interactive dialog options.
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    effective_uid = user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    entities = db.get("entities", [])
    accounts = db.get("accounts", [])

    grouped = []
    for ent in entities:
        ent_accounts = [
            {
                "id": acc.get("id"),
                "name": acc.get("name"),
                "type": acc.get("type", "savings"),
                "balance": acc.get("balance", 0.0),
                "currency": acc.get("currency", "COP"),
            }
            for acc in accounts
            if acc.get("entityId") == ent.get("id")
        ]
        grouped.append({
            "id": ent.get("id"),
            "name": ent.get("name"),
            "country": ent.get("country", "🇨🇴"),
            "icon": ent.get("icon", "🏦"),
            "accounts": ent_accounts,
        })

    return {
        "success": True,
        "total_entities": len(entities),
        "total_accounts": len(accounts),
        "entities": grouped,
    }


@router.get("/mobile-pockets")
def get_mobile_pockets(
    bank: str | None = Query(None, description="Bank or entity name (Nu, Rappi, Caja Social, Google Wallet, etc.)"),
    tx_type: str = Query("debit", description="Transaction type: 'debit' (gasto) or 'credit' (ingreso)"),
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
    user_id: str | None = Query(None),
):
    """Dynamically returns available accounts and pockets formatted for MacroDroid interactive dialogs.

    - Prioritizes 'Cuenta Nómina / Principal'
    - Follows with active savings pockets (Cajitas) with live balances
    - Provides ready-to-use array ('pockets') and CSV string ('pockets_csv')
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    effective_uid = user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    entities = db.get("entities", [])
    accounts = db.get("accounts", [])

    is_all_banks = not bank or normalize_text(bank) in (
        "all", "todas", "todos", "google wallet", "billetera de google", "google pay", "gpay"
    )

    if not is_all_banks:
        matched_entity = resolve_entity(db, bank)
        ent_id = matched_entity.get("id")
        ent_accounts = [a for a in accounts if a.get("entityId") == ent_id]

        # Prioritize Nómina / Principal
        principal_acc = next(
            (a for a in ent_accounts if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"])),
            None
        )

        pockets_list = []
        clean_names = []

        ent_clean_name = matched_entity.get("name", "")
        if "nu" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta Nu Débito (Nómina)"
        elif "rappi" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta Rappi (Principal)"
        elif "finandina" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta Finandina (Principal)"
        else:
            default_main_label = f"Cuenta {ent_clean_name} (Principal)"

        # 1. Main / Salary account first
        if principal_acc:
            pockets_list.append(f"⭐ {principal_acc['name']} (${principal_acc.get('balance', 0):,.0f})")
            clean_names.append(principal_acc["name"])
        else:
            pockets_list.append(f"⭐ {default_main_label} ($0)")
            clean_names.append(default_main_label)

        # 2. Pockets (Cajitas)
        for a in ent_accounts:
            if principal_acc and a.get("id") == principal_acc.get("id"):
                continue
            bal = a.get("balance", 0.0)
            pockets_list.append(f"📦 {a['name']} (${bal:,.0f})")
            clean_names.append(a["name"])

        # 3. Cancel / Ignore option
        pockets_list.append("❌ Ignorar / Cancelar")
        clean_names.append("Ignorar / Cancelar")

        return {
            "success": True,
            "entity": {
                "id": matched_entity.get("id"),
                "name": matched_entity.get("name"),
            },
            "tx_type": tx_type,
            "pockets": pockets_list,
            "pocket_names": clean_names,
            "pockets_csv": ",".join(clean_names),
        }

    # All banks / Google Wallet fallback
    all_pockets = []
    all_names = []
    for ent in entities:
        short_bank = ent.get("name", "").replace("Colombia", "").replace("(Ahorros)", "").strip()
        ent_accs = [a for a in accounts if a.get("entityId") == ent.get("id")]
        for a in ent_accs:
            bal = a.get("balance", 0.0)
            all_pockets.append(f"{short_bank}: {a['name']} (${bal:,.0f})")
            all_names.append(f"{short_bank} - {a['name']}")

    all_pockets.append("❌ Ignorar / Cancelar")
    all_names.append("Ignorar / Cancelar")

    return {
        "success": True,
        "entity": {
            "id": "all",
            "name": "Billetera de Google / Múltiples Bancos",
        },
        "tx_type": tx_type,
        "pockets": all_pockets,
        "pocket_names": all_names,
        "pockets_csv": ",".join(all_names),
    }


@router.post("/mobile-transaction")
def register_mobile_transaction(
    payload: MobileTransactionPayload,
    request: Request,
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
):
    """Register mobile bank transaction from Android automation (MacroDroid).

    - Authenticated via WEBHOOK_SECRET_KEY
    - Deducts (or increases) account balance
    - Appends transaction to DuckDB, PostgreSQL, and JSON
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)

    effective_uid = payload.user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    # 1. Parse amount
    amount_val = parse_cop_amount(payload.amount)
    if amount_val <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Monto inválido o no detectable: '{payload.amount}'",
        )

    # 2. Determine transaction type (debit vs credit) with smart keyword detection
    norm_type = normalize_text(payload.type)
    search_context = f"{payload.description} {payload.raw_text or ''}".lower()
    credit_keywords = [
        "recibiste", "te transfirieron", "abono", "consignacion",
        "consignación", "nomina", "nómina", "devolucion", "devolución", "pago recibido"
    ]

    if any(k in norm_type for k in ["credit", "ingreso", "abono", "entrada", "consignacion"]) or any(k in search_context for k in credit_keywords):
        tx_type = "credit"
        signed_amount = amount_val
    else:
        tx_type = "debit"
        signed_amount = -amount_val

    # 2b. Auto-correct entity if notification text clearly belongs to another bank
    if any(k in search_context for k in ["rappicuenta", "rappipay", "rappi"]):
        if "rappi" not in normalize_text(payload.entity):
            logger.info(f"[Webhook] Auto-correcting entity from '{payload.entity}' to 'RappiPay' based on notification text.")
            payload.entity = "RappiPay"
    elif any(k in search_context for k in ["nubank", "cuenta nu", "tarjeta nu"]):
        if "nu" not in normalize_text(payload.entity):
            logger.info(f"[Webhook] Auto-correcting entity from '{payload.entity}' to 'Nu Colombia' based on notification text.")
            payload.entity = "Nu Colombia"

    # If entity is Google Wallet, resolve bank from card mention in notification text
    if normalize_text(payload.entity) in ("google wallet", "billetera de google", "google pay", "gpay"):
        for bank_alias, target_bank in [
            ("nu", "Nu Colombia"),
            ("rappi", "RappiPay"),
            ("caja social", "Banco Caja Social"),
            ("finandina", "Finandina"),
            ("plenti", "Plenti (Ahorros)"),
            ("nequi", "Nequi Colombia"),
        ]:
            if bank_alias in search_context:
                payload.entity = target_bank
                break

    # 3. Resolve Entity and Account
    entity = resolve_entity(db, payload.entity)
    account = resolve_account(db, entity, payload.account)

    # 4. Resolve date (America/Bogota timezone)
    now_colombia = get_current_colombia_time()
    if payload.date:
        # Extract YYYY-MM-DD
        tx_date = payload.date.split("T")[0]
    else:
        tx_date = now_colombia.strftime("%Y-%m-%d")

    # 5. Update Account Balance
    previous_balance = float(account.get("balance", 0.0))
    new_balance = round(previous_balance + signed_amount, 2)
    account["balance"] = new_balance

    # Update account in db list
    for idx, a in enumerate(db.get("accounts", [])):
        if a.get("id") == account.get("id"):
            db["accounts"][idx]["balance"] = new_balance
            break

    # 6. Create Transaction Object
    tx_id = f"tx_mb_{int(now_colombia.timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
    clean_desc = payload.description.strip()
    generic_phrases = ["en tus movimientos el detalle", "fue exitoso", "revisa en tus movimientos", "movimientos el detalle"]
    if any(p in clean_desc.lower() for p in generic_phrases) or not clean_desc:
        m_via = re.search(r"a través de\s+([A-Za-z0-9\-\s]+?)(?:fue exitoso|\.|\.\.\.|$)", payload.raw_text or "", re.IGNORECASE)
        if m_via:
            clean_desc = f"Envío {m_via.group(1).strip()}"
        elif "rappicuenta" in search_context:
            clean_desc = "Transferencia RappiCuenta"
        else:
            clean_desc = "Gasto bancario" if tx_type == "debit" else "Abono bancario"

    new_tx = {
        "id": tx_id,
        "accountId": account["id"],
        "entityId": entity["id"],
        "date": tx_date,
        "description": clean_desc,
        "amount": signed_amount,
        "currency": account.get("currency", "COP"),
        "type": tx_type,
        "category": payload.category or "Gasto Móvil",
        "source": "macrodroid_webhook",
        "rawText": payload.raw_text or "",
        "createdAt": now_colombia.isoformat(),
    }

    if "transactions" not in db or not isinstance(db["transactions"], list):
        db["transactions"] = []

    # Insert at top of transactions list
    db["transactions"].insert(0, new_tx)

    # 7. Persist to DuckDB, Postgres, and JSON (Fixed Income)
    save_fixed_income_db(db, effective_uid)

    # 8. Dual-sync to Cash Flow expensesLog (for real-time monthly budget tracking)
    cf_synced = False
    try:
        cf = load_cash_flow_db(effective_uid)
        if "expensesLog" not in cf or not isinstance(cf["expensesLog"], list):
            cf["expensesLog"] = []

        active_period = cf.get("activePeriod") or tx_date[:7]
        is_payroll = any(k in normalize_text(account.get("name")) for k in ["nomina", "principal", "ahorros", "debito"])

        cf_tx = {
            "id": f"cf_{tx_id}",
            "period": active_period,
            "budgetItemId": None,
            "budgetItemName": clean_desc,
            "budgetItemType": "needs" if tx_type == "debit" else "income",
            "description": clean_desc,
            "amount": amount_val,
            "currency": account.get("currency", "COP"),
            "date": tx_date,
            "type": tx_type,
            "paymentSource": {
                "type": "payroll" if is_payroll else "fixed_pocket",
                "targetId": account.get("id"),
                "targetName": account.get("name"),
            },
            "createdAt": now_colombia.isoformat(),
        }
        cf["expensesLog"].insert(0, cf_tx)
        save_cash_flow_db(cf, effective_uid)
        cf_synced = True
        logger.info(f"[Webhook] Dual-synced transaction {tx_id} to Cash Flow expensesLog (period {active_period}).")
    except Exception as e:
        logger.error(f"[Webhook] Failed to dual-sync to Cash Flow: {e}")

    logger.info(
        f"[Webhook] Successfully registered {tx_type.upper()} tx {tx_id}: "
        f"{signed_amount:,.2f} COP in '{account['name']}' ({entity['name']}). "
        f"Balance: {previous_balance:,.2f} -> {new_balance:,.2f} COP"
    )

    action_label = "descontado" if tx_type == "debit" else "abonado"

    return {
        "success": True,
        "message": (
            f"Se ha {action_label} exitosamente ${abs(signed_amount):,.2f} COP "
            f"en '{account['name']}' ({entity['name']})."
        ),
        "tx_id": tx_id,
        "entity": {
            "id": entity["id"],
            "name": entity["name"],
        },
        "account": {
            "id": account["id"],
            "name": account["name"],
            "previous_balance": previous_balance,
            "new_balance": new_balance,
            "currency": account.get("currency", "COP"),
        },
        "transaction": new_tx,
        "cash_flow_synced": cf_synced,
        "timestamp": now_colombia.isoformat(),
    }
