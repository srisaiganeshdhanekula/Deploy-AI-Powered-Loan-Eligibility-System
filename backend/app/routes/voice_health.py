from fastapi import APIRouter
import os
from pathlib import Path
import shutil
import importlib

router = APIRouter()


@router.get("/health", tags=["Voice"])
async def voice_health():
    """Return availability status for Vosk and Piper and model paths."""
    status = {}

    # VOSK
    vosk_available = False
    vosk_model_path = os.getenv("VOSK_MODEL_PATH", str(Path(__file__).resolve().parents[2] / "models" / "vosk-model-small-en-us-0.15"))
    try:
        import vosk  # type: ignore
        vosk_available = True
    except Exception:
        vosk_available = False

    status["vosk"] = {
        "importable": vosk_available,
        "model_path": vosk_model_path,
        "model_exists": Path(vosk_model_path).exists(),
    }

    # PIPER
    piper_available = False
    piper_module = None
    try:
        piper_module = importlib.import_module("piper")
        piper_available = True
    except Exception:
        piper_available = False

    # Find local piper voices dir
    backend_root = Path(__file__).resolve().parents[2]
    voices_dir = backend_root / "piper_voices"
    onnx_files = list(voices_dir.glob("*.onnx")) if voices_dir.exists() else []

    # Check piper CLI on PATH
    piper_cli = shutil.which("piper")

    status["piper"] = {
        "importable": piper_available,
        "cli_path": piper_cli,
        "voices_dir": str(voices_dir) if voices_dir.exists() else None,
        "onnx_models": [str(p) for p in onnx_files],
    }

    return status
