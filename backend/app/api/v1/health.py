from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.head("/health")
def health_check_head() -> Response:
    return Response(status_code=200)