from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList

from database import get_db
from firebase import get_current_user
from main import app
from models import ActivityLog, Notification, Project, ProjectMember, ProjectRole, User


class FakeScalarResult:
    def __init__(self, values: list[Any]) -> None:
        self._values = values

    def all(self) -> list[Any]:
        return list(self._values)


class FakeResult:
    def __init__(self, values: list[Any]) -> None:
        self._values = values

    def scalar_one_or_none(self) -> Any:
        return self._values[0] if self._values else None

    def scalar_one(self) -> Any:
        if not self._values:
            raise AssertionError("Expected a scalar result.")
        return self._values[0]

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self._values)


class FakeAsyncSession:
    def __init__(self) -> None:
        self.users: dict[UUID, User] = {}
        self.projects: dict[UUID, Project] = {}
        self.project_members: dict[tuple[UUID, UUID], ProjectMember] = {}
        self.activity_logs: list[ActivityLog] = []
        self.notifications: list[Notification] = []

    def seed_user(self, user: User) -> User:
        if user.id is None:
            user.id = uuid4()
        if user.created_at is None:
            user.created_at = datetime.now(timezone.utc)
        self.users[user.id] = user
        return user

    def _apply_defaults(self, obj: Any) -> None:
        if hasattr(obj, "id") and getattr(obj, "id", None) is None:
            obj.id = uuid4()
        if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    async def get(self, model: Any, identity: Any) -> Any:
        if model is Project:
            return self.projects.get(identity)
        if model is ProjectMember:
            if isinstance(identity, dict):
                key = (identity["project_id"], identity["user_id"])
            else:
                key = identity
            return self.project_members.get(key)
        if model is User:
            return self.users.get(identity)
        return None

    async def execute(self, statement: Any) -> FakeResult:
        entity = statement.column_descriptions[0].get("entity")
        if entity is Project:
            if "project_members.user_id" in str(statement):
                user_id = self._extract_value(statement.whereclause, "user_id")
                values = []
                for project in self.projects.values():
                    is_owner = project.owner_id == user_id
                    is_member = (project.id, user_id) in self.project_members
                    if is_owner or is_member:
                        values.append(project)
                return FakeResult(values)

            project_id = self._extract_value(statement.whereclause, "id")
            project = self.projects.get(project_id)
            if project is not None and "user" in str(statement):
                project.members = self._members_for_project(project.id)
            return FakeResult([project] if project is not None else [])

        if entity is User:
            email = self._extract_value(statement.whereclause, "email")
            for user in self.users.values():
                if user.email == email:
                    return FakeResult([user])
            return FakeResult([])

        if "count(" in str(statement):
            project_id = self._extract_value(statement.whereclause, "project_id")
            admin_count = sum(
                1
                for member in self.project_members.values()
                if member.project_id == project_id and member.role == ProjectRole.admin
            )
            return FakeResult([admin_count])

        return FakeResult([])

    def add(self, obj: Any) -> None:
        self._apply_defaults(obj)
        if isinstance(obj, Project):
            self.projects[obj.id] = obj
            return
        if isinstance(obj, ProjectMember):
            self.project_members[(obj.project_id, obj.user_id)] = obj
            return
        if isinstance(obj, ActivityLog):
            self.activity_logs.append(obj)
            return
        if isinstance(obj, Notification):
            self.notifications.append(obj)
            return
        if isinstance(obj, User):
            self.users[obj.id] = obj

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def refresh(self, obj: Any) -> None:
        if isinstance(obj, Project):
            obj.members = self._members_for_project(obj.id)
        if isinstance(obj, ProjectMember):
            obj.user = self.users[obj.user_id]

    async def delete(self, obj: Any) -> None:
        if isinstance(obj, Project):
            self.projects.pop(obj.id, None)
            member_keys = [key for key in self.project_members if key[0] == obj.id]
            for key in member_keys:
                self.project_members.pop(key, None)
            self.activity_logs = [log for log in self.activity_logs if log.project_id != obj.id]
            return
        if isinstance(obj, ProjectMember):
            self.project_members.pop((obj.project_id, obj.user_id), None)

    def _members_for_project(self, project_id: UUID) -> list[ProjectMember]:
        members = [member for member in self.project_members.values() if member.project_id == project_id]
        for member in members:
            member.user = self.users[member.user_id]
        return members

    def _extract_value(self, clause: Any, column_name: str) -> Any:
        if clause is None:
            return None
        if isinstance(clause, BinaryExpression) and clause.left.name == column_name:
            return clause.right.value
        if isinstance(clause, BooleanClauseList):
            for child in clause.clauses:
                value = self._extract_value(child, column_name)
                if value is not None:
                    return value
        return None


@pytest.fixture
def fake_db_session() -> FakeAsyncSession:
    return FakeAsyncSession()


