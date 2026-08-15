# backend/scripts/test_ocr_parse.py
import sys

sys.path.append("..")
import logging

from services.statement_parser import clean_ocr_with_local_llm, parse_nu_screenshot_history

logging.basicConfig(level=logging.DEBUG)

sample_text = """
934
45G
3:21 @ 04".
@
KB/5
VoLTE
LTE
cdt
Esluuius
25 may
00.52
Invertiste en CDT en Deuda
$50.000,00
ul/
mom
25 may
00.50
Invertiste en CDT en Deuda
$80.000,00
ul/
mom
29 abr
22.43
Invertiste en CDT en
$150.000,00
ul/
Estudios
10 abr
00:30
Invertiste en CDT en
$150.000,00
ul/
Deuda mom
10 abr
00:30
Invertiste en CDT en Viaje
$1.308.051,01
ull
03 mar
20.43
Invertiste en CDT en
$1.029.242,53
ull
Estudios
03 mar
20:42
Invertiste en CDT en Deuda
$201.211,48
u/
mom
03 mar
20.38
"""

print("=== RESULTADO REGEX ===")
print(parse_nu_screenshot_history(sample_text))

print("\n=== RESULTADO LLM ===")
print(clean_ocr_with_local_llm(sample_text))
