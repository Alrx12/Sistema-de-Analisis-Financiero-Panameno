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

import openpyxl
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


# ── Helpers para generar XLSX de prueba ───────────────────────────────────────

def _make_bg_xlsx(*transaction_rows: list) -> bytes:
    """
    Genera un XLSX mínimo en formato Banco General.

    Estructura esperada por BancoGeneralParser._extraer_format1:
      - 8 filas vacías de metadata/encabezado (header_row defaults a 7)
      - Filas de transacciones: col0=fecha, col1=vacío, col2=ref, col3=trx,
        col4=descripcion, col5=débito (gasto), col6=crédito (ingreso)

    El parser salta las filas con idx <= header_row (7) y procesa a partir
    de la fila 8 (índice 8, novena fila).
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    for _ in range(8):
        ws.append([None] * 7)
    for row in transaction_rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Fixtures XLSX ─────────────────────────────────────────────────────────────
# Formato: col0=fecha, col1=None, col2=ref, col3=trx, col4=descripcion,
#          col5=débito (float, gasto), col6=crédito (float, ingreso)

BG_XLSX_WITH_LAST4 = _make_bg_xlsx(
    ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 1234", 120.50, None],
    ["2026-03-11 12:54:04", None, "ref2", "trx2", "ACH XPRESS NOMINA", None, 1500.00],
)

BG_XLSX_MULTI_ACCOUNT = _make_bg_xlsx(
    # Una fila usa débito (col5) y la otra crédito (col6).
    # Si ambas tuvieran col6=None, openpyxl no persiste esa columna → pandas
    # lee solo 6 columnas por fila → _extraer_format1 las descarta (len(row) < 7).
    ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 1234", 120.50, None],
    ["2026-03-11 12:54:04", None, "ref2", "trx2", "YAPPY BG 5678", None, 95.00],
)

BG_XLSX_REUSE = _make_bg_xlsx(
    ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 5555", 120.50, None],
    ["2026-03-11 12:54:04", None, "ref2", "trx2", "ACH XPRESS NOMINA", None, 1500.00],
)

# Fixture sin ningún número de 4 dígitos en ningún campo.
# _find_last4 retorna None en todos → account_signatures vacío → detected_last4=None
# → _compute_confidence_score("Banco General", None) = 0.35
# Regla: necesita al menos una fila con col6 != None para que openpyxl persista esa columna.
BG_XLSX_NO_LAST4 = _make_bg_xlsx(
    ["2026-03-10 12:54:04", None, "ref-abc", "trx-xyz", "SALARIO EMPRESA", None, 1500.00],
    ["2026-03-11 12:54:04", None, "ref-def", "trx-uvw", "SUPERMERCADO REY", 90.50, None],
)


def test_upload_returns_202_and_processes_async(client: TestClient) -> None:
    """El endpoint retorna 202 inmediatamente; la tarea se ejecuta de forma síncrona en tests."""
    headers = register_and_login(client, "files-user")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_WITH_LAST4), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
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
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_WITH_LAST4), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )

    assert response.status_code == 202

    with TestingSessionLocal() as db:
        jobs = list(db.scalars(select(ProcessingJob)).all())
        snapshots = list(db.scalars(select(AnalysisSnapshot)).all())
        accounts = list(db.scalars(select(BankAccount)).all())

    assert len(jobs) == 1
    assert jobs[0].status == "success"
    assert jobs[0].original_filename == "estado_bg.xlsx"
    assert jobs[0].file_type == "xlsx"

    assert len(snapshots) == 1
    assert snapshots[0].summary["total_transactions"] == 2

    assert len(accounts) == 1
    assert accounts[0].detection_source == "file"
    assert float(accounts[0].confidence_score) == 0.95


def test_upload_analysis_totals(client: TestClient) -> None:
    headers = register_and_login(client, "files-totals")

    client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_WITH_LAST4), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )

    with TestingSessionLocal() as db:
        snapshot = db.scalars(select(AnalysisSnapshot)).first()

    assert snapshot is not None
    assert snapshot.summary["total_income"] == 1500.0
    assert snapshot.summary["total_expenses"] == 120.5


def test_upload_without_last4_creates_low_confidence_account(client: TestClient) -> None:
    """
    Cuando el banco es identificado pero no hay últimos 4 dígitos en ninguna
    transacción, la cuenta se crea con confidence_score=0.35.

    Esto ejercita el path de _compute_confidence_score con last4=None:
        bank_name conocido + no last4 → 0.35
    """
    headers = register_and_login(client, "files-low-confidence")

    response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_NO_LAST4), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
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
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_REUSE), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert first_response.status_code == 202

    second_response = client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_REUSE), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
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
        files={"file": ("estado_bg.xlsx", BytesIO(BG_XLSX_MULTI_ACCOUNT), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )

    assert response.status_code == 202

    with TestingSessionLocal() as db:
        jobs = list(db.scalars(select(ProcessingJob)).all())

    assert len(jobs) == 1
    assert jobs[0].status == "error"
    assert "múltiples cuentas" in (jobs[0].error_message or "").lower()
