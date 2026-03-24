"""
Tests de integración para POST /api/v1/files/upload.

El endpoint ahora retorna HTTP 202 y encola el procesamiento en Celery.
En tests, reemplazamos process_file_task.delay() con una ejecución síncrona
contra la DB de prueba (SQLite in-memory), para no necesitar Redis ni un worker.
"""
from collections.abc import Generator
from io import BytesIO
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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


@pytest.fixture(autouse=True)
def run_celery_tasks_eagerly() -> Generator[None, None, None]:
    """
    Reemplaza process_file_task.delay() con una ejecución síncrona
    contra la DB de test (SQLite). No requiere Redis ni worker Celery.
    """
    from app.models.processing_job import ProcessingJob
    from app.models.user import User
    from app.services.processing_service import ProcessingService

    def sync_delay(*, file_path: str, original_filename: str, user_id: str, job_id: str) -> None:
        db = TestingSessionLocal()
        try:
            user = db.get(User, UUID(user_id))
            job = db.get(ProcessingJob, UUID(job_id))
            svc = ProcessingService(db)
            svc.run_pipeline(job=job, file_path=file_path, current_user=user)
        finally:
            db.close()

    mock_task = MagicMock()
    mock_task.delay.side_effect = sync_delay

    with patch("app.api.v1.files.process_file_task", mock_task):
        yield


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


# ── Formato Banco General: 8 filas vacías + columnas (fecha, _, ref, trx, desc, débito, crédito)

BG_CSV_WITH_LAST4 = (
    b",,,,,,\n" * 8
    + b"2026-03-10 12:54:04,,ref1,trx1,YAPPY BG 1234,120.50,\n"
    + b"2026-03-11 12:54:04,,ref2,trx2,ACH XPRESS NOMINA,,1500.00\n"
)

BG_CSV_MULTI_ACCOUNT = (
    b",,,,,,\n" * 8
    + b"2026-03-10 12:54:04,,ref1,trx1,YAPPY BG 1234,120.50,\n"
    + b"2026-03-11 12:54:04,,ref2,trx2,YAPPY BG 5678,95.00,\n"
)

BG_CSV_REUSE = (
    b",,,,,,\n" * 8
    + b"2026-03-10 12:54:04,,ref1,trx1,YAPPY BG 5555,120.50,\n"
    + b"2026-03-11 12:54:04,,ref2,trx2,ACH XPRESS NOMINA,,1500.00\n"
)


def test_upload_returns_202_and_processes_async(client: TestClient) -> None:
    """El endpoint retorna 202 inmediatamente; la tarea se ejecuta de forma síncrona en tests."""
    headers = register_and_login(client, "files-user")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_WITH_LAST4), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "queued"
    assert "job_id" in payload


def test_upload_persists_job_and_snapshot(client: TestClient) -> None:
    headers = register_and_login(client, "files-persist")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_WITH_LAST4), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 202

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


def test_upload_analysis_totals(client: TestClient) -> None:
    headers = register_and_login(client, "files-totals")

    client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_WITH_LAST4), "text/csv")},
        headers=headers,
    )

    with TestingSessionLocal() as db:
        snapshot = db.scalars(select(AnalysisSnapshot)).first()

    assert snapshot is not None
    assert snapshot.summary["total_income"] == 1500.0
    assert snapshot.summary["total_expenses"] == 120.5


def test_upload_without_last4_creates_low_confidence_account(client: TestClient) -> None:
    headers = register_and_login(client, "files-low-confidence")

    csv_content = b"fecha,descripcion,monto\n2026-03-10,Salario,1500\n2026-03-11,Supermercado,-120.5\n"
    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_banistmo.csv", BytesIO(csv_content), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 202

    with TestingSessionLocal() as db:
        accounts = list(db.scalars(select(BankAccount)).all())

    assert len(accounts) == 1
    assert accounts[0].detection_source == "file"
    assert float(accounts[0].confidence_score) == 0.35


def test_upload_reuses_existing_account_and_does_not_duplicate(client: TestClient) -> None:
    headers = register_and_login(client, "files-reuse")

    first_response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_REUSE), "text/csv")},
        headers=headers,
    )
    assert first_response.status_code == 202

    second_response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_REUSE), "text/csv")},
        headers=headers,
    )
    assert second_response.status_code == 202

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


def test_upload_multiple_accounts_results_in_error_job(client: TestClient) -> None:
    """
    Cuando el archivo contiene múltiples cuentas (last4 distintos),
    el pipeline falla y el job queda en estado 'error'.
    Con el flujo async, el endpoint retorna 202 y el error ocurre en el worker.
    """
    headers = register_and_login(client, "files-inconsistent")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.csv", BytesIO(BG_CSV_MULTI_ACCOUNT), "text/csv")},
        headers=headers,
    )

    assert response.status_code == 202

    with TestingSessionLocal() as db:
        jobs = list(db.scalars(select(ProcessingJob)).all())

    assert len(jobs) == 1
    assert jobs[0].status == "error"
    assert "múltiples cuentas" in (jobs[0].error_message or "").lower()
