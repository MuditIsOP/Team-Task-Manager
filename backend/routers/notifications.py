import os
import uuid
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db, get_sessionmaker
from firebase import get_current_user
from models import Notification, Task, TaskStatus, User
from schemas import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])

scheduler = AsyncIOScheduler()


def _resend_api_key() -> str:
    return (
        os.getenv("RESEND_API_KEY")
        or os.getenv("RECENT_API_K")
        or os.getenv("RECENT_API_KEY")
        or ""
    )


def _resend_from_email() -> str:
    return os.getenv("RESEND_FROM_EMAIL") or "onboarding@resend.dev"


def _can_send_email() -> bool:
    return bool(_resend_api_key())


def send_notification_email(to_email: str, subject: str, body: str) -> None:
    if not _can_send_email():
        return
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {_resend_api_key()}",
            "Content-Type": "application/json",
        },
        json={
            "from": _resend_from_email(),
            "to": [to_email],
            "subject": subject,
            "text": body,
        },
        timeout=15.0,
    )
    response.raise_for_status()


async def create_overdue_notifications() -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as db:
        today = date.today()
        result = await db.execute(
            select(Task).where(and_(Task.due_date < today, Task.status != TaskStatus.done)).options(selectinload(Task.assignee))
        )
        tasks = result.scalars().all()
        for task in tasks:
            if task.assignee is None:
                continue
            notification = Notification(
                user_id=task.assignee.id,
                message=f"Task '{task.title}' is overdue.",
                link=f"/project/{task.project_id}",
            )
            db.add(notification)
            send_notification_email(
                task.assignee.email,
                f"Overdue task: {task.title}",
                f"Task '{task.title}' is overdue in your Team Task Manager project.",
            )
        await db.commit()


def start_scheduler() -> None:
    if scheduler.running:
        return
    scheduler.add_job(create_overdue_notifications, "cron", hour=8, minute=0, id="overdue_task_notifications", replace_existing=True)
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


@router.patch("/read-all", response_model=list[NotificationResponse])
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    result = await db.execute(select(Notification).where(Notification.user_id == current_user.id))
    notifications = result.scalars().all()
    for notification in notifications:
        notification.is_read = True
    await db.commit()
    return notifications


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id)
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification
