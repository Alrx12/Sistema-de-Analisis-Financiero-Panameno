from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.auth import router as auth_router
from app.api.v1.files import router as files_router
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.transactions import router as transactions_router
from app.api.v1.users import router as users_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(accounts_router, prefix="/accounts", tags=["accounts"])
api_router.include_router(files_router, prefix="/files", tags=["files"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(transactions_router, prefix="/transactions", tags=["transactions"])
api_router.include_router(users_router, prefix="/users", tags=["users"])