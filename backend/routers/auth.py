from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from firebase import upsert_user_from_token, verify_firebase_token
from schemas import FirebaseTokenRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/verify", response_model=UserResponse)
async def verify_auth_token(
    payload: FirebaseTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    decoded_token = verify_firebase_token(payload.token)
    user = await upsert_user_from_token(decoded_token, db)
    return user
