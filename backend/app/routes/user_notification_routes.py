"""
User Notification WebSocket Route - Real-time notifications for applicants/users

Provides a simple per-user WebSocket manager and helper to send notifications
to a specific user by their `user_id`.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class UserConnectionManager:
    """Manage WebSocket connections grouped by user_id."""
    def __init__(self):
        # map user_id -> list[WebSocket]
        self.connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        conns = self.connections.get(user_id) or []
        conns.append(websocket)
        self.connections[user_id] = conns
        logger.info(f"User {user_id} connected. Connections: {len(conns)}")

    def disconnect(self, user_id: int, websocket: WebSocket):
        conns = self.connections.get(user_id) or []
        if websocket in conns:
            conns.remove(websocket)
        if conns:
            self.connections[user_id] = conns
        else:
            self.connections.pop(user_id, None)
        logger.info(f"User {user_id} disconnected. Remaining: {len(conns)}")

    async def send(self, user_id: int, message: dict):
        """Send message to all connections for a given user_id."""
        conns = self.connections.get(user_id) or []
        if not conns:
            logger.warning(f"No active connections for user {user_id}")
            return
        disconnected = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to user {user_id}: {e}")
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(user_id, ws)


manager = UserConnectionManager()


@router.websocket("/ws/user/{user_id}")
async def user_ws(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for a specific user to receive notifications."""
    await manager.connect(user_id, websocket)
    try:
        while True:
            # Keep connection alive; echo/ping messages are ignored
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id, websocket)


async def send_user_notification(user_id: int, data: dict):
    """Helper to send a notification payload to the specified user_id.

    This function is intended to be scheduled as a BackgroundTasks job from
    other routes when application status changes (accepted/rejected/etc.).
    """
    if 'created_at' not in data or not data['created_at']:
        from datetime import datetime
        data['created_at'] = datetime.utcnow().isoformat()
    logger.info(f"Sending user notification to {user_id}: {data.get('type')}")
    await manager.send(user_id, data)
