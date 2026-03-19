from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.account import AccountCreate, AccountResponse, AccountUpdate
from app.services.account_service import AccountService

router = APIRouter()


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountResponse:
    service = AccountService(db)
    account = service.create_account(payload, current_user)
    return AccountResponse.model_validate(account)


@router.get("", response_model=list[AccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccountResponse]:
    service = AccountService(db)
    accounts = service.list_accounts(current_user)
    return [AccountResponse.model_validate(account) for account in accounts]


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountResponse:
    service = AccountService(db)
    account = service.get_account(account_id, current_user)
    return AccountResponse.model_validate(account)


@router.patch("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: UUID,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountResponse:
    service = AccountService(db)
    account = service.update_account(account_id, payload, current_user)
    return AccountResponse.model_validate(account)


@router.delete("/{account_id}", response_model=AccountResponse)
def deactivate_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountResponse:
    service = AccountService(db)
    account = service.deactivate_account(account_id, current_user)
    return AccountResponse.model_validate(account)