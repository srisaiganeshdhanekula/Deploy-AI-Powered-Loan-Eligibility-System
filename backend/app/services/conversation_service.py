"""
Simple ConversationService helper.
Stores messages into the `ChatSession` model as a JSON list of {role, content, ts, meta?}.
Provides minimal features used by `chat_routes.py` (save_user_message, save_bot_message).
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.models.database import ChatSession
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ConversationService:
    def __init__(self, db):
        self.db = db

    def _get_recent_session(self, user_id: Optional[int], application_id: Optional[int]):
        try:
            q = self.db.query(ChatSession)
            if application_id:
                q = q.filter(ChatSession.application_id == application_id)
            elif user_id:
                q = q.filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
            else:
                return None
            sess = q.order_by(ChatSession.created_at.desc()).first()
            return sess
        except Exception as e:
            logger.debug(f"ConversationService._get_recent_session error: {e}")
            return None

    def _append_message(self, sess: ChatSession, role: str, content: str, meta: Optional[Dict[str, Any]] = None):
        try:
            msgs = []
            if sess.messages:
                try:
                    msgs = list(sess.messages) if isinstance(sess.messages, list) else sess.messages
                except Exception:
                    # If stored as JSON string, try to parse; otherwise fallback
                    try:
                        import json
                        msgs = json.loads(sess.messages)
                    except Exception:
                        msgs = []
            msgs.append({"role": role, "content": content, "ts": datetime.utcnow().isoformat(), "meta": meta or {}})
            sess.messages = msgs
            self.db.add(sess)
            self.db.commit()
            return True
        except Exception as e:
            logger.debug(f"ConversationService._append_message error: {e}")
            try:
                self.db.rollback()
            except Exception:
                pass
            return False

    def save_user_message(self, user_id: Optional[int], application_id: Optional[int], content: str, meta: Optional[Dict[str, Any]] = None):
        sess = self._get_recent_session(user_id, application_id)
        if not sess:
            sess = ChatSession(user_id=user_id, application_id=application_id, messages=[{"role": "user", "content": content, "ts": datetime.utcnow().isoformat(), "meta": meta or {}}])
            try:
                self.db.add(sess)
                self.db.commit()
                return True
            except Exception as e:
                logger.debug(f"ConversationService.save_user_message create error: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass
                return False
        return self._append_message(sess, "user", content, meta)

    def save_bot_message(self, user_id: Optional[int], application_id: Optional[int], content: str, meta: Optional[Dict[str, Any]] = None):
        sess = self._get_recent_session(user_id, application_id)
        if not sess:
            sess = ChatSession(user_id=user_id, application_id=application_id, messages=[{"role": "assistant", "content": content, "ts": datetime.utcnow().isoformat(), "meta": meta or {}}])
            try:
                self.db.add(sess)
                self.db.commit()
                return True
            except Exception as e:
                logger.debug(f"ConversationService.save_bot_message create error: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass
                return False
        return self._append_message(sess, "assistant", content, meta)
