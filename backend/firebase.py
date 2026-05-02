import os
from typing import Any

import firebase_admin
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from firebase_admin import auth, credentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User

load_dotenv()


def _firebase_credentials() -> credentials.Certificate:
    private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
    project_id = os.getenv("FIREBASE_PROJECT_ID", "")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL", "")

    if not project_id or not private_key or not client_email:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials are not configured.",
        )

    return credentials.Certificate(
        {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )


def get_firebase_app() -> firebase_admin.App:
    app = firebase_admin.get_app() if firebase_admin._apps else None
    if app is not None:
        return app
    return firebase_admin.initialize_app(_firebase_credentials())


def verify_firebase_token(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Firebase token.")

    try:
        app = get_firebase_app()
        return auth.verify_id_token(token, app=app)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - firebase raises library-specific errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token.",
        ) from exc


async def upsert_user_from_token(decoded_token: dict[str, Any], db: AsyncSession) -> User:
    firebase_uid = decoded_token.get("uid") or decoded_token.get("user_id")
    email = decoded_token.get("email")

    if not firebase_uid or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token is missing required user fields.",
        )

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    display_name = decoded_token.get("name") or email.split("@", 1)[0]
    avatar_url = decoded_token.get("picture")

    if user is None:
        user = User(
            firebase_uid=firebase_uid,
            name=display_name,
            email=email,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        user.name = display_name
        user.email = email
        user.avatar_url = avatar_url

    await db.commit()
    await db.refresh(user)
    return user


async def get_user_from_token(token: str, db: AsyncSession) -> User:
    decoded_token = verify_firebase_token(token)
    return await upsert_user_from_token(decoded_token, db)


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header.",
        )

    user = await get_user_from_token(token, db)
    request.state.current_user = user
    return user
