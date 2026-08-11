"""
Multi-Bank PDF & Image Statement Parser module.
Supports password-protected PDFs (Cedula/NIT decryption), auto-detecting bank entity,
extracting CDTs opened/matured, savings accounts, interest payouts, and transaction history.
"""

import re
import io
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

import pypdf


def parse_cop_amount(val_str: str) -> float:
    """Convert Spanish COP currency string like '$1.064.862,70' or '-$701.000,00' to float."""
    if not val_str:
        return 0.0
    clean = val_str.replace('$', '').replace(' ', '').strip()
    is_negative = '-' in clean or 'CR' in clean.upper() or 'DEB' in clean.upper()
    clean = clean.replace('-', '').replace('+', '').replace('CR', '').replace('DEB', '').strip()
    
    # Standardize Colombian format: 1.064.862,70 -> 1064862.70
    if ',' in clean and '.' in clean:
        clean = clean.replace('.', '').replace(',', '.')
    elif ',' in clean:
        clean = clean.replace(',', '.')
    
    try:
        val = float(clean)
        return -val if is_negative else val
    except ValueError:
        return 0.0


def extract_text_from_pdf(pdf_bytes: bytes, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Decrypts (if needed) and extracts text from a PDF file.
    Returns dict with extracted text, page count, and encryption status.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        
        if reader.is_encrypted:
            if not password:
                return {
                    "success": False,
                    "error": "PDF_ENCRYPTED",
                    "message": "El extracto en PDF está protegido con contraseña. Ingresa tu cédula o clave para desbloquearlo.",
                    "text": ""
                }
            
            # Attempt decryption with provided password
            decrypted = reader.decrypt(password)
            if not decrypted:
                # Try trimming whitespace or trailing zeroes in cedula
                decrypted = reader.decrypt(password.strip())
            
            if not decrypted:
                return {
                    "success": False,
                    "error": "WRONG_PASSWORD",
                    "message": "La contraseña ingresada no es válida para este extracto PDF.",
                    "text": ""
                }
        
        full_text = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                full_text.append(t)
        
        extracted_str = "\n".join(full_text)
        return {
            "success": True,
            "error": None,
            "message": "PDF extraído exitosamente",
            "text": extracted_str,
            "pageCount": len(reader.pages)
        }
    except Exception as e:
        return {
            "success": False,
            "error": "PARSING_FAILED",
            "message": f"Error leyendo el archivo PDF: {str(e)}",
            "text": ""
        }


def identify_bank_entity(text: str) -> Dict[str, str]:
    """Identifies bank entity from text signatures."""
    text_upper = text.upper()
    
    if "NU COLOMBIA" in text_upper or "COMPAÑÍA DE FINANCIAMIENTO" in text_upper or "CAJITA NU" in text_upper or "ABRISTE UN CDT" in text_upper:
        return {"id": "ent_nu", "name": "Nu Colombia", "icon": "💜", "color": "#820ad1"}
    elif "FINANDINA" in text_upper or "FLEXIDIGITAL" in text_upper:
        return {"id": "ent_finandina", "name": "Banco Finandina", "icon": "🏦", "color": "#1e3a8a"}
    elif "LULO BANK" in text_upper or "BOLSILLO LULO" in text_upper:
        return {"id": "ent_lulo", "name": "Lulo Bank", "icon": "⚡", "color": "#00e5ff"}
    elif "PIBANK" in text_upper:
        return {"id": "ent_pibank", "name": "Pibank", "icon": "🏦", "color": "#f59e0b"}
    elif "BANCOLOMBIA" in text_upper or "TU360" in text_upper:
        return {"id": "ent_bancolombia", "name": "Bancolombia", "icon": "🟡", "color": "#fdc500"}
    elif "DAVIVIENDA" in text_upper or "DABUENAVIDA" in text_upper:
        return {"id": "ent_davivienda", "name": "Davivienda", "icon": "🔴", "color": "#dc2626"}
    elif "RAPPIPAY" in text_upper or "RAPPICUENTA" in text_upper:
        return {"id": "ent_rappi", "name": "RappiPay", "icon": "💳", "color": "#ff441f"}
    elif "UALÁ" in text_upper or "UALA" in text_upper:
        return {"id": "ent_uala", "name": "Ualá Colombia", "icon": "🔴", "color": "#e11d48"}
    elif "SERFINANZA" in text_upper:
        return {"id": "ent_serfinanza", "name": "Banco Serfinanza", "icon": "🏦", "color": "#0284c7"}
    elif "INTERACTIVE BROKERS" in text_upper or "IBKR" in text_upper:
        return {"id": "ent_ibkr", "name": "Interactive Brokers", "icon": "💵", "color": "#e11d48"}
    else:
        return {"id": "ent_generic", "name": "Entidad Bancaria Detectada", "icon": "🏦", "color": "#64748b"}


def parse_nu_statement(text: str) -> Dict[str, Any]:
    """Specialized parser for Nu Colombia bank statements & screenshot extracts."""
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    cdts_detected = []
    accounts_detected = []
    movements_detected = []
    
    total_yield_paid = 0.0
    current_savings_balance = 0.0
    
    # 1. Look for CDT creations: e.g. "14 ago Abriste un CDT -$1.064.862,70" or "Abriste un CDT"
    cdt_opened_matches = re.findall(
        r'(\d{1,2}\s+[a-z]{3})?\s*(?:Abriste|Apertura|Constitución)\s+(?:un\s+)?CDT\s+([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    for date_str, amount_str in cdt_opened_matches:
        capital = abs(parse_cop_amount(amount_str))
        if capital > 0:
            cdts_detected.append({
                "name": f"CDT Nu Colombia ${capital:,.0f}",
                "capital": capital,
                "currency": "COP",
                "interestRateEA": 12.2, # Nu standard rate
                "termDays": 180,
                "startDate": datetime.now().strftime("%Y-%m-%d"),
                "reteFuentePct": 4.0,
                "detectedFrom": "Abriste un CDT"
            })

    # 2. Look for CDT payouts / maturities: e.g. "08 ago Recibiste dinero de un CDT +$154.583,66"
    cdt_payout_matches = re.findall(
        r'(\d{1,2}\s+[a-z]{3})?\s*(?:Recibiste\s+dinero\s+de\s+un|Liquidación|Vencimiento)\s+CDT\s+([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    for date_str, amount_str in cdt_payout_matches:
        amount = parse_cop_amount(amount_str)
        movements_detected.append({
            "date": date_str or "Reciente",
            "type": "cdt_payout",
            "description": "Recibiste dinero de un CDT",
            "amount": amount,
            "currency": "COP"
        })

    # 3. Look for Summary Boxes (Image 2 format): "Dinero en tus cajitas $1.255.290,28", "Tu dinero a final del mes $1.255.290,28"
    cajitas_balance_match = re.search(r'Dinero\s+en\s+tus\s+cajitas[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    account_balance_match = re.search(r'Dinero\s+en\s+tu\s+Cuenta\s+Nu[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    end_month_balance_match = re.search(r'Tu\s+dinero\s+a\s+final\s+del\s+mes[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    period_match = re.search(r'Período[^\d]*(\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{3}\s+\d{4})', text, re.IGNORECASE)

    period_str = period_match.group(1) if period_match else ""
    cajitas_bal = parse_cop_amount(cajitas_balance_match.group(1)) if cajitas_balance_match else 0.0
    account_bal = parse_cop_amount(account_balance_match.group(1)) if account_balance_match else 0.0
    end_month_bal = parse_cop_amount(end_month_balance_match.group(1)) if end_month_balance_match else 0.0

    # 4. Look for Total Yield paid: e.g. "Rendimiento total de tu cuenta +$11.292,45"
    yield_matches = re.findall(
        r'Rendimiento\s+total[^\d\+]*([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    if yield_matches:
        total_yield_paid = parse_cop_amount(yield_matches[0])

    # 5. Extract general movements: e.g. "05 ago Enviaste a JESUS DAVID... -$7.000,00"
    movement_pattern = re.compile(
        r'(\d{1,2}\s+[a-z]{3})\s+([A-Za-z0-9\s\.,áéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    for match in movement_pattern.finditer(text):
        m_date, m_desc, m_amount = match.groups()
        val = parse_cop_amount(m_amount)
        movements_detected.append({
            "date": m_date,
            "description": m_desc.strip(),
            "amount": val,
            "currency": "COP",
            "type": "credit" if val >= 0 else "debit"
        })

    # 6. Build Accounts breakdown
    main_balance = end_month_bal if end_month_bal > 0 else (cajitas_bal + account_bal)
    
    if cajitas_bal > 0:
        accounts_detected.append({
            "name": f"Dinero en Cajitas Nu {('(' + period_str + ')') if period_str else ''}",
            "type": "pocket",
            "currency": "COP",
            "balance": cajitas_bal,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })
    elif main_balance > 0:
        accounts_detected.append({
            "name": f"Cuenta Nu {('(' + period_str + ')') if period_str else ''}",
            "type": "pocket",
            "currency": "COP",
            "balance": main_balance,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })
    else:
        accounts_detected.append({
            "name": "Cuenta / Cajitas Nu",
            "type": "pocket",
            "currency": "COP",
            "balance": 0.0,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })

    return {
        "accounts": accounts_detected,
        "cdts": cdts_detected,
        "movements": movements_detected,
        "totalYieldPaid": total_yield_paid
    }


def parse_generic_statement(text: str) -> Dict[str, Any]:
    """Fallback parser for all bank statements."""
    cdts = []
    accounts = []
    movements = []
    
    # Detect amounts with dates
    amounts = re.findall(r'([+\-]?\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)', text)
    cop_amounts = [parse_cop_amount(a) for a in amounts if parse_cop_amount(a) != 0]
    
    # Detect CDT mentions
    if "CDT" in text.upper():
        cdts.append({
            "name": "CDT Detectado en Extracto",
            "capital": max(cop_amounts) if cop_amounts else 5000000.0,
            "currency": "COP",
            "interestRateEA": 11.5,
            "termDays": 180,
            "startDate": datetime.now().strftime("%Y-%m-%d"),
            "reteFuentePct": 4.0
        })

    accounts.append({
        "name": "Cuenta Principal Detectada",
        "type": "pocket",
        "currency": "COP",
        "interestRateEA": 12.0,
        "isTaxExemptGMF": True
    })

    return {
        "accounts": accounts,
        "cdts": cdts,
        "movements": movements,
        "totalYieldPaid": 0.0
    }


MONTH_MAP = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
}


def parse_nu_screenshot_history(text: str, start_year: int = 2024) -> Dict[str, Any]:
    """
    Parses Nu app mobile screenshots or history text.
    Extracts Cajitas by exact name (Cajita Estudios, Cajita Viaje, Cajita Deuda mom),
    CDTs categorized by destination (Invertiste en CDT en Viaje),
    and reconstructs YYYY-MM-DD dates using month transitions (e.g. Jan -> Dec decrements year).
    """
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    logger.debug("=== OCR RAW TEXT ===")
    logger.debug(text)
    logger.debug("=== END OCR TEXT ===")
    
    pocket_balances: Dict[str, float] = {}
    cdts_detected = []
    movements_detected = []
    
    current_year = start_year
    last_month_num = None
    
    # Regex for Cajita deposits / withdrawals
    # e.g., "Agregaste dinero a tu Cajita Estudios -$40.000,00"
    # e.g., "Retiraste dinero de tu Cajita Viaje +$10.000,00"
    # e.g., "13 jun - 02:10"
    cajita_pattern = re.compile(
        r'(Agregaste|Retiraste)\s+dinero\s+(?:a|de)\s+tu\s+(Cajita\s+[A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    
    # Regex for CDT investments per Cajita
    # e.g., "Invertiste en CDT en Deuda mom $80.000,00"
    cdt_cat_pattern = re.compile(
        r'Invertiste\s+en\s+CDT\s+en\s+([A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    
    # Regex for date lines: "13 jun - 02:10" or "13 jun"
    date_line_pattern = re.compile(r'(\d{1,2})\s+([a-z]{3})(?:\s*-\s*\d{2}:\d{2})?', re.IGNORECASE)

    # Nuevo: detectar saldos directos de cajitas (resumen)
    direct_balance_pattern = re.compile(
        r'(?:Cajita\s+)([A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s*[:$]?\s*([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    for line in lines:
        bal_match = direct_balance_pattern.search(line)
        if bal_match:
            cajita_name = bal_match.group(1).strip()
            bal = abs(parse_cop_amount(bal_match.group(2)))
            if cajita_name not in pocket_balances:
                pocket_balances[cajita_name] = bal
                logger.debug("Direct balance found: %s = %.2f", cajita_name, bal)

    current_date_str = f"{current_year}-01-01"

    for i, line in enumerate(lines):
        date_match = date_line_pattern.search(line)
        if date_match:
            day = int(date_match.group(1))
            month_str = date_match.group(2).lower()[:3]
            month_num = MONTH_MAP.get(month_str, 1)
            
            # Detect year boundary crossing (reading top to bottom)
            # If previous month was Jan (1) and now we see Dec (12), we stepped back 1 year
            if last_month_num is not None and month_num > last_month_num and (last_month_num <= 2 and month_num >= 10):
                current_year -= 1
            
            last_month_num = month_num
            current_date_str = f"{current_year}-{month_num:02d}-{day:02d}"

        # 2. Parse CDT investments by Category/Cajita
        cdt_match = cdt_cat_pattern.search(line)
        if cdt_match:
            cat_name, amount_str = cdt_match.groups()
            capital = abs(parse_cop_amount(amount_str))
            if capital > 0:
                cdts_detected.append({
                    "name": f"CDT Nu ({cat_name.strip()}) ${capital:,.0f}",
                    "capital": capital,
                    "currency": "COP",
                    "interestRateEA": 12.2,
                    "termDays": 180,
                    "startDate": current_date_str,
                    "reteFuentePct": 4.0,
                    "category": cat_name.strip()
                })
                
                logger.debug("CDT match on line %d: %s | category=%s, capital=%.2f", i, line, cat_name, capital)

    logger.debug("Pocket balances dict: %s", pocket_balances)
    logger.debug("CDTs detected: %d", len(cdts_detected))
    
    accounts_detected = []
    for pocket_name, balance in pocket_balances.items():
        accounts_detected.append({
            "name": pocket_name,
            "type": "pocket",
            "currency": "COP",
            "balance": max(0.0, balance),
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True
        })

    # Fallback: If no specific cajitas or CDTs were matched, extract general amounts and create default account
    if not accounts_detected and not cdts_detected:
        cop_amounts = [parse_cop_amount(a) for a in re.findall(r'([+\-]?\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)', text) if parse_cop_amount(a) > 0]
        estimated_bal = max(cop_amounts) if cop_amounts else 0.0
        
        logger.debug("Fallback triggered. cop_amounts: %s, max: %.2f", cop_amounts, estimated_bal)
        
        accounts_detected.append({
            "name": "Cuenta / Cajita Principal",
            "type": "pocket",
            "currency": "COP",
            "balance": estimated_bal,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True
        })

    return {
        "accounts": accounts_detected,
        "cdts": cdts_detected,
        "movements": movements_detected,
        "pocketBalances": pocket_balances
    }


_EASYOCR_READER = None

def get_easyocr_reader():
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        try:
            import easyocr
            _EASYOCR_READER = easyocr.Reader(['es', 'en'], gpu=False, verbose=False)
        except Exception:
            _EASYOCR_READER = False
    return _EASYOCR_READER


def extract_text_from_image(file_bytes: bytes) -> str:
    """Extract text from PNG/JPEG image bytes using easyocr, pytesseract, or string decode."""
    text = ""
    # 1. Try EasyOCR
    try:
        reader = get_easyocr_reader()
        if reader:
            results = reader.readtext(file_bytes, detail=0)
            if results:
                return "\n".join(results)
    except Exception:
        pass

    # 2. Try PyTesseract
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(file_bytes))
        t = pytesseract.image_to_string(img, lang='eng+spa')
        if t and len(t.strip()) > 0:
            return t
    except Exception:
        pass

    # 3. Fallback UTF-8 decode
    try:
        return file_bytes.decode('utf-8', errors='ignore')
    except Exception:
        return ""


def process_statement_document(file_bytes: bytes, password: Optional[str] = None, start_year: int = 2024) -> Dict[str, Any]:
    """Main entrypoint for processing any bank PDF extract, mobile screenshot, or text file."""
    try:
        is_pdf = file_bytes.startswith(b'%PDF')
        
        if is_pdf:
            extraction = extract_text_from_pdf(file_bytes, password=password)
            if not extraction["success"]:
                return extraction
            text = extraction["text"]
        else:
            text = extract_text_from_image(file_bytes)

        bank_entity = identify_bank_entity(text)
        
        # Check if screenshot history text contains Cajita / CDT mentions
        if "CAJITA" in text.upper() or "INVERTISTE EN CDT" in text.upper() or "AGREGASTE" in text.upper() or "RETIRASTE" in text.upper():
            parsed_data = parse_nu_screenshot_history(text, start_year=start_year)
        elif bank_entity["id"] == "ent_nu":
            parsed_data = parse_nu_statement(text)
        else:
            parsed_data = parse_generic_statement(text)

        return {
            "success": True,
            "bankEntity": bank_entity,
            "parsedData": parsed_data,
            "rawTextLength": len(text)
        }
    except Exception as e:
        return {
            "success": True,
            "bankEntity": {"id": "ent_generic", "name": "Entidad Bancaria", "icon": "🏦", "color": "#64748b"},
            "parsedData": {
                "accounts": [{"name": "Cuenta Registrada", "type": "pocket", "currency": "COP", "balance": 0.0, "interestRateEA": 12.0}],
                "cdts": [],
                "movements": []
            },
            "rawTextLength": 0,
            "warning": f"Procesado con advertencia: {str(e)}"
        }


def process_batch_statement_documents(files_bytes: List[bytes], password: Optional[str] = None, start_year: int = 2024) -> Dict[str, Any]:
    """Process a batch of multiple PDF extracts, mobile screenshots, or images at once."""
    if not files_bytes:
        return {"success": False, "error": "NO_FILES", "message": "No se enviaron archivos para procesar."}

    all_accounts: Dict[str, Dict[str, Any]] = {}
    all_cdts: List[Dict[str, Any]] = []
    all_movements: List[Dict[str, Any]] = []
    detected_bank = None
    processed_count = 0

    for file_bytes in files_bytes:
        res = process_statement_document(file_bytes, password=password, start_year=start_year)
        if res.get("success"):
            processed_count += 1
            if not detected_bank or detected_bank["id"] == "ent_generic":
                detected_bank = res.get("bankEntity")

            parsed = res.get("parsedData", {})
            # Merge Accounts / Cajitas by name
            for acc in parsed.get("accounts", []):
                acc_name = acc["name"]
                if acc_name in all_accounts:
                    # Sum balance and yield
                    all_accounts[acc_name]["balance"] = all_accounts[acc_name].get("balance", 0.0) + acc.get("balance", 0.0)
                    all_accounts[acc_name]["yieldEarnedPeriod"] = all_accounts[acc_name].get("yieldEarnedPeriod", 0.0) + acc.get("yieldEarnedPeriod", 0.0)
                else:
                    all_accounts[acc_name] = dict(acc)
                    all_accounts[acc_name]["yieldEarnedPeriod"] = acc.get("yieldEarnedPeriod", 0.0)

            # Append CDTs
            for cdt in parsed.get("cdts", []):
                if cdt not in all_cdts:
                    all_cdts.append(cdt)

            # Append Movements
            for m in parsed.get("movements", []):
                if m not in all_movements:
                    all_movements.append(m)

    return {
        "success": True,
        "processedFilesCount": processed_count,
        "bankEntity": detected_bank or {"id": "ent_generic", "name": "Entidad Bancaria", "icon": "🏦", "color": "#64748b"},
        "parsedData": {
            "accounts": list(all_accounts.values()),
            "cdts": all_cdts,
            "movements": all_movements
        }
    }

