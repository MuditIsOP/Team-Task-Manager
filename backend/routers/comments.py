import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from firebase import get_current_user
from models import Comment, ProjectRole, User
from routers.projects import get_member_role
from routers.tasks import actor_payload, create_notification, get_task_or_404, log_task_activity
from schemas import CommentCreateRequest, CommentDetailResponse
from websocket_manager import manager

router = APIRouter(tags=["comments"])


def build_comment_response(comment: Comment) -> CommentDetailResponse:
    return CommentDetailResponse(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        body=comment.body,
        created_at=comment.created_at,
        user_name=comment.user.name if comment.user else None,
        user_avatar_url=comment.user.avatar_url if comment.user else None,
    )


async def get_comment_or_404(comment_id: uuid.UUID, db: AsyncSession) -> Comment:
    result = await db.execute(select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.user)))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    return comment


@router.get("/tasks/{task_id}/comments", response_model=list[CommentDetailResponse])
async def list_task_comments(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CommentDetailResponse]:
    task = await get_task_or_404(task_id, db, include_comments=True)
    await get_member_role(task.project_id, current_user.id, db)
    return [build_comment_response(comment) for comment in task.comments]


@router.post("/tasks/{task_id}/comments", response_model=CommentDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: uuid.UUID,
    payload: CommentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommentDetailResponse:
    task = await get_task_or_404(task_id, db)
    await get_member_role(task.project_id, current_user.id, db)

    comment = Comment(task_id=task.id, user_id=current_user.id, body=payload.body)
    db.add(comment)
    await db.flush()

    await log_task_activity(
        db,
        project_id=task.project_id,
        user_id=current_user.id,
        action="comment.added",
        metadata={"task_id": str(task.id), "task_title": task.title},
    )

    if task.assignee_id is not None and task.assignee_id != current_user.id:
        await create_notification(
            db,
            user_id=task.assignee_id,
            message=f"New comment on task '{task.title}'.",
            link=f"/project/{task.project_id}",
        )

    await db.commit()
    await db.refresh(comment)
    comment.user = current_user
    response = build_comment_response(comment)
    await manager.broadcast(
        str(task.project_id),
        {"event": "comment.added", "data": response.model_dump(mode="json"), "actor": actor_payload(current_user)},
    )
    return response


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    comment = await get_comment_or_404(comment_id, db)
    task = await get_task_or_404(comment.task_id, db)
    role = await get_member_role(task.project_id, current_user.id, db)

    if comment.user_id != current_user.id and role != ProjectRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this comment.",
        )

    event_data = {"id": str(comment.id), "task_id": str(comment.task_id)}
    await db.delete(comment)
    await db.commit()
    await manager.broadcast(
        str(task.project_id),
        {"event": "comment.deleted", "data": event_data, "actor": actor_payload(current_user)},
    )
    return None
