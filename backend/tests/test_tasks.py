from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList

from database import get_db
from firebase import get_current_user
from main import app
from models import ActivityLog, Notification, Project, ProjectMember, ProjectRole, Task, TaskPriority, TaskStatus, User


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

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self._values)

    def scalar_one(self) -> Any:
        if not self._values:
            raise AssertionError("Expected a scalar result.")
        return self._values[0]


class FakeAsyncSession:
    def __init__(self) -> None:
        self.users: dict[UUID, User] = {}
        self.projects: dict[UUID, Project] = {}
        self.project_members: dict[tuple[UUID, UUID], ProjectMember] = {}
        self.tasks: dict[UUID, Task] = {}
        self.activity_logs: list[ActivityLog] = []
        self.notifications: list[Notification] = []

    def seed_user(self, user: User) -> User:
        if user.id is None:
            user.id = uuid4()
        if user.created_at is None:
            user.created_at = datetime.now(timezone.utc)
        self.users[user.id] = user
        return user

    def add(self, obj: Any) -> None:
        if hasattr(obj, "id") and getattr(obj, "id", None) is None:
            obj.id = uuid4()
        if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

        if isinstance(obj, Project):
            self.projects[obj.id] = obj
        elif isinstance(obj, ProjectMember):
            self.project_members[(obj.project_id, obj.user_id)] = obj
        elif isinstance(obj, Task):
            if obj.labels is None:
                obj.labels = []
            if obj.attachments is None:
                obj.attachments = []
            obj.assignee = self.users.get(obj.assignee_id) if obj.assignee_id else None
            obj.comments = []
            self.tasks[obj.id] = obj
        elif isinstance(obj, ActivityLog):
            self.activity_logs.append(obj)
        elif isinstance(obj, Notification):
            self.notifications.append(obj)

    async def get(self, model: Any, identity: Any) -> Any:
        if model is Project:
            return self.projects.get(identity)
        if model is ProjectMember:
            if isinstance(identity, dict):
                return self.project_members.get((identity["project_id"], identity["user_id"]))
        if model is Task:
            return self.tasks.get(identity)
        if model is User:
            return self.users.get(identity)
        return None

    async def execute(self, statement: Any) -> FakeResult:
        entity = statement.column_descriptions[0].get("entity")
        if entity is Task:
            task_id = self._extract_value(statement.whereclause, "id")
            if task_id is not None:
                task = self.tasks.get(task_id)
                if task is not None:
                    task.assignee = self.users.get(task.assignee_id) if task.assignee_id else None
                return FakeResult([task] if task is not None else [])

            project_id = self._extract_value(statement.whereclause, "project_id")
            values = [task for task in self.tasks.values() if task.project_id == project_id]
            for task in values:
                task.assignee = self.users.get(task.assignee_id) if task.assignee_id else None
            return FakeResult(values)

        if entity is Project:
            project_ids = self._extract_in_values(statement.whereclause, "id")
            if project_ids is not None:
                values = [project for project in self.projects.values() if project.id in project_ids]
                return FakeResult(values)
            project_id = self._extract_value(statement.whereclause, "id")
            project = self.projects.get(project_id)
            return FakeResult([project] if project is not None else [])

        if entity is ActivityLog:
            return FakeResult(self.activity_logs)

        if statement.column_descriptions[0].get("name") == "id" and "FROM projects" in str(statement):
            user_id = self._extract_value(statement.whereclause, "user_id")
            values = []
            for project in self.projects.values():
                is_owner = project.owner_id == user_id
                is_member = (project.id, user_id) in self.project_members
                if is_owner or is_member:
                    values.append(project.id)
            return FakeResult(values)

        return FakeResult([])

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def refresh(self, obj: Any) -> None:
        if isinstance(obj, Task):
            obj.assignee = self.users.get(obj.assignee_id) if obj.assignee_id else None
            if not hasattr(obj, "comments") or obj.comments is None:
                obj.comments = []

    async def delete(self, obj: Any) -> None:
        if isinstance(obj, Task):
            self.tasks.pop(obj.id, None)

    def _extract_value(self, clause: Any, column_name: str) -> Any:
        if isinstance(clause, BinaryExpression) and clause.left.name == column_name:
            return clause.right.value
        if isinstance(clause, BooleanClauseList):
            for child in clause.clauses:
                value = self._extract_value(child, column_name)
                if value is not None:
                    return value
        return None

    def _extract_in_values(self, clause: Any, column_name: str) -> set[Any] | None:
        if clause is None:
            return None
        if isinstance(clause, BinaryExpression) and clause.left.name == column_name:
            right = clause.right
            if hasattr(right, "value") and isinstance(right.value, (list, tuple, set)):
                return set(right.value)
        if isinstance(clause, BooleanClauseList):
            for child in clause.clauses:
                value = self._extract_in_values(child, column_name)
                if value is not None:
                    return value
        return None


@pytest.fixture
def fake_db_session() -> FakeAsyncSession:
    return FakeAsyncSession()


