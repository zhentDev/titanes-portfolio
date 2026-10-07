"""
Export service for generating multi-tab professional Excel spreadsheets.
Tabs:
1. Resumen Ejecutivo (KPIs, rendimientos, alfas, Sharpe, Drawdown)
2. Evolución Diaria (Timeline diario: cada acción activa, su precio, peso, valor y subidas/caídas)
3. Posiciones Históricas & Rebalanceos (Histórico de rebalanceos y operaciones cerradas)
"""

import io
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def generate_portfolio_excel(nav_result: dict, investment: float, strategy_name: str = "Titanes Tecnológicos") -> io.BytesIO:
    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    # Styles & Palette (Dark Slate Theme matching Titanes UI)
    font_family = "Segoe UI"
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    sub_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    accent_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    
    header_font = Font(name=font_family, size=11, bold=True, color="FFFFFF")
    title_font = Font(name=font_family, size=16, bold=True, color="0F172A")
    subtitle_font = Font(name=font_family, size=10, italic=True, color="64748B")
    bold_font = Font(name=font_family, size=10, bold=True, color="0F172A")
    regular_font = Font(name=font_family, size=10, color="0F172A")
    green_font = Font(name=font_family, size=10, bold=True, color="16A34A")
    red_font = Font(name=font_family, size=10, bold=True, color="DC2626")

    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    summary = nav_result.get("summary", {})
    holdings = nav_result.get("holdings", [])
    closed_holdings = nav_result.get("closed_holdings", [])
    nav_series = nav_result.get("nav", [])
    sp500_series = nav_result.get("sp500", [])
    nasdaq_series = nav_result.get("nasdaq", [])

    # Map dates to benchmarks
    sp500_map = {pt["date"]: pt["value"] for pt in sp500_series}
    nasdaq_map = {pt["date"]: pt["value"] for pt in nasdaq_series}

    # ─────────────────────────────────────────────────────────────
    # HOJA 1: RESUMEN EJECUTIVO
    # ─────────────────────────────────────────────────────────────
    ws1 = wb.create_sheet(title="Resumen Ejecutivo")
    ws1.views.sheetView[0].showGridLines = True

    # Title Banner
    ws1["A1"] = f"REPORTE GENERAL - {strategy_name.upper()}"
    ws1["A1"].font = title_font
    ws1["A2"] = f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | ProPicks AI Tracker"
    ws1["A2"].font = subtitle_font

    # Section 1: Métricas de Rendimiento
    ws1["A4"] = "MÉTRICA CLAVE"
    ws1["B4"] = "VALOR"
    for col in ["A4", "B4"]:
        ws1[col].fill = header_fill
        ws1[col].font = header_font
        ws1[col].alignment = Alignment(horizontal="left", vertical="center")

    kpis = [
        ("Capital Inicial Configurado", f"${summary.get('start_value', investment):,.2f}"),
        ("Capital Activo en Acciones", f"${summary.get('active_invested', 0):,.2f}"),
        ("Valor Actual del Portafolio", f"${summary.get('active_stock_value', summary.get('end_value', 0)):,.2f}"),
        ("Liquidez / Cash Reservado", f"${summary.get('cash_reserved', 0):,.2f}"),
        ("Rendimiento Activo Total (%)", f"{summary.get('active_return_pct', 0):+.2f}%"),
        ("Rendimiento Activo Total ($)", f"${summary.get('active_return', 0):+,.2f}"),
        ("Alfa vs S&P 500 (%)", f"{summary.get('alpha_sp500', 0):+.2f}%"),
        ("Alfa vs NASDAQ (%)", f"{summary.get('alpha_nasdaq', 0):+.2f}%"),
        ("Ratio de Sharpe", f"{summary.get('sharpe_ratio', 'N/A')}"),
        ("Ratio de Sortino", f"{summary.get('sortino_ratio', 'N/A')}"),
        ("Beta vs S&P 500", f"{summary.get('beta_sp500', 'N/A')}"),
        ("Beta vs NASDAQ", f"{summary.get('beta_nasdaq', 'N/A')}"),
        ("Volatilidad Anualizada", f"{summary.get('annualized_vol_pct', 0):.2f}%"),
        ("Tasa de Acierto (Win Rate)", f"{summary.get('win_rate_pct', 0):.1f}%"),
        ("Drawdown Máximo (%)", f"{summary.get('max_drawdown_pct', 0):.2f}%"),
        ("Posiciones Activas Actuales", f"{summary.get('num_holdings', len(holdings))}"),
        ("Posiciones Cerradas / Rotadas", f"{summary.get('closed_count', len(closed_holdings))}"),
    ]

    r_idx = 5
    for name, val in kpis:
        c1 = ws1.cell(row=r_idx, column=1, value=name)
        c2 = ws1.cell(row=r_idx, column=2, value=val)
        c1.font = bold_font
        c2.font = regular_font
        c1.border = thin_border
        c2.border = thin_border
        if "Rendimiento" in name or "Alfa" in name:
            if "+" in val:
                c2.font = green_font
            elif "-" in val:
                c2.font = red_font
        r_idx += 1

    # Section 2: Posiciones Actuales Snapshot
    ws1["D4"] = "TICKER"
    ws1["E4"] = "EMPRESA"
    ws1["F4"] = "SECTOR"
    ws1["G4"] = "ACCIONES"
    ws1["H4"] = "P. ENTRADA"
    ws1["I4"] = "P. ACTUAL"
    ws1["J4"] = "VALOR HOY"
    ws1["K4"] = "RETORNO (%)"
    ws1["L4"] = "RETORNO ($)"

    for col in ["D4", "E4", "F4", "G4", "H4", "I4", "J4", "K4", "L4"]:
        ws1[col].fill = sub_fill
        ws1[col].font = header_font
        ws1[col].alignment = Alignment(horizontal="center", vertical="center")

    h_row = 5
    for h in holdings:
        ws1.cell(row=h_row, column=4, value=h.get("ticker")).font = bold_font
        ws1.cell(row=h_row, column=5, value=h.get("name", h.get("ticker"))).font = regular_font
        ws1.cell(row=h_row, column=6, value=h.get("sector", "Tecnología")).font = regular_font
        ws1.cell(row=h_row, column=7, value=round(h.get("shares", 0), 4)).font = regular_font
        ws1.cell(row=h_row, column=8, value=f"${h.get('start_price', 0):,.2f}").font = regular_font
        ws1.cell(row=h_row, column=9, value=f"${h.get('current_price', 0):,.2f}").font = regular_font
        ws1.cell(row=h_row, column=10, value=f"${h.get('current_value', 0):,.2f}").font = bold_font
        
        ret_pct = h.get("return_pct", 0)
        c_pct = ws1.cell(row=h_row, column=11, value=f"{ret_pct:+.2f}%")
        c_pct.font = green_font if ret_pct >= 0 else red_font
        
        ret_usd = h.get("return_usd", 0)
        c_usd = ws1.cell(row=h_row, column=12, value=f"${ret_usd:+,.2f}")
        c_usd.font = green_font if ret_usd >= 0 else red_font

        for col_i in range(4, 13):
            ws1.cell(row=h_row, column=col_i).border = thin_border
        h_row += 1

    # ─────────────────────────────────────────────────────────────
    # HOJA 2: COMPORTAMIENTO DIARIO (TIMELINE INTEGRAL)
    # ─────────────────────────────────────────────────────────────
    ws2 = wb.create_sheet(title="Comportamiento Diario")
    ws2.views.sheetView[0].showGridLines = True

    # Preparamos las columnas dinámicas: Fecha, NAV Total, Rendimiento Día %, S&P500, NASDAQ, y para cada ticker: P.Cierre, Variación Día %
    active_tickers = [h.get("ticker") for h in holdings]
    
    # Extraemos fechas únicas ordenadas de nav_series
    dates = [pt["date"] for pt in nav_series]

    # Preparamos mapas de precios diarios por ticker usando sus listas history
    ticker_history_map = {}
    for h in holdings:
        t = h.get("ticker")
        ticker_history_map[t] = {}
        # start_price * factor
        s_price = h.get("start_price", 1.0)
        for hist_pt in h.get("history", []):
            d = hist_pt.get("date")
            f = hist_pt.get("factor", 1.0)
            ticker_history_map[t][d] = s_price * f

    # Headers fila 1
    ws2["A1"] = "FECHA"
    ws2["B1"] = "VALOR PORTAFOLIO ($)"
    ws2["C1"] = "VARIACIÓN DÍA (%)"
    ws2["D1"] = "S&P 500 BENCHMARK ($)"
    ws2["E1"] = "NASDAQ BENCHMARK ($)"
    
    base_headers = ["A1", "B1", "C1", "D1", "E1"]
    for bh in base_headers:
        ws2[bh].fill = header_fill
        ws2[bh].font = header_font
        ws2[bh].alignment = Alignment(horizontal="center", vertical="center")

    curr_col = 6
    ticker_col_map = {}
    for t in active_tickers:
        col_letter_p = get_column_letter(curr_col)
        col_letter_v = get_column_letter(curr_col + 1)
        
        ws2[f"{col_letter_p}1"] = f"{t} (Precio $)"
        ws2[f"{col_letter_v}1"] = f"{t} (Cambio Día %)"
        
        ws2[f"{col_letter_p}1"].fill = sub_fill
        ws2[f"{col_letter_p}1"].font = header_font
        ws2[f"{col_letter_v}1"].fill = sub_fill
        ws2[f"{col_letter_v}1"].font = header_font

        ticker_col_map[t] = (curr_col, curr_col + 1)
        curr_col += 2

    # Llenamos datos diarios
    row_num = 2
    prev_val = None
    prev_ticker_prices = {}

    for pt in nav_series:
        d = pt["date"]
        val = pt.get("value", 0)
        
        # Rendimiento diario del portafolio
        daily_chg = ((val - prev_val) / prev_val * 100) if (prev_val and prev_val > 0) else 0.0
        prev_val = val

        ws2.cell(row=row_num, column=1, value=d).font = bold_font
        ws2.cell(row=row_num, column=2, value=f"${val:,.2f}").font = regular_font
        
        c_chg = ws2.cell(row=row_num, column=3, value=f"{daily_chg:+.2f}%")
        c_chg.font = green_font if daily_chg >= 0 else red_font

        sp_val = sp500_map.get(d, 0)
        ws2.cell(row=row_num, column=4, value=f"${sp_val:,.2f}" if sp_val > 0 else "N/A").font = regular_font
        
        nd_val = nasdaq_map.get(d, 0)
        ws2.cell(row=row_num, column=5, value=f"${nd_val:,.2f}" if nd_val > 0 else "N/A").font = regular_font

        # Tickers individuales
        for t in active_tickers:
            col_p, col_v = ticker_col_map[t]
            t_price = ticker_history_map[t].get(d)
            if t_price is not None:
                ws2.cell(row=row_num, column=col_p, value=f"${t_price:,.2f}").font = regular_font
                prev_p = prev_ticker_prices.get(t)
                t_chg = ((t_price - prev_p) / prev_p * 100) if (prev_p and prev_p > 0) else 0.0
                prev_ticker_prices[t] = t_price

                c_tchg = ws2.cell(row=row_num, column=col_v, value=f"{t_chg:+.2f}%")
                c_tchg.font = green_font if t_chg >= 0 else red_font
            else:
                ws2.cell(row=row_num, column=col_p, value="-").font = regular_font
                ws2.cell(row=row_num, column=col_v, value="-").font = regular_font

        for c_i in range(1, curr_col):
            ws2.cell(row=row_num, column=c_i).border = thin_border

        row_num += 1

    # ─────────────────────────────────────────────────────────────
    # HOJA 3: POSICIONES CERRADAS & ROTACIONES
    # ─────────────────────────────────────────────────────────────
    ws3 = wb.create_sheet(title="Posiciones Cerradas")
    ws3.views.sheetView[0].showGridLines = True

    c_headers = [
        "TICKER", "EMPRESA", "FECHA ENTRADA", "P. ENTRADA ($)", 
        "FECHA SALIDA", "P. SALIDA ($)", "ACCIONES", "COSTO TOTAL ($)", 
        "VALOR FINAL ($)", "PNL REALIZADO ($)", "RETORNO (%)", "DÍAS HOLDING"
    ]
    for idx, h_text in enumerate(c_headers, start=1):
        cell = ws3.cell(row=1, column=idx, value=h_text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    c_row = 2
    if closed_holdings:
        for c in closed_holdings:
            ws3.cell(row=c_row, column=1, value=c.get("ticker")).font = bold_font
            ws3.cell(row=c_row, column=2, value=c.get("name", c.get("ticker"))).font = regular_font
            ws3.cell(row=c_row, column=3, value=c.get("entry_date", "")).font = regular_font
            ws3.cell(row=c_row, column=4, value=f"${c.get('entry_price', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=5, value=c.get("exit_date", "")).font = regular_font
            ws3.cell(row=c_row, column=6, value=f"${c.get('exit_price', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=7, value=round(c.get("shares", 0), 4)).font = regular_font
            ws3.cell(row=c_row, column=8, value=f"${c.get('cost_basis', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=9, value=f"${c.get('exit_value', 0):,.2f}").font = regular_font
            
            pnl = c.get("realized_pnl", 0)
            c_pnl = ws3.cell(row=c_row, column=10, value=f"${pnl:+,.2f}")
            c_pnl.font = green_font if pnl >= 0 else red_font
            
            pnl_pct = c.get("realized_return_pct", 0)
            c_ret = ws3.cell(row=c_row, column=11, value=f"{pnl_pct:+.2f}%")
            c_ret.font = green_font if pnl_pct >= 0 else red_font

            ws3.cell(row=c_row, column=12, value=c.get("holding_days", 0)).font = regular_font

            for col_i in range(1, 13):
                ws3.cell(row=c_row, column=col_i).border = thin_border
            c_row += 1
    else:
        ws3.cell(row=2, column=1, value="No se registran posiciones cerradas aún.").font = subtitle_font

    # Auto-ajuste de ancho de columnas para todas las hojas
    for ws in [ws1, ws2, ws3]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                if "\n" in val_str:
                    val_str = max(val_str.split("\n"), key=len)
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
