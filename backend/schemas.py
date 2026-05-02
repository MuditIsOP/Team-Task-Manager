import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from models import ProjectRole, TaskPriority, TaskStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AttachmentItem(BaseModel):
    name: str
    url: str
    size: int | None = None


class FirebaseTokenRequest(BaseModel):
    token: str


class AttachmentDeleteRequest(BaseModel):
    task_id: uuid.UUID
    url: str


class AttachmentPresignedUrlRequest(BaseModel):
    filename: str
    content_type: str
    task_id: uuid.UUID


class AttachmentPresignedUrlResponse(BaseModel):
    upload_url: str
    file_url: str
    object_key: str


class AvatarPresignedUrlRequest(BaseModel):
    filename: str
    content_type: str


class UserBase(BaseModel):
    firebase_uid: str
    name: str
    email: EmailStr
    avatar_url: str | None = None


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    avatar_url: str | None = None


class UserResponse(UserBase, ORMModel):
    id: uuid.UUID
    created_at: datetime


class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreateRequest(ProjectBase):
    pass


class ProjectCreate(ProjectBase):
    owner_id: uuid.UUID


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    owner_id: uuid.UUID | None = None


class ProjectResponse(ProjectBase, ORMModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime


class ProjectMemberInviteRequest(BaseModel):
    email: EmailStr


class ProjectMemberBase(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: ProjectRole = ProjectRole.member


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: ProjectRole | None = None


class ProjectMemberResponse(ProjectMemberBase, ORMModel):
    pass


class ProjectMemberDetailResponse(ProjectMemberResponse):
    user: UserResponse


class ProjectDetailResponse(ProjectResponse):
    members: list[ProjectMemberDetailResponse] = Field(default_factory=list)


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    project_id: uuid.UUID
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    labels: list[str] = Field(default_factory=list)
    attachments: list[AttachmentItem] = Field(default_factory=list)


class TaskCreate(TaskBase):
    pass


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    project_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    labels: list[str] | None = None
    attachments: list[AttachmentItem] | None = None


class TaskResponse(TaskBase, ORMModel):
    id: uuid.UUID
    created_at: datetime


class TaskListResponse(TaskResponse):
    assignee_name: str | None = None
    assignee_avatar_url: str | None = None


class CommentBase(BaseModel):
    task_id: uuid.UUID
    user_id: uuid.UUID
    body: str


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    body: str | None = None


class CommentResponse(CommentBase, ORMModel):
    id: uuid.UUID
    created_at: datetime


class CommentCreateRequest(BaseModel):
    body: str


class CommentDetailResponse(CommentResponse):
    user_name: str | None = None
    user_avatar_url: str | None = None


class TaskDetailResponse(TaskListResponse):
    comments: list[CommentDetailResponse] = Field(default_factory=list)


class ActivityLogBase(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID
    action: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActivityLogCreate(ActivityLogBase):
    pass


class ActivityLogUpdate(BaseModel):
    action: str | None = None
    metadata: dict[str, Any] | None = None


class ActivityLogResponse(ActivityLogBase, ORMModel):
    id: uuid.UUID
    created_at: datetime


class NotificationBase(BaseModel):
    user_id: uuid.UUID
    message: str
    link: str | None = None
    is_read: bool = False


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    message: str | None = None
    link: str | None = None
    is_read: bool | None = None


class NotificationResponse(NotificationBase, ORMModel):
    id: uuid.UUID
    created_at: datetime


class DashboardStatsResponse(BaseModel):
    total_tasks: int
    by_status: dict[str, int]
    overdue_count: int
    per_member_count: dict[str, int]
    daily_completed: list[dict[str, int | str]] = Field(default_factory=list)


class DashboardOverdueTaskResponse(TaskListResponse):
    project_name: str
    days_overdue: int


class DashboardActivityItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    action: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    actor_id: uuid.UUID
    actor_name: str
    actor_avatar_url: str | None = None
