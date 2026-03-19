from collections.abc import Generator
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.core.database import Base
from app.main import app
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.bank_account import BankAccount
from app.models.processing_job import ProcessingJob


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


def test_upload_csv_processes_analysis_and_persists_job_and_snapshot(client: TestClient) -> None:
    headers = register_and_login(client, "files-user")

    csv_content = b"fecha,descripcion,monto,account_last4\n2026-03-10,Salario,1500,1234\n2026-03-11,Supermercado,-120.5,1234\n"
    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(csv_content), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "done"
    assert payload["analysis"]["total_transactions"] == 2
    assert payload["analysis"]["total_income"] == 1500.0
    assert payload["analysis"]["total_expenses"] == 120.5

    with TestingSessionLocal() as db:
        jobs = list(db.scalars(select(ProcessingJob)).all())
        snapshots = list(db.scalars(select(AnalysisSnapshot)).all())
        accounts = list(db.scalars(select(BankAccount)).all())

    assert len(jobs) == 1
    assert jobs[0].status == "success"
    assert jobs[0].original_filename == "estado_bg.csv"
    assert jobs[0].file_type == "csv"
    assert len(snapshots) == 1
    assert snapshots[0].summary["total_transactions"] == 2
    assert len(accounts) == 1
    assert accounts[0].detection_source == "file"
    assert float(accounts[0].confidence_score) == 0.95


def test_upload_without_last4_creates_low_confidence_account(client: TestClient) -> None:
    headers = register_and_login(client, "files-low-confidence")

    csv_content = b"fecha,descripcion,monto\n2026-03-10,Salario,1500\n2026-03-11,Supermercado,-120.5\n"
    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_banistmo.csv", BytesIO(csv_content), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 200

    with TestingSessionLocal() as db:
        accounts = list(db.scalars(select(BankAccount)).all())

    assert len(accounts) == 1
    assert accounts[0].detection_source == "file"
    assert float(accounts[0].confidence_score) == 0.35


def test_upload_reuses_existing_account_and_does_not_duplicate(client: TestClient) -> None:
    headers = register_and_login(client, "files-reuse")

    csv_content = b"fecha,descripcion,monto,account_last4\n2026-03-10,Salario,1500,5555\n2026-03-11,Supermercado,-120.5,5555\n"
    files = {"file": ("estado_bg.csv", BytesIO(csv_content), "text/csv")}

    first_response = client.post("/api/v1/files/upload", files=files, headers=headers)
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(csv_content), "text/csv")},
        headers=headers,
    )
    assert second_response.status_code == 200

    with TestingSessionLocal() as db:
        accounts = list(db.scalars(select(BankAccount)).all())
        jobs = list(db.scalars(select(ProcessingJob)).all())

    assert len(accounts) == 1
    assert len(jobs) == 2


def test_upload_rejects_invalid_extension(client: TestClient) -> None:
    headers = register_and_login(client, "files-invalid")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado.txt", BytesIO(b"hola"), "text/plain")},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Archivo inválido"


def test_upload_returns_422_when_multiple_accounts_are_detected(client: TestClient) -> None:
    headers = register_and_login(client, "files-inconsistent")

    csv_content = (
        b"fecha,descripcion,monto,account_last4\n"
        b"2026-03-10,Salario,1500,1234\n"
        b"2026-03-11,Supermercado,-120.5,5678\n"
    )
    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(csv_content), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Archivo inconsistente o múltiples cuentas detectadas"