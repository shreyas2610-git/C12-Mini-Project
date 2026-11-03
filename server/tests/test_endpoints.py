import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from httpx import AsyncClient, ASGITransport
from app.main import app

async def run_tests():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger lifespan
        async with app.router.lifespan_context(app):
            # 1. Test GET /api/v1/towers
            res = await client.get("/api/v1/towers")
            print("GET /towers:", res.status_code, res.json())
            assert res.status_code == 200
            towers = res.json()
            assert len(towers) > 0
            first_tower_id = towers[0]["tower_id"]

            # 2. Test GET /api/v1/towers/{id}/flats
            res = await client.get(f"/api/v1/towers/{first_tower_id}/flats")
            print(f"GET /towers/{first_tower_id}/flats:", res.status_code, res.json())
            assert res.status_code == 200
            flats = res.json()
            assert len(flats) > 0
            first_flat_id = flats[0]["flat_id"]

            # 3. Test GET /api/v1/trades
            res = await client.get("/api/v1/trades")
            print("GET /trades:", res.status_code, res.json())
            assert res.status_code == 200
            trades = res.json()
            assert len(trades) > 0
            trade_ids = [t["trade_id"] for t in trades[:2]]

            # 4. Test POST /api/v1/auth/register for Resident (role_id=1)
            resident_email = f"resident_{os.urandom(3).hex()}@example.com"
            payload_resident = {
                "full_name": "Test Resident",
                "email": resident_email,
                "phone": "+91-9876543210",
                "password": "Password123!",
                "role_id": 1,
                "flat_id": first_flat_id
            }
            res = await client.post("/api/v1/auth/register", json=payload_resident)
            print("POST /auth/register (Resident):", res.status_code, res.json())
            assert res.status_code == 201
            data = res.json()
            assert data["role"] == "Resident"
            assert "access_token" in data

            # 5. Test POST /api/v1/auth/login with password
            res = await client.post("/api/v1/auth/login", json={
                "email": resident_email,
                "password": "Password123!"
            })
            print("POST /auth/login (Resident):", res.status_code, res.json())
            assert res.status_code == 200
            assert "access_token" in res.json()

            # 6. Test POST /api/v1/auth/register for Vendor (role_id=4)
            vendor_email = f"vendor_{os.urandom(3).hex()}@example.com"
            payload_vendor = {
                "full_name": "Test Vendor",
                "email": vendor_email,
                "phone": "+91-9876543211",
                "password": "Password123!",
                "role_id": 4,
                "company_name": "Quick Fix Services",
                "capacity": 5,
                "trade_ids": trade_ids
            }
            res = await client.post("/api/v1/auth/register", json=payload_vendor)
            print("POST /auth/register (Vendor):", res.status_code, res.json())
            assert res.status_code == 201
            assert res.json()["role"] == "Vendor"

            print("\n*** ALL BACKEND ENDPOINT INTEGRATION TESTS PASSED! ***")

if __name__ == "__main__":
    asyncio.run(run_tests())