@pytest.fixture
def users(fake_db_session: FakeAsyncSession) -> dict[str, User]:
    admin = fake_db_session.seed_user(User(firebase_uid="admin-1", name="Admin", email="admin@example.com"))
    member = fake_db_session.seed_user(User(firebase_uid="member-1", name="Member", email="member@example.com"))
    return {"admin": admin, "member": member}


@pytest.fixture
def auth_state(users: dict[str, User]) -> dict[str, User]:
    return {"current_user": users["admin"]}


@pytest.fixture
def project(fake_db_session: FakeAsyncSession, users: dict[str, User]) -> Project:
    project = Project(name="App Build", description="Ship v1", owner_id=users["admin"].id)
    fake_db_session.add(project)
    fake_db_session.add(ProjectMember(project_id=project.id, user_id=users["admin"].id, role=ProjectRole.admin))
    fake_db_session.add(ProjectMember(project_id=project.id, user_id=users["member"].id, role=ProjectRole.member))
    return project


@pytest.fixture
def existing_task(fake_db_session: FakeAsyncSession, project: Project, users: dict[str, User]) -> Task:
    task = Task(
        title="Draft API",
        description="Build endpoints",
        status=TaskStatus.todo,
        priority=TaskPriority.medium,
        project_id=project.id,
        assignee_id=users["member"].id,
        labels=[],
        attachments=[],
    )
    fake_db_session.add(task)
    return task


@pytest.fixture
def client(fake_db_session: FakeAsyncSession, auth_state: dict[str, User]) -> AsyncGenerator[TestClient, None]:
    async def override_get_db() -> AsyncGenerator[FakeAsyncSession, None]:
        yield fake_db_session

    async def override_get_current_user() -> User:
        return auth_state["current_user"]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_admin_creates_task(client: TestClient, fake_db_session: FakeAsyncSession, project: Project) -> None:
    response = client.post(
        "/tasks/",
        json={
            "title": "Design schema",
            "description": "Create DB tables",
            "status": "todo",
            "priority": "high",
            "project_id": str(project.id),
            "assignee_id": None,
            "due_date": None,
            "labels": ["backend"],
            "attachments": [],
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert UUID(created["project_id"]) == project.id
    assert any(log.action == "task.created" for log in fake_db_session.activity_logs)


def test_member_cannot_create_task(
    client: TestClient,
    auth_state: dict[str, User],
    users: dict[str, User],
    project: Project,
) -> None:
    auth_state["current_user"] = users["member"]

    response = client.post(
        "/tasks/",
        json={
            "title": "Design schema",
            "description": "Create DB tables",
            "status": "todo",
            "priority": "high",
            "project_id": str(project.id),
            "assignee_id": None,
            "due_date": None,
            "labels": [],
            "attachments": [],
        },
    )

    assert response.status_code == 403


def test_member_can_update_status(
    client: TestClient,
    auth_state: dict[str, User],
    users: dict[str, User],
    existing_task: Task,
    fake_db_session: FakeAsyncSession,
) -> None:
    auth_state["current_user"] = users["member"]

    response = client.patch(f"/tasks/{existing_task.id}/status", json={"status": "done"})

    assert response.status_code == 200
    assert response.json()["status"] == "done"
    assert any(log.action == "task.status_changed" for log in fake_db_session.activity_logs)


def test_member_cannot_update_title(
    client: TestClient,
    auth_state: dict[str, User],
    users: dict[str, User],
    existing_task: Task,
) -> None:
    auth_state["current_user"] = users["member"]

    response = client.patch(f"/tasks/{existing_task.id}", json={"title": "New title"})

    assert response.status_code == 403


def test_overdue_detection_returns_only_past_due_open_tasks(
    client: TestClient,
    fake_db_session: FakeAsyncSession,
    project: Project,
    users: dict[str, User],
) -> None:
    overdue_task = Task(
        title="Past Due",
        description="Needs attention",
        status=TaskStatus.in_progress,
        priority=TaskPriority.high,
        project_id=project.id,
        assignee_id=users["member"].id,
        due_date=date.today() - timedelta(days=3),
        labels=[],
        attachments=[],
    )
    done_task = Task(
        title="Completed",
        description="Already finished",
        status=TaskStatus.done,
        priority=TaskPriority.medium,
        project_id=project.id,
        assignee_id=users["member"].id,
        due_date=date.today() - timedelta(days=1),
        labels=[],
        attachments=[],
    )
    future_task = Task(
        title="Future",
        description="Not overdue",
        status=TaskStatus.todo,
        priority=TaskPriority.low,
        project_id=project.id,
        assignee_id=users["admin"].id,
        due_date=date.today() + timedelta(days=4),
        labels=[],
        attachments=[],
    )

    fake_db_session.add(overdue_task)
    fake_db_session.add(done_task)
    fake_db_session.add(future_task)

    response = client.get("/dashboard/overdue")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Past Due"
    assert body[0]["days_overdue"] == 3
