from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models.database import get_db, VoiceCall

router = APIRouter()

@router.get("/transcripts")
async def get_transcripts(db: Session = Depends(get_db)):
    """
    Return the last 50 voice transcripts (user utterances) from VoiceCall table.
    """
    calls = db.query(VoiceCall).order_by(VoiceCall.created_at.desc()).limit(50).all()
    return [
        {
            "id": call.id,
            "created_at": call.created_at,
            "user_text": call.user_text,
            "ai_reply": call.ai_reply,
            "structured_data": call.structured_data,
            "audio_url": call.audio_url,
        }
        for call in calls
    ]
