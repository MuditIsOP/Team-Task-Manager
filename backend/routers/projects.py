import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from firebase import get_current_user
from models import ActivityLog, Notification, Project, ProjectMember, ProjectRole, User
from schemas import (
    ProjectCreateRequest,
    ProjectDetailResponse,
    ProjectMemberInviteRequest,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)
from websocket_manager import manager

router = APIRouter(prefix="/projects", tags=["projects"])


async def log_project_activity(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    metadata: dict[str, Any],
) -> None:
    db.add(
        ActivityLog(
            project_id=project_id,
            user_id=user_id,
            action=action,
            details=metadata,
        )
    )


async def get_project_or_404(
    project_id: uuid.UUID,
    db: AsyncSession,
    *,
    include_members: bool = False,
) -> Project:
    statement = select(Project).where(Project.id == project_id)
    if include_members:
        statement = statement.options(selectinload(Project.members).selectinload(ProjectMember.user))

    result = await db.execute(statement)
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


async def get_member_role(project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> ProjectRole:
    member = await db.get(ProjectMember, {"project_id": project_id, "user_id": user_id})
    if member is not None:
        return member.role

    project = await db.get(Project, project_id)
    if project is not None and project.owner_id == user_id:
        return ProjectRole.admin

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this project.",
    )


async def require_admin(project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Project:
    role = await get_member_role(project_id, user_id, db)
    if role != ProjectRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for this project.",
        )
    return await get_project_or_404(project_id, db)


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectResponse]:
    statement = (
        select(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .where(
            or_(
                Project.owner_id == current_user.id,
                ProjectMember.user_id == current_user.id,
            )
        )
        .distinct()
    )
    result = await db.execute(statement)
    return list(result.scalars().all())


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(project)
    await db.flush()

    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role=ProjectRole.admin,
        )
    )
    await log_project_activity(
        db,
        project_id=project.id,
        user_id=current_user.id,
        action="project.created",
        metadata={"project_name": project.name},
    )
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project_detail(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectDetailResponse:
    await get_member_role(project_id, current_user.id, db)
    project = await get_project_or_404(project_id, db, include_members=True)
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    project = await require_admin(project_id, current_user.id, db)
    update_data = payload.model_dump(exclude_unset=True, exclude={"owner_id"})

    for field, value in update_data.items():
        setattr(project, field, value)

    await log_project_activity(
        db,
        project_id=project.id,
        user_id=current_user.id,
        action="project.updated",
        metadata={"fields": sorted(update_data.keys())},
    )
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    project = await require_admin(project_id, current_user.id, db)
    await db.delete(project)
    await db.commit()
    return None


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: uuid.UUID,
    payload: ProjectMemberInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMemberResponse:
    project = await require_admin(project_id, current_user.id, db)

    user_result = await db.execute(select(User).where(User.email == payload.email))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    existing_member = await db.get(ProjectMember, {"project_id": project_id, "user_id": user.id})
    if existing_member is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a project member.")

    membership = ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role=ProjectRole.member,
    )
    db.add(membership)
    db.add(
        Notification(
            user_id=user.id,
            message=f"You were added to project '{project.name}'.",
            link=f"/project/{project_id}",
        )
    )
    await log_project_activity(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action="member.joined",
        metadata={"user_name": user.name},
    )
    await db.commit()
    await db.refresh(membership)
    membership.user = user
    await manager.broadcast(
        str(project_id),
        {
            "event": "member.joined",
            "data": {
                "project_id": str(project_id),
                "user_id": str(user.id),
                "role": membership.role.value,
                "email": user.email,
                "name": user.name,
            },
            "actor": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar": current_user.avatar_url,
            },
        },
    )
    return membership


@router.delete("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
async def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMemberResponse:
    await require_admin(project_id, current_user.id, db)

    membership = await db.get(ProjectMember, {"project_id": project_id, "user_id": user_id})
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project member not found.")

    if membership.role == ProjectRole.admin:
        admin_count_result = await db.execute(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == project_id, ProjectMember.role == ProjectRole.admin)
        )
        admin_count = admin_count_result.scalar_one()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last admin from the project.",
            )

    await db.delete(membership)
    await db.commit()
    return membership