@pytest.fixture
def users(fake_db_session: FakeAsyncSession) -> dict[str, User]:
    admin = fake_db_session.seed_user(
        User(firebase_uid="admin-1", name="Admin User", email="admin@example.com", avatar_url=None)
    )
    member = fake_db_session.seed_user(
        User(firebase_uid="member-1", name="Member User", email="member@example.com", avatar_url=None)
    )
    outsider = fake_db_session.seed_user(
        User(firebase_uid="outsider-1", name="Outside User", email="outside@example.com", avatar_url=None)
    )
    invitee = fake_db_session.seed_user(
        User(firebase_uid="invitee-1", name="Invited User", email="invitee@example.com", avatar_url=None)
    )
    return {"admin": admin, "member": member, "outsider": outsider, "invitee": invitee}


@pytest.fixture
def auth_state(users: dict[str, User]) -> dict[str, User]:
    return {"current_user": users["admin"]}


@pytest.fixture
def client(
    fake_db_session: FakeAsyncSession,
    auth_state: dict[str, User],
) -> AsyncGenerator[TestClient, None]:
    async def override_get_db() -> AsyncGenerator[FakeAsyncSession, None]:
        yield fake_db_session

    async def override_get_current_user() -> User:
        return auth_state["current_user"]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def existing_project(fake_db_session: FakeAsyncSession, users: dict[str, User]) -> Project:
    project = Project(name="Launch Plan", description="Initial scope", owner_id=users["admin"].id)
    fake_db_session.add(project)
    fake_db_session.add(
        ProjectMember(project_id=project.id, user_id=users["admin"].id, role=ProjectRole.admin)
    )
    fake_db_session.add(
        ProjectMember(project_id=project.id, user_id=users["member"].id, role=ProjectRole.member)
    )
    return project


def test_admin_can_create_update_and_delete_project(
    client: TestClient,
    fake_db_session: FakeAsyncSession,
    users: dict[str, User],
) -> None:
    create_response = client.post("/projects/", json={"name": "Roadmap", "description": "Q3 delivery"})

    assert create_response.status_code == 201
    created_project_id = UUID(create_response.json()["id"])
    assert fake_db_session.projects[created_project_id].owner_id == users["admin"].id
    assert fake_db_session.project_members[(created_project_id, users["admin"].id)].role == ProjectRole.admin

    update_response = client.patch(
        f"/projects/{created_project_id}",
        json={"name": "Roadmap Updated", "description": "Q4 delivery"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Roadmap Updated"

    delete_response = client.delete(f"/projects/{created_project_id}")
    assert delete_response.status_code == 204
    assert created_project_id not in fake_db_session.projects


def test_list_projects_returns_owned_and_member_projects(
    client: TestClient,
    fake_db_session: FakeAsyncSession,
    users: dict[str, User],
) -> None:
    owned_project = Project(name="Owned", description="Owner view", owner_id=users["admin"].id)
    member_project = Project(name="Member", description="Member view", owner_id=users["invitee"].id)
    outsider_project = Project(name="Outside", description="Should not show", owner_id=users["outsider"].id)

    fake_db_session.add(owned_project)
    fake_db_session.add(member_project)
    fake_db_session.add(outsider_project)
    fake_db_session.add(
        ProjectMember(project_id=owned_project.id, user_id=users["admin"].id, role=ProjectRole.admin)
    )
    fake_db_session.add(
        ProjectMember(project_id=member_project.id, user_id=users["admin"].id, role=ProjectRole.member)
    )
    fake_db_session.add(
        ProjectMember(project_id=member_project.id, user_id=users["invitee"].id, role=ProjectRole.admin)
    )
    fake_db_session.add(
        ProjectMember(project_id=outsider_project.id, user_id=users["outsider"].id, role=ProjectRole.admin)
    )

    response = client.get("/projects/")

    assert response.status_code == 200
    returned_ids = {UUID(item["id"]) for item in response.json()}
    assert owned_project.id in returned_ids
    assert member_project.id in returned_ids
    assert outsider_project.id not in returned_ids


def test_member_cannot_update_or_delete_project(
    client: TestClient,
    auth_state: dict[str, User],
    users: dict[str, User],
    existing_project: Project,
) -> None:
    auth_state["current_user"] = users["member"]

    update_response = client.patch(f"/projects/{existing_project.id}", json={"name": "Nope"})
    delete_response = client.delete(f"/projects/{existing_project.id}")

    assert update_response.status_code == 403
    assert delete_response.status_code == 403


def test_add_member_by_email_works(
    client: TestClient,
    fake_db_session: FakeAsyncSession,
    users: dict[str, User],
    existing_project: Project,
) -> None:
    response = client.post(f"/projects/{existing_project.id}/members", json={"email": "invitee@example.com"})

    assert response.status_code == 201
    assert fake_db_session.project_members[(existing_project.id, users["invitee"].id)].role == ProjectRole.member
    assert any(log.action == "member.joined" for log in fake_db_session.activity_logs)


def test_non_member_cannot_view_project(
    client: TestClient,
    auth_state: dict[str, User],
    users: dict[str, User],
    existing_project: Project,
) -> None:
    auth_state["current_user"] = users["outsider"]

    response = client.get(f"/projects/{existing_project.id}")

    assert response.status_code == 403
