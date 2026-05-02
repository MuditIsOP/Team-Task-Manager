import asyncio
from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, project_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.rooms[project_id].append(websocket)

    async def disconnect(self, project_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.rooms.get(project_id, []):
                self.rooms[project_id].remove(websocket)
            if not self.rooms.get(project_id):
                self.rooms.pop(project_id, None)

    async def broadcast(self, project_id: str, message: dict) -> None:
        async with self._lock:
            sockets = list(self.rooms.get(project_id, []))

        stale_sockets: list[WebSocket] = []
        for websocket in sockets:
            try:
                await websocket.send_json(message)
            except WebSocketDisconnect:
                stale_sockets.append(websocket)
            except RuntimeError:
                stale_sockets.append(websocket)

        if stale_sockets:
            async with self._lock:
                active = self.rooms.get(project_id, [])
                for websocket in stale_sockets:
                    if websocket in active:
                        active.remove(websocket)
                if not active:
                    self.rooms.pop(project_id, None)


manager = ConnectionManager()
