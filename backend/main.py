import os
import uuid
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import models  # noqa: F401
from database import Base, get_engine, get_sessionmaker
from firebase import get_user_from_token
from routers import attachments, auth, comments, dashboard, notifications, projects, tasks, users
from routers.notifications import start_scheduler, stop_scheduler
from routers.projects import get_member_role
from websocket_manager import manager

load_dotenv()


def _cors_origins() -> list[str]:
    frontend_url = os.getenv("FRONTEND_URL", "https://yourusername.github.io/team-task-manager")
    parsed = urlparse(frontend_url)
    github_pages_origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else frontend_url
    return [github_pages_origin, "http://localhost:5173"]


app = FastAPI(title="Team Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(comments.router)
app.include_router(attachments.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)


@app.on_event("startup")
async def on_startup() -> None:
    async with get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_scheduler()


@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        await websocket.close(code=1008)
        return

    session_factory = get_sessionmaker()
    async with session_factory() as db:
        try:
            user = await get_user_from_token(token, db)
            await get_member_role(project_uuid, user.id, db)
        except Exception:
            await websocket.close(code=1008)
            return

    await manager.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(project_id, websocket)
