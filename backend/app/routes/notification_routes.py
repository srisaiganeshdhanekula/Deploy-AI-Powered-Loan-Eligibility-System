"""
Manager Notification WebSocket Route - Real-time notifications for new loan applications
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class ConnectionManager:
    """Manages WebSocket connections for real-time manager notifications"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept a WebSocket connection and add to active list"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Manager connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection from active list"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Manager disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected managers"""
        if not self.active_connections:
            logger.warning("No managers connected to receive notification")
            return
        
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send notification: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)
        
        logger.info(f"Notification broadcast to {len(self.active_connections)} managers")

manager = ConnectionManager()

@router.websocket("/ws/manager/notifications")
async def manager_notifications_ws(websocket: WebSocket):
    """WebSocket endpoint for real-time manager notifications"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive by receiving messages (unused in current implementation)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# Helper to broadcast notification from other routes
async def send_manager_notification(data: dict):
    """
    Send a notification to all connected managers.
    
    Args:
        data: Dictionary containing notification data. Should include:
            - type: 'new_application' | 'application_approved' | 'application_rejected'
            - full_name: Applicant's full name
            - email: Applicant's email
            - loan_amount: Requested loan amount
            - application_id: Application ID
            - created_at: Timestamp of creation
            - eligibility_score: (optional) Predicted eligibility score
    """
    # Ensure timestamp exists
    if 'created_at' not in data or not data['created_at']:
        data['created_at'] = datetime.utcnow().isoformat()
    
    # Log the notification
    logger.info(f"Broadcasting notification: {data.get('type')} for application {data.get('application_id')}")
    
    # Broadcast to all connected managers
    await manager.broadcast(data)
