"""Test suite for Mobile Webhook endpoints in Titanes Portfolio."""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
SECRET_KEY = "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"


def test_auth_rejection():
    print("-> Testing auth rejection (no token)...")
    res = client.get("/api/webhooks/health")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    print("-> Testing auth rejection (invalid token)...")
    res = client.get("/api/webhooks/health", headers={"X-Webhook-Secret": "invalid_token"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("OK: Unauthorized requests properly blocked.")


def test_health_with_secret():
    print("-> Testing healthcheck with valid X-Webhook-Secret header...")
    res = client.get("/api/webhooks/health", headers={"X-Webhook-Secret": SECRET_KEY})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data.get("status") == "healthy"
    print(f"OK: Health endpoint answered: {data}")

    print("-> Testing healthcheck with ?token= query parameter...")
    res2 = client.get(f"/api/webhooks/health?token={SECRET_KEY}")
    assert res2.status_code == 200
    assert res2.json().get("status") == "healthy"
    print("OK: Query param authentication works.")


def test_list_mobile_accounts():
    print("-> Testing GET /api/webhooks/mobile-accounts...")
    res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data.get("success") is True
    assert "entities" in data
    print(f"OK: Found {data.get('total_entities')} entities and {data.get('total_accounts')} accounts.")
    for e in data.get("entities", []):
        pockets = [f"{a['name']} (${a['balance']:,.0f})" for a in e.get("accounts", [])]
        print(f"   * {e['name']}: {', '.join(pockets) if pockets else 'Sin bolsillos'}")


def test_mobile_transaction_flow():
    print("-> Testing POST /api/webhooks/mobile-transaction (Debit Nu Cajita Viaje)...")
    
    # 1. Get initial balance
    acc_res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    accounts = []
    for ent in acc_res.json().get("entities", []):
        for acc in ent.get("accounts", []):
            if "viaje" in acc["name"].lower():
                accounts.append(acc)
    
    assert len(accounts) > 0, "No Cajita Viaje found"
    initial_balance = accounts[0]["balance"]
    print(f"   Initial balance of {accounts[0]['name']}: ${initial_balance:,.2f}")

    # 2. Perform Debit of 1000 COP with formatted string '$1.000'
    test_debit_payload = {
        "entity": "Nu Colombia",
        "account": "Viaje",
        "amount": "$1.000",
        "description": "Test Automatización MacroDroid",
        "type": "debit",
        "raw_text": "Compra en D1 por $1.000 con tu tarjeta Nu"
    }

    post_res = client.post(
        "/api/webhooks/mobile-transaction",
        json=test_debit_payload,
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert post_res.status_code == 200, f"Debit failed: {post_res.status_code}: {post_res.text}"
    debit_data = post_res.json()
    assert debit_data["success"] is True
    new_bal = debit_data["account"]["new_balance"]
    expected_bal = round(initial_balance - 1000.0, 2)
    assert round(new_bal, 2) == expected_bal, f"Expected balance {expected_bal}, got {new_bal}"
    assert debit_data["transaction"]["amount"] == -1000.0
    print(f"   Debit successful! New balance: ${new_bal:,.2f} (Deducted 1,000 COP)")

    # 3. Revert with Credit of 1000 COP to leave balance intact
    print("-> Reverting test debit with credit of 1,000 COP...")
    test_credit_payload = {
        "entity": "Nu Colombia",
        "account": "acc_viaje",
        "amount": 1000.0,
        "description": "Reversión Test Automatización",
        "type": "credit"
    }
    credit_res = client.post(
        "/api/webhooks/mobile-transaction",
        json=test_credit_payload,
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert credit_res.status_code == 200
    reverted_bal = credit_res.json()["account"]["new_balance"]
    assert round(reverted_bal, 2) == round(initial_balance, 2)
    print(f"   Reversion successful! Balance restored to: ${reverted_bal:,.2f}")


if __name__ == "__main__":
    print("================ RUNNING WEBHOOK TESTS ================")
    test_auth_rejection()
    test_health_with_secret()
    test_list_mobile_accounts()
    test_mobile_transaction_flow()
    print("================ ALL WEBHOOK TESTS PASSED! ================")
