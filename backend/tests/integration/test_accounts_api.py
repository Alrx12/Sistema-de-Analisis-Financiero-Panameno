from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.core.database import Base
from app.main import app


SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def register_and_login(client: TestClient, username: str) -> dict[str, str]:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "supersecret123",
            "full_name": "Test User",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": "supersecret123"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_and_list_accounts_for_authenticated_user(client: TestClient) -> None:
    headers = register_and_login(client, "alice")

    create_response = client.post(
        "/api/v1/accounts",
        json={
            "bank_name": "Banco General",
            "account_type": "ahorros",
            "nickname": "BG principal",
            "account_number_last4": "1234",
        },
        headers=headers,
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["bank_name"] == "Banco General"
    assert created["account_number_last4"] == "1234"
    assert created["detection_source"] == "manual"
    assert created["is_active"] is True
    assert len(created["account_fingerprint"]) == 64

    list_response = client.get("/api/v1/accounts", headers=headers)
    assert list_response.status_code == 200
    accounts = list_response.json()
    assert len(accounts) == 1
    assert accounts[0]["account_id"] == created["account_id"]


def test_prevent_duplicate_accounts_by_fingerprint(client: TestClient) -> None:
    headers = register_and_login(client, "bob")
    payload = {
        "bank_name": "Banco General",
        "account_type": "ahorros",
        "nickname": "BG principal",
        "account_number_last4": "1234",
    }

    first_response = client.post("/api/v1/accounts", json=payload, headers=headers)
    assert first_response.status_code == 201

    second_response = client.post("/api/v1/accounts", json=payload, headers=headers)
    assert second_response.status_code == 400
    assert second_response.json()["detail"] == "Ya existe una cuenta con la misma huella para este usuario"


def test_account_access_is_limited_to_authenticated_owner(client: TestClient) -> None:
    owner_headers = register_and_login(client, "carol")
    other_headers = register_and_login(client, "dave")

    create_response = client.post(
        "/api/v1/accounts",
        json={
            "bank_name": "Banistmo",
            "account_type": "corriente",
            "nickname": "Cuenta Carol",
        },
        headers=owner_headers,
    )
    account_id = create_response.json()["account_id"]

    list_response = client.get("/api/v1/accounts", headers=other_headers)
    assert list_response.status_code == 200
    assert list_response.json() == []

    get_response = client.get(f"/api/v1/accounts/{account_id}", headers=other_headers)
    assert get_response.status_code == 404


def test_update_and_soft_delete_account(client: TestClient) -> None:
    headers = register_and_login(client, "erin")

    create_response = client.post(
        "/api/v1/accounts",
        json={
            "bank_name": "BAC Credomatic",
            "account_type": "tarjeta",
            "nickname": "BAC principal",
        },
        headers=headers,
    )
    created = create_response.json()

    update_response = client.patch(
        f"/api/v1/accounts/{created['account_id']}",
        json={
            "nickname": "BAC viajes",
            "account_type": "tarjeta platinum",
            "account_number_last4": "9876",
        },
        headers=headers,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["nickname"] == "BAC viajes"
    assert updated["account_type"] == "tarjeta platinum"
    assert updated["account_number_last4"] == "9876"
    assert updated["account_fingerprint"] != created["account_fingerprint"]

    delete_response = client.delete(f"/api/v1/accounts/{created['account_id']}", headers=headers)
    assert delete_response.status_code == 200
    deleted = delete_response.json()
    assert deleted["is_active"] is False