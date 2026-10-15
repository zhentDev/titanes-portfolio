"""
Email Notification Service for Titanes Portfolio.
Sends beautiful HTML alert emails when stock positions hit profit targets or stop loss limits.
Supports standard SMTP (e.g. Gmail, Outlook, Amazon SES, Brevo, Sendgrid, Resend).
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)

# SMTP configuration via environment variables
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER or "alerts@titanes-portfolio.com")
SMTP_ENABLED = bool(SMTP_USER and SMTP_PASSWORD)


def send_sell_alert_email(
    to_email: str,
    ticker: str,
    company_name: str,
    alert_type: str,
    target_value: float,
    current_return_pct: float,
    current_price: float,
    entry_price: float,
    scope_title: str = "Titanes Tecnológicos",
) -> bool:
    """
    Sends an aesthetic HTML email notifying the user that a position reached its profit/stop-loss sell condition.
    """
    if not to_email:
        logger.warning("[EMAIL] Cannot send alert: recipient email is missing.")
        return False

    is_profit = alert_type == "PROFIT_TARGET" or current_return_pct >= 0
    badge_color = "#10b981" if is_profit else "#ef4444"
    badge_label = "🎯 OBJETIVO DE GANANCIA ALCANZADO" if is_profit else "🛑 LÍMITE STOP LOSS ACTIVADO"
    action_text = "sugerencia de toma de beneficio (Venta parcial o total)" if is_profit else "sugerencia de control de riesgo (Venta preventiva)"

    subject = f"{'🟢' if is_profit else '🔴'} Alerta de Venta: {ticker} ({'+' if current_return_pct >= 0 else ''}{current_return_pct:.2f}%) en {scope_title}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #0b0f19;
          color: #f1f5f9;
          margin: 0;
          padding: 24px;
        }}
        .container {{
          max-width: 580px;
          margin: 0 auto;
          background: #111827;
          border: 1px solid #1f2937;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }}
        .header {{
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          padding: 24px 28px;
          border-bottom: 1px solid #1e293b;
        }}
        .logo {{
          font-size: 1.1rem;
          font-weight: 800;
          color: #00e5ff;
          letter-spacing: -0.02em;
        }}
        .content {{
          padding: 28px;
        }}
        .badge {{
          display: inline-block;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #ffffff;
          background-color: {badge_color};
          margin-bottom: 16px;
        }}
        .ticker-row {{
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 6px;
        }}
        .ticker-title {{
          font-size: 1.8rem;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
        }}
        .company {{
          font-size: 0.95rem;
          color: #94a3b8;
          margin-bottom: 24px;
        }}
        .metrics-card {{
          background: #1a2234;
          border: 1px solid #283548;
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 24px;
        }}
        .metric-row {{
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #222f42;
          font-size: 0.88rem;
        }}
        .metric-row:last-child {{
          border-bottom: none;
        }}
        .metric-label {{
          color: #94a3b8;
        }}
        .metric-val {{
          font-family: 'JetBrains Mono', monospace, Courier;
          font-weight: 700;
          color: #ffffff;
        }}
        .metric-highlight {{
          color: {badge_color};
          font-size: 1.15rem;
          font-weight: 800;
        }}
        .footer {{
          padding: 20px 28px;
          background: #0d121f;
          border-top: 1px solid #1a2234;
          font-size: 0.75rem;
          color: #64748b;
          text-align: center;
        }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚡ Kpital Zhent • Alerta Automatizada</div>
        </div>
        <div class="content">
          <div class="badge">{badge_label}</div>
          <h1 class="ticker-title">{ticker}</h1>
          <div class="company">{company_name} ({scope_title})</div>

          <p style="font-size: 0.92rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px;">
            Tu posición ha alcanzado el umbral objetivo configurado (<b>{target_value:+.1f}%</b>), generando una {action_text}.
          </p>

          <div class="metrics-card">
            <div class="metric-row">
              <span class="metric-label">Rentabilidad Actual:</span>
              <span class="metric-val metric-highlight">{'+' if current_return_pct >= 0 else ''}{current_return_pct:.2f}%</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Precio Actual de Mercado:</span>
              <span class="metric-val">${current_price:.2f} USD</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Precio de Compra / Entrada:</span>
              <span class="metric-val">${entry_price:.2f} USD</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Umbral de Alerta Establecido:</span>
              <span class="metric-val">{target_value:+.1f}%</span>
            </div>
          </div>

          <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">
            Ingresa a tu terminal para ejecutar la orden de venta o ajustar tus parámetros de salida.
          </p>
        </div>
        <div class="footer">
          Kpital Zhent Terminal • Notificación generada automáticamente para {to_email}
        </div>
      </div>
    </body>
    </html>
    """

    if not SMTP_ENABLED:
        logger.info(
            f"[EMAIL SIMULATION] SMTP not configured. Notification simulated for {to_email}: "
            f"{ticker} reached {current_return_pct:.2f}% (Target: {target_value}%)"
        )
        # Return True so simulated alerts don't fail in dev/test
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        part = MIMEText(html_body, "html")
        msg.attach(part)

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, [to_email], msg.as_string())

        logger.info(f"[EMAIL] Alert email successfully sent to {to_email} for {ticker}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
        return False
