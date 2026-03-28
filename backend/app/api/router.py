from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.analysis import router as analysis_router
from app.api.v1.auth import router as auth_router
from app.api.v1.files import router as files_router
from app.api.v1.goals import router as goals_router
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.kb import router as kb_router
from app.api.v1.manual_transactions import router as manual_transactions_router
from app.api.v1.profile import router as profile_router
from app.api.v1.transactions import router as transactions_router
from app.api.v1.users import router as users_router
from app.api.v1.wallets import router as wallets_router


api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(accounts_router, prefix="/accounts", tags=["accounts"])
api_router.include_router(analysis_router, prefix="/analysis", tags=["analysis"])
api_router.include_router(files_router, prefix="/files", tags=["files"])
api_router.include_router(goals_router, prefix="/goals", tags=["goals"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(kb_router, prefix="/kb", tags=["kb"])
api_router.include_router(manual_transactions_router, prefix="/manual-transactions", tags=["manual-transactions"])
api_router.include_router(transactions_router, prefix="/transactions", tags=["transactions"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(profile_router, prefix="/users", tags=["profile"])
api_router.include_router(wallets_router, prefix="/wallets", tags=["wallets"])