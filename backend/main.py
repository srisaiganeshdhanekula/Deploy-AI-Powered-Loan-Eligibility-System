"""
AI Loan System - Main FastAPI Application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from pathlib import Path
from dotenv import load_dotenv
from contextlib import asynccontextmanager

# Load environment variables from backend/.env explicitly
# Load environment variables from backend/.env explicitly
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# Allow multiple OpenMP runtimes (fix for faster-whisper + xgboost/sklearn conflict)
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Fix for Windows asyncio loop (NotImplementedError in subprocesses)
import sys
import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
# Auto-detect local voice models (non-invasive):
# - If PIPER_MODEL not set, and backend/piper_voices/*.onnx exists, set PIPER_MODEL to the first ONNX path.
# - If VOSK_MODEL_PATH not set, prefer ./models/vosk-model-small-en-us-0.15 when present.
backend_root = Path(__file__).parent
if not os.getenv("PIPER_MODEL"):
    piper_dir = backend_root / "piper_voices"
    if piper_dir.exists():
        onnx = next(piper_dir.glob("*.onnx"), None)
        if onnx:
            os.environ["PIPER_MODEL"] = str(onnx)

if not os.getenv("VOSK_MODEL_PATH"):
    default_vosk = backend_root / "models" / "vosk-model-small-en-us-0.15"
    if default_vosk.exists():
        os.environ["VOSK_MODEL_PATH"] = str(default_vosk)

# Import routes
from app.routes import auth_routes, chat_routes, voice_routes, voice_realtime, voice_realtime_v2, ocr_routes, loan_routes, report_routes, manager_routes, otp_routes, notification_routes, user_notification_routes
from app.routes import voice_health
from app.routes import transcripts_routes
from app.models.database import Base, engine, DB_FALLBACK_USED

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context replacing deprecated on_event startup/shutdown."""
    # Startup: ensure tables are created (works for SQLite and Postgres/Supabase)
    try:
        Base.metadata.create_all(bind=engine)
        
        # Auto-create default users if they don't exist
        from app.models.database import SessionLocal, User
        from app.utils.security import hash_password
        
        db = SessionLocal()
        try:
            if not db.query(User).first():
                # Create Admin (email verified)
                admin = User(
                    email="admin@example.com",
                    password_hash=hash_password("admin123"),
                    full_name="Admin User",
                    role="manager",
                    email_verified=True
                )
                db.add(admin)
                
                # Create Applicant (email verified)
                applicant = User(
                    email="user@example.com",
                    password_hash=hash_password("user123"),
                    full_name="Test Applicant",
                    role="applicant",
                    email_verified=True
                )
                db.add(applicant)
                
                # Create Test User (email verified, no OTP needed)
                test_user = User(
                    email="test@test.com",
                    password_hash=hash_password("test123"),
                    full_name="Test User",
                    role="applicant",
                    email_verified=True
                )
                db.add(test_user)
                
                db.commit()
                print("Created default users:")
                print("  - admin@example.com / admin123 (Manager)")
                print("  - user@example.com / user123 (Applicant)")
                print("  - test@test.com / test123 (Applicant - No OTP Required)")
        except Exception as e:
            print(f"Error creating default users: {e}")
        finally:
            db.close()
    except Exception as e:
        # Avoid crashing the app; surface error in logs
        import logging
        logging.getLogger(__name__).error(f"DB init failed: {e}")
    yield
    # Shutdown: nothing to clean up currently

# Initialize FastAPI app with lifespan handler
app = FastAPI(
    title="AI Loan System API",
    description="Intelligent loan eligibility platform with AI chat, voice, and document verification",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
static_dir = Path(__file__).parent / "app" / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Register routes
app.include_router(auth_routes.router, prefix="/api/auth")
app.include_router(chat_routes.router, prefix="/api/chat")
app.include_router(voice_routes.router, prefix="/api/voice")
# app.include_router(voice_realtime.router)
app.include_router(voice_realtime_v2.router, prefix="/api", tags=["Voice Agent - Real-time Streaming"])
app.include_router(voice_health.router, prefix="/api/voice", tags=["Voice Health"])
app.include_router(ocr_routes.router, prefix="/api/verify", tags=["Document Verification"])
app.include_router(loan_routes.router, prefix="/api/loan", tags=["Loan Prediction"])
app.include_router(report_routes.router, prefix="/api/report", tags=["Reports"])
app.include_router(manager_routes.router, prefix="/api/manager", tags=["Manager Dashboard"])
app.include_router(otp_routes.router, prefix="/api/otp", tags=["OTP Verification"])
app.include_router(notification_routes.router)
app.include_router(user_notification_routes.router)
app.include_router(transcripts_routes.router, prefix="/api", tags=["Transcripts"])

# Root endpoint
@app.get("/", tags=["Root"])
async def read_root():
    return {
        "message": "AI Loan System API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}


@app.get("/api/admin/llm-info", tags=["Admin"])
async def llm_info():
    """Return LLM provider info for debugging: provider name, class, and health."""
    from app.services.llm_selector import get_llm_service
    import os

    provider_env = os.getenv("LLM_PROVIDER", "<not-set>")
    # instantiate the provider but don't run a generate call
    try:
        svc = get_llm_service()
        cls = svc.__class__.__name__
        healthy = False
        try:
            healthy = bool(svc.health())
        except Exception:
            healthy = False
    except Exception as e:
        cls = f"error: {e}"
        healthy = False

    def mask(key: str) -> str:
        if not key:
            return "<empty>"
        if len(key) <= 8:
            return key[:2] + "..."
        return key[:4] + "..." + key[-4:]

    return {
        "LLM_PROVIDER_env": provider_env,
        "provider_class": cls,
        "provider_healthy": healthy,
        "OPENROUTER_MODEL": os.getenv("OPENROUTER_MODEL"),
        "OPENROUTER_API_KEY_masked": mask(os.getenv("OPENROUTER_API_KEY", "")),
        "OLLAMA_MODEL": os.getenv("OLLAMA_MODEL"),
        "OLLAMA_API_URL": os.getenv("OLLAMA_API_URL"),
    }

# Optional DB health for diagnostics
@app.get("/api/admin/db-health", tags=["Health"])
async def db_health():
    from sqlalchemy import text, inspect
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        return {
            "status": "ok",
            "tables": tables,
            "driver": engine.url.drivername,
            "fallback_used": DB_FALLBACK_USED,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # reload=False to prevent Windows event loop issues with subprocesses
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
