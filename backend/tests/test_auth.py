from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.sql.elements import BinaryExpression

from database import get_db
from main import app
from models import User


class FakeResult:
    def __init__(self, value: Any) -> None:
        self._value = value

    def scalar_one_or_none(self) -> Any:
        return self._value


class FakeAsyncSession:
    def __init__(self) -> None:
        self.users_by_firebase_uid: dict[str, User] = {}
        self.users_by_id: dict[str, User] = {}

    async def execute(self, statement: Any) -> FakeResult:
        whereclause = statement.whereclause
        if isinstance(whereclause, BinaryExpression):
            column_name = whereclause.left.name
            value = whereclause.right.value
            if column_name == "firebase_uid":
                return FakeResult(self.users_by_firebase_uid.get(value))
        return FakeResult(None)

    def add(self, user: User) -> None:
        if user.id is None:
            user.id = uuid4()
        if user.created_at is None:
            user.created_at = datetime.now(timezone.utc)
        self.users_by_firebase_uid[user.firebase_uid] = user
        self.users_by_id[str(user.id)] = user

    async def commit(self) -> None:
        return None

    async def refresh(self, user: User) -> None:
        if user.id is None:
            raise AssertionError("Expected ORM user to have an id after insert.")


@pytest.fixture
def fake_db_session() -> FakeAsyncSession:
    return FakeAsyncSession()


@pytest.fixture
def client(fake_db_session: FakeAsyncSession) -> AsyncGenerator[TestClient, None]:
    async def override_get_db() -> AsyncGenerator[FakeAsyncSession, None]:
        yield fake_db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_verify_valid_token_creates_user(
    client: TestClient,
    fake_db_session: FakeAsyncSession,
    mocker: Any,
) -> None:
    mocker.patch(
        "firebase.auth.verify_id_token",
        return_value={
            "uid": "firebase-user-123",
            "email": "sarah@example.com",
            "name": "Sarah Connor",
            "picture": "https://example.com/avatar.png",
        },
    )
    mocker.patch("firebase.get_firebase_app", return_value=object())

    response = client.post("/auth/verify", json={"token": "valid-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["firebase_uid"] == "firebase-user-123"
    assert body["email"] == "sarah@example.com"
    assert body["name"] == "Sarah Connor"
    assert fake_db_session.users_by_firebase_uid["firebase-user-123"].avatar_url == "https://example.com/avatar.png"


def test_verify_invalid_token_returns_401(
    client: TestClient,
    mocker: Any,
) -> None:
    mocker.patch(
        "firebase.auth.verify_id_token",
        side_effect=ValueError("bad token"),
    )
    mocker.patch("firebase.get_firebase_app", return_value=object())

    response = client.post("/auth/verify", json={"token": "invalid-token"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid Firebase token."


def test_missing_authorization_header_returns_401(client: TestClient) -> None:
    response = client.get("/users/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Authorization header."
