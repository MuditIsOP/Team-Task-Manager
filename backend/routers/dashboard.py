from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from firebase import get_current_user
from models import ActivityLog, Project, ProjectMember, Task, TaskStatus, User
from schemas import DashboardActivityItemResponse, DashboardOverdueTaskResponse, DashboardStatsResponse
from routers.tasks import build_task_list_response

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def get_accessible_project_ids(db: AsyncSession, user: User) -> list:
    result = await db.execute(
        select(Project.id)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .where(or_(Project.owner_id == user.id, ProjectMember.user_id == user.id))
        .distinct()
    )
    return list(result.scalars().all())


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    project_ids = await get_accessible_project_ids(db, current_user)
    if not project_ids:
        return DashboardStatsResponse(total_tasks=0, by_status={}, overdue_count=0, per_member_count={})

    result = await db.execute(
        select(Task).where(Task.project_id.in_(project_ids)).options(selectinload(Task.assignee))
    )
    tasks = result.scalars().all()
    activity_result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.project_id.in_(project_ids), ActivityLog.action == "task.status_changed")
        .order_by(ActivityLog.created_at.desc())
    )
    completion_logs = activity_result.scalars().all()
    today = date.today()
    by_status: dict[str, int] = {}
    per_member_count: dict[str, int] = {}
    overdue_count = 0
    date_labels = [today - timedelta(days=offset) for offset in range(13, -1, -1)]
    daily_completed = {day.isoformat(): 0 for day in date_labels}

    for task in tasks:
        by_status[task.status.value] = by_status.get(task.status.value, 0) + 1
        if task.due_date is not None and task.due_date < today and task.status != TaskStatus.done:
            overdue_count += 1
        member_name = task.assignee.name if task.assignee else "Unassigned"
        per_member_count[member_name] = per_member_count.get(member_name, 0) + 1

    for log in completion_logs:
        if log.details.get("to") != TaskStatus.done.value or log.created_at is None:
            continue
        task_day = log.created_at.date().isoformat()
        if task_day in daily_completed:
            daily_completed[task_day] += 1

    return DashboardStatsResponse(
        total_tasks=len(tasks),
        by_status=by_status,
        overdue_count=overdue_count,
        per_member_count=per_member_count,
        daily_completed=[{"date": day, "count": count} for day, count in daily_completed.items()],
    )


@router.get("/overdue", response_model=list[DashboardOverdueTaskResponse])
async def get_overdue_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DashboardOverdueTaskResponse]:
    project_ids = await get_accessible_project_ids(db, current_user)
    if not project_ids:
        return []

    project_result = await db.execute(select(Project).where(Project.id.in_(project_ids)))
    projects = {project.id: project for project in project_result.scalars().all()}
    task_result = await db.execute(
        select(Task).where(Task.project_id.in_(project_ids)).options(selectinload(Task.assignee))
    )
    tasks = task_result.scalars().all()
    today = date.today()

    overdue_items: list[DashboardOverdueTaskResponse] = []
    for task in tasks:
        if task.due_date is None or task.due_date >= today or task.status == TaskStatus.done:
            continue
        base = build_task_list_response(task).model_dump()
        overdue_items.append(
            DashboardOverdueTaskResponse(
                **base,
                project_name=projects[task.project_id].name,
                days_overdue=(today - task.due_date).days,
            )
        )
    return overdue_items


@router.get("/activity", response_model=list[DashboardActivityItemResponse])
async def get_dashboard_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DashboardActivityItemResponse]:
    project_ids = await get_accessible_project_ids(db, current_user)
    if not project_ids:
        return []

    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.project_id.in_(project_ids))
        .options(selectinload(ActivityLog.user))
        .order_by(ActivityLog.created_at.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return [
        DashboardActivityItemResponse(
            id=log.id,
            project_id=log.project_id,
            action=log.action,
            metadata=log.details,
            created_at=log.created_at,
            actor_id=log.user.id,
            actor_name=log.user.name,
            actor_avatar_url=log.user.avatar_url,
        )
        for log in logs
    ]
