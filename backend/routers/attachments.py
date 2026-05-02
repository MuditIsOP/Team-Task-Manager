import os
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from firebase import get_current_user
from models import Task, User
from routers.projects import get_member_role
from routers.tasks import get_task_or_404
from schemas import (
    AttachmentDeleteRequest,
    AttachmentPresignedUrlRequest,
    AttachmentPresignedUrlResponse,
    AvatarPresignedUrlRequest,
)
from storj import get_storj_bucket_name, get_storj_client

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.post("/presigned-url", response_model=AttachmentPresignedUrlResponse)
async def create_presigned_upload_url(
    payload: AttachmentPresignedUrlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AttachmentPresignedUrlResponse:
    task = await get_task_or_404(payload.task_id, db)
    await get_member_role(task.project_id, current_user.id, db)

    client = get_storj_client()
    bucket_name = get_storj_bucket_name()
    safe_filename = os.path.basename(payload.filename)
    object_key = f"attachments/{task.project_id}/{task.id}/{uuid.uuid4()}_{safe_filename}"
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": object_key, "ContentType": payload.content_type},
        ExpiresIn=900,
    )
    endpoint = os.getenv("STORJ_ENDPOINT", "https://gateway.storjshare.io").rstrip("/")
    file_url = f"{endpoint}/{bucket_name}/{object_key}"
    return AttachmentPresignedUrlResponse(upload_url=upload_url, file_url=file_url, object_key=object_key)


@router.post("/avatar-presigned-url", response_model=AttachmentPresignedUrlResponse)
async def create_avatar_presigned_upload_url(
    payload: AvatarPresignedUrlRequest,
    current_user: User = Depends(get_current_user),
) -> AttachmentPresignedUrlResponse:
    client = get_storj_client()
    bucket_name = get_storj_bucket_name()
    safe_filename = os.path.basename(payload.filename)
    object_key = f"avatars/{current_user.id}/{uuid.uuid4()}_{safe_filename}"
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": object_key, "ContentType": payload.content_type},
        ExpiresIn=900,
    )
    endpoint = os.getenv("STORJ_ENDPOINT", "https://gateway.storjshare.io").rstrip("/")
    file_url = f"{endpoint}/{bucket_name}/{object_key}"
    return AttachmentPresignedUrlResponse(upload_url=upload_url, file_url=file_url, object_key=object_key)


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    payload: AttachmentDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    task = await get_task_or_404(payload.task_id, db)
    await get_member_role(task.project_id, current_user.id, db)

    remaining_attachments = [attachment for attachment in task.attachments if attachment.get("url") != payload.url]
    if len(remaining_attachments) == len(task.attachments):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found on task.")

    client = get_storj_client()
    bucket_name = get_storj_bucket_name()
    parsed = urlsplit(payload.url)
    object_key = parsed.path.lstrip("/")
    bucket_prefix = f"{bucket_name}/"
    if object_key.startswith(bucket_prefix):
        object_key = object_key[len(bucket_prefix) :]
    if not object_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attachment URL.")

    client.delete_object(Bucket=bucket_name, Key=object_key)
    task.attachments = remaining_attachments
    await db.commit()
    return None
