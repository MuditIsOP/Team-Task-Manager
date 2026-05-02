import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from firebase import get_current_user
from models import ActivityLog, Comment, Notification, ProjectRole, Task, User
from routers.projects import get_member_role, require_admin
from schemas import TaskCreate, TaskDetailResponse, TaskListResponse, TaskResponse, TaskStatusUpdate, TaskUpdate
from websocket_manager import manager

router = APIRouter(tags=["tasks"])


def build_task_list_response(task: Task) -> TaskListResponse:
    return TaskListResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        project_id=task.project_id,
        assignee_id=task.assignee_id,
        due_date=task.due_date,
        labels=task.labels,
        attachments=task.attachments,
        created_at=task.created_at,
        assignee_name=task.assignee.name if task.assignee else None,
        assignee_avatar_url=task.assignee.avatar_url if task.assignee else None,
    )


def build_task_detail_response(task: Task) -> TaskDetailResponse:
    return TaskDetailResponse(
        **build_task_list_response(task).model_dump(),
        comments=[
            {
                "id": comment.id,
                "task_id": comment.task_id,
                "user_id": comment.user_id,
                "body": comment.body,
                "created_at": comment.created_at,
                "user_name": comment.user.name if comment.user else None,
                "user_avatar_url": comment.user.avatar_url if comment.user else None,
            }
            for comment in task.comments
        ],
    )


async def get_task_or_404(task_id: uuid.UUID, db: AsyncSession, *, include_comments: bool = False) -> Task:
    statement = select(Task).where(Task.id == task_id).options(selectinload(Task.assignee))
    if include_comments:
        statement = statement.options(selectinload(Task.comments).selectinload(Comment.user))

    result = await db.execute(statement)
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


async def log_task_activity(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    metadata: dict[str, Any],
) -> None:
    db.add(ActivityLog(project_id=project_id, user_id=user_id, action=action, details=metadata))


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    message: str,
    link: str | None,
) -> None:
    db.add(Notification(user_id=user_id, message=message, link=link))


def actor_payload(user: User) -> dict[str, str | None]:
    return {
        "id": str(user.id),
        "name": user.name,
        "avatar": user.avatar_url,
    }


@router.get("/projects/{project_id}/tasks", response_model=list[TaskListResponse])
async def list_project_tasks(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskListResponse]:
    await get_member_role(project_id, current_user.id, db)
    result = await db.execute(
        select(Task).where(Task.project_id == project_id).options(selectinload(Task.assignee))
    )
    tasks = result.scalars().all()
    return [build_task_list_response(task) for task in tasks]


@router.post("/tasks/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskResponse:
    await require_admin(payload.project_id, current_user.id, db)
    task = Task(**payload.model_dump())
    db.add(task)
    await db.flush()

    await log_task_activity(
        db,
        project_id=task.project_id,
        user_id=current_user.id,
        action="task.created",
        metadata={"task_id": str(task.id), "task_title": task.title},
    )

    if task.assignee_id is not None:
        assignee = await db.get(User, task.assignee_id)
        if assignee is not None:
            await log_task_activity(
                db,
                project_id=task.project_id,
                user_id=current_user.id,
                action="task.assigned",
                metadata={"task_id": str(task.id), "assignee_name": assignee.name},
            )
            await create_notification(
                db,
                user_id=assignee.id,
                message=f"You were assigned to task '{task.title}'.",
                link=f"/project/{task.project_id}",
            )

    await db.commit()
    await db.refresh(task)
    if task.assignee_id is not None:
        task.assignee = await db.get(User, task.assignee_id)
    await manager.broadcast(
        str(task.project_id),
        {"event": "task.created", "data": build_task_list_response(task).model_dump(mode="json"), "actor": actor_payload(current_user)},
    )
    return task


@router.get("/tasks/{task_id}", response_model=TaskDetailResponse)
async def get_task_detail(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskDetailResponse:
    task = await get_task_or_404(task_id, db, include_comments=True)
    await get_member_role(task.project_id, current_user.id, db)
    return build_task_detail_response(task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskResponse:
    task = await get_task_or_404(task_id, db)
    role = await get_member_role(task.project_id, current_user.id, db)
    previous_assignee_id = task.assignee_id
    update_data = payload.model_dump(exclude_unset=True)

    if role != ProjectRole.admin:
        allowed_member_fields = {"attachments"}
        if set(update_data.keys()) - allowed_member_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required for this task update.",
            )

    for field, value in update_data.items():
        setattr(task, field, value)

    if "assignee_id" in update_data and task.assignee_id != previous_assignee_id and task.assignee_id is not None:
        assignee = await db.get(User, task.assignee_id)
        if assignee is not None:
            await log_task_activity(
                db,
                project_id=task.project_id,
                user_id=current_user.id,
                action="task.assigned",
                metadata={"task_id": str(task.id), "assignee_name": assignee.name},
            )
            await create_notification(
                db,
                user_id=assignee.id,
                message=f"You were assigned to task '{task.title}'.",
                link=f"/project/{task.project_id}",
            )

    await db.commit()
    await db.refresh(task)
    task.assignee = await db.get(User, task.assignee_id) if task.assignee_id is not None else None
    await manager.broadcast(
        str(task.project_id),
        {"event": "task.updated", "data": build_task_list_response(task).model_dump(mode="json"), "actor": actor_payload(current_user)},
    )
    return task


@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: uuid.UUID,
    payload: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskResponse:
    task = await get_task_or_404(task_id, db)
    await get_member_role(task.project_id, current_user.id, db)

    previous_status = task.status
    task.status = payload.status

    if previous_status != task.status:
        await log_task_activity(
            db,
            project_id=task.project_id,
            user_id=current_user.id,
            action="task.status_changed",
            metadata={
                "task_id": str(task.id),
                "task_title": task.title,
                "from": previous_status.value,
                "to": task.status.value,
            },
        )

    await db.commit()
    await db.refresh(task)
    task.assignee = await db.get(User, task.assignee_id) if task.assignee_id is not None else None
    await manager.broadcast(
        str(task.project_id),
        {"event": "task.updated", "data": build_task_list_response(task).model_dump(mode="json"), "actor": actor_payload(current_user)},
    )
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    task = await get_task_or_404(task_id, db)
    await require_admin(task.project_id, current_user.id, db)
    event_data = {
        "id": str(task.id),
        "project_id": str(task.project_id),
        "title": task.title,
    }
    await db.delete(task)
    await db.commit()
    await manager.broadcast(
        str(task.project_id),
        {"event": "task.deleted", "data": event_data, "actor": actor_payload(current_user)},
    )
    return None
