"""
Prueba E2E del flujo completo: HTTP → Celery → Redis → Worker → PostgreSQL.

REQUISITOS (todos deben estar corriendo antes de ejecutar):
  1. PostgreSQL con migraciones:
       alembic upgrade head
  2. Redis:
       docker run -d -p 6379:6379 redis:7
       — o —
       redis-server
  3. Celery worker (desde backend/ con virtualenv activo):
       celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
  4. API server (desde backend/ con virtualenv activo):
       uvicorn app.main:app --reload --port 8001

Ejecutar:
  cd backend/
  python -m pytest tests/e2e/test_celery_e2e.py -v -m e2e

Si el servidor no responde, los tests se saltan automáticamente.
"""
from __future__ import annotations

import time
import uuid
from io import BytesIO

import httpx
import openpyxl
import pytest

BASE_URL = "http://127.0.0.1:8001"
POLL_INTERVAL_S = 1
POLL_TIMEOUT_S = 30

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ── Helper para generar XLSX de prueba en formato Banco General ───────────────
def _make_bg_xlsx(*transaction_rows: list) -> bytes:
    """
    Genera un XLSX mínimo en formato Banco General.
    8 filas vacías de metadata + filas de transacciones.
    col0=fecha, col1=vacío, col2=ref, col3=trx, col4=descripcion,
    col5=débito (gasto), col6=crédito (ingreso).
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


_BG_XLSX = _make_bg_xlsx(
    ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 1234", 120.50, None],
    ["2026-03-11 12:54:04", None, "ref2", "trx2", "ACH XPRESS NOMINA", None, 1500.00],
    ["2026-03-12 09:00:00", None, "ref3", "trx3", "ENTRE CUENTAS", None, 500.00],
    ["2026-03-13 14:30:00", None, "ref4", "trx4", "SUPERMERCADO REY", 85.00, None],
)

_BG_XLSX_MULTI_ACCOUNT = _make_bg_xlsx(
    # Una débito, una crédito: garantiza que col6 tenga al menos un valor
    # no-nulo para que pandas lea 7 columnas. Sin esto, cuando col6=None en
    # todas las filas, openpyxl no persiste esa columna → len(row)=6 → skipped.
    ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 1234", 120.50, None],
    ["2026-03-11 12:54:04", None, "ref2", "trx2", "YAPPY BG 5678", None, 95.00],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_server_up() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/api/v1/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def _register_and_login(client: httpx.Client, username: str) -> str:
    """Registra un usuario y retorna el Bearer token."""
    r = client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@e2e.com",
            "password": "E2eSecret123!",
            "full_name": "E2E Test User",
        },
    )
    assert r.status_code == 201, f"register failed: {r.text}"

    r = client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": "E2eSecret123!"},
    )
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["access_token"]


def _poll_job(client: httpx.Client, job_id: str, headers: dict) -> dict:
    """Hace polling de GET /jobs/{job_id} hasta que el job termine o se agote el timeout."""
    deadline = time.monotonic() + POLL_TIMEOUT_S
    while time.monotonic() < deadline:
        r = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert r.status_code == 200, f"GET /jobs/{job_id} failed: {r.text}"
        job = r.json()
        if job["status"] in ("success", "error"):
            return job
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"Job {job_id} no terminó en {POLL_TIMEOUT_S}s. "
        "Verifica que el worker Celery esté corriendo."
    )


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def server_up() -> None:
    """Salta todos los tests del módulo si el servidor no responde."""
    if not _is_server_up():
        pytest.skip(
            "API server no disponible en http://127.0.0.1:8001. "
            "Inicia con: uvicorn app.main:app --reload --port 8001"
        )


@pytest.fixture(scope="module")
def http_client(server_up: None) -> httpx.Client:  # noqa: ARG001
    with httpx.Client(base_url=BASE_URL, timeout=10, follow_redirects=True) as client:
        yield client


@pytest.fixture
def auth_headers(http_client: httpx.Client) -> dict[str, str]:
    """Crea un usuario único por test y retorna sus headers de auth."""
    suffix = uuid.uuid4().hex[:8]
    token = _register_and_login(http_client, f"e2e_user_{suffix}")
    return {"Authorization": f"Bearer {token}"}


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.e2e
def test_upload_returns_202_with_job_id(http_client: httpx.Client, auth_headers: dict) -> None:
    """POST /upload debe retornar 202 inmediatamente con job_id y status='queued'."""
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=auth_headers,
    )

    assert r.status_code == 202, f"Esperaba 202, recibí {r.status_code}: {r.text}"
    payload = r.json()
    assert payload["status"] == "queued"
    assert "job_id" in payload
    assert payload["message"]


@pytest.mark.e2e
def test_full_celery_flow_success(http_client: httpx.Client, auth_headers: dict) -> None:
    """
    Flujo completo E2E:
      POST /upload → 202 → Celery worker procesa → job.status='success'
    """
    # 1. Subir archivo
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=auth_headers,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # 2. Polling hasta que el worker termine
    job = _poll_job(http_client, job_id, auth_headers)

    # 3. Verificar resultado
    assert job["status"] == "success", (
        f"El job terminó en estado '{job['status']}'. "
        f"error_message: {job.get('error_message')}"
    )
    assert job["original_filename"] == "estado_bg.xlsx"
    assert job["file_type"] == "xlsx"
    assert job["started_at"] is not None
    assert job["completed_at"] is not None


@pytest.mark.e2e
def test_analysis_snapshot_persisted_after_processing(
    http_client: httpx.Client, auth_headers: dict
) -> None:
    """
    Después de un procesamiento exitoso, GET /analysis debe retornar
    al menos un snapshot con los KPIs esperados.
    """
    # Upload + esperar
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=auth_headers,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    job = _poll_job(http_client, job_id, auth_headers)
    assert job["status"] == "success"

    # Verificar snapshot
    r = http_client.get("/api/v1/analysis", headers=auth_headers)
    assert r.status_code == 200
    snapshots = r.json()
    assert len(snapshots) >= 1

    latest = snapshots[0]
    assert latest["total_transactions"] == 4
    # ENTRE CUENTAS es solo_balance → no cuenta como ingreso
    assert latest["total_income"] == 1500.0
    assert latest["total_expenses"] == pytest.approx(205.5, rel=0.01)


@pytest.mark.e2e
def test_job_polling_endpoint(http_client: httpx.Client, auth_headers: dict) -> None:
    """GET /jobs/{job_id} retorna el estado correcto durante el ciclo de vida del job."""
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=auth_headers,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Estado inicial: queued o processing (el worker puede ser muy rápido)
    r = http_client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
    assert r.status_code == 200
    initial_status = r.json()["status"]
    assert initial_status in ("queued", "processing", "success")

    # Esperar al final
    final_job = _poll_job(http_client, job_id, auth_headers)
    assert final_job["status"] == "success"


@pytest.mark.e2e
def test_jobs_list_includes_new_job(http_client: httpx.Client, auth_headers: dict) -> None:
    """GET /jobs/ lista los jobs del usuario, incluye el recién creado."""
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=auth_headers,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    _poll_job(http_client, job_id, auth_headers)

    r = http_client.get("/api/v1/jobs/", headers=auth_headers)
    assert r.status_code == 200
    job_ids = [j["job_id"] for j in r.json()]
    assert job_id in job_ids


@pytest.mark.e2e
def test_multiple_accounts_in_file_results_in_error_job(
    http_client: httpx.Client, auth_headers: dict
) -> None:
    """
    Un archivo con múltiples last4 distintos debe resultar en job.status='error'
    con un mensaje descriptivo. Con el flujo async, el endpoint retorna 202.
    """
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_multi.xlsx", _BG_XLSX_MULTI_ACCOUNT, _XLSX_MIME)},
        headers=auth_headers,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    job = _poll_job(http_client, job_id, auth_headers)

    assert job["status"] == "error"
    assert job["error_message"] is not None
    assert "múltiples cuentas" in job["error_message"].lower()


@pytest.mark.e2e
def test_job_not_accessible_by_other_user(http_client: httpx.Client) -> None:
    """Un usuario no puede consultar el job de otro usuario."""
    suffix_a = uuid.uuid4().hex[:8]
    suffix_b = uuid.uuid4().hex[:8]

    token_a = _register_and_login(http_client, f"e2e_user_{suffix_a}")
    token_b = _register_and_login(http_client, f"e2e_user_{suffix_b}")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Usuario A sube un archivo
    r = http_client.post(
        "/api/v1/files/upload",
        files={"file": ("estado_bg.xlsx", _BG_XLSX, _XLSX_MIME)},
        headers=headers_a,
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Usuario B intenta consultar el job de A → 404
    r = http_client.get(f"/api/v1/jobs/{job_id}", headers=headers_b)
    assert r.status_code == 404
