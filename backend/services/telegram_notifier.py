"""Telegram Notification Service for Titanes Portfolio.

Sends instant push notifications directly to Telegram for:
- Profit Target / Stop Loss sell alerts.
- Bank expense & income transaction audit notifications.
- System warnings and portfolio rebalance notifications.
"""

import html
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure .env is loaded
load_dotenv()

# Colombia Timezone (UTC-5)
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def get_telegram_config() -> dict[str, Any]:
    """Retrieve current Telegram bot credentials from environment."""
    load_dotenv(override=True)
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip().strip('"').strip("'")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip().strip('"').strip("'")
    enabled = bool(token and chat_id)
    return {
        "token": token,
        "chat_id": chat_id,
        "enabled": enabled,
    }


def send_telegram_message(
    text: str,
    parse_mode: str = "HTML",
    disable_notification: bool = False,
) -> bool:
    """Send an arbitrary text message to the configured Telegram chat."""
    config = get_telegram_config()
    if not config["enabled"]:
        logger.debug("[TELEGRAM] Notifier disabled (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing).")
        return False

    url = f"https://api.telegram.org/bot{config['token']}/sendMessage"
    payload = {
        "chat_id": config["chat_id"],
        "text": text,
        "parse_mode": parse_mode,
        "disable_notification": disable_notification,
    }

    try:
        resp = requests.post(url, json=payload, timeout=8)
        if resp.status_code == 200:
            logger.info(f"[TELEGRAM] Notification sent successfully to chat {config['chat_id']}.")
            return True
        logger.error(f"[TELEGRAM] API error ({resp.status_code}): {resp.text}")
        return False
    except Exception as e:
        logger.error(f"[TELEGRAM] Failed to send message: {e}")
        return False


def send_sell_alert_telegram(
    ticker: str,
    company_name: str,
    alert_type: str,
    target_value: float,
    current_return_pct: float,
    current_price: float,
    entry_price: float,
    scope_title: str = "Titanes Portfolio",
) -> bool:
    """Format and dispatch a high-priority Stock Sell Alert to Telegram."""
    is_profit = alert_type == "PROFIT_TARGET" or current_return_pct >= 0
    now_str = datetime.now(COLOMBIA_TZ).strftime("%d/%m/%Y %I:%M %p")

    clean_ticker = html.escape(ticker.split("::")[0])
    clean_company = html.escape(company_name or clean_ticker)
    clean_scope = html.escape(scope_title)

    if is_profit:
        header = "🎯 <b>OBJETIVO DE GANANCIA ALCANZADO</b>"
        action = "💡 <i>Sugerencia:</i> Considera toma de beneficios (venta parcial o total)."
        badge = "🟢"
    else:
        header = "🛑 <b>LÍMITE STOP LOSS ACTIVADO</b>"
        action = "⚠️ <i>Sugerencia:</i> Control de riesgo preventivo (revisar posición)."
        badge = "🔴"

    return_sign = "+" if current_return_pct >= 0 else ""
    target_sign = "+" if target_value >= 0 else ""

    message = (
        f"{header}\n\n"
        f"📊 <b>Activo:</b> {clean_ticker} ({clean_company})\n"
        f"📁 <b>Estrategia:</b> {clean_scope}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{badge} <b>Retorno Actual:</b> <code>{return_sign}{current_return_pct:.2f}%</code>\n"
        f"🎯 <b>Objetivo Configurado:</b> <code>{target_sign}{target_value:.2f}%</code>\n"
        f"💵 <b>Precio Actual:</b> <code>${current_price:,.2f} USD</code>\n"
        f"📥 <b>Precio de Entrada:</b> <code>${entry_price:,.2f} USD</code>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{action}\n\n"
        f"🕒 <i>{now_str} (Colombia)</i>"
    )

    return send_telegram_message(message, parse_mode="HTML")


def send_test_telegram() -> dict[str, Any]:
    """Test function to verify bot token and chat ID connectivity."""
    config = get_telegram_config()
    if not config["enabled"]:
        return {
            "success": False,
            "error": "Faltan credenciales: define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en tu archivo .env",
        }

    now_str = datetime.now(COLOMBIA_TZ).strftime("%d/%m/%Y %I:%M %p")
    test_msg = (
        "⚡ <b>Titanes Portfolio - Notificación de Prueba</b> ⚡\n\n"
        "✅ ¡Conexión con el bot de Telegram establecida con éxito!\n"
        f"📲 Recibirás aquí tus alarmas de Take-Profit y Stop-Loss.\n\n"
        f"🕒 <i>{now_str}</i>"
    )
    ok = send_telegram_message(test_msg, parse_mode="HTML")
    return {
        "success": ok,
        "chat_id": config["chat_id"],
        "message": "Mensaje de prueba enviado a Telegram" if ok else "Error al enviar mensaje. Revisa el Token o Chat ID.",
    }
