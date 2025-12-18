"""
Real-time Voice Agent WebSocket

Features implemented:
- Accepts binary audio frames (PCM 16-bit LE, 16kHz mono) from frontend via WebSocket
- Runs Vosk recognizer in streaming mode and sends partial transcripts to frontend
- Pipes partial/final transcripts into Ollama (streaming) and forwards AI tokens to frontend
- Calls Piper TTS on token chunks and streams audio back to frontend as base64 WAV chunks
- Logs interactions to Supabase
- When required structured fields are present, runs the local ML model and streams eligibility result

Notes / assumptions:
- VOSK model lives at the path specified by env var VOSK_MODEL_PATH or `./models/vosk-model`
- PIPER model tag is provided by PIPER_MODEL env var or defaults to `en_US-amy-medium`
- SUPABASE_URL and SUPABASE_KEY must be set in backend/.env for logging
- Ollama CLI must be installed and `ollama run llama3 --stream` must be callable from PATH
- This module focuses on wiring/streaming and leaves heavy optimizations (batching, audio jitter handling)
  to later iterations.
"""
import os
import uuid
import json
import base64
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi import Depends
from fastapi import status

try:
    from vosk import Model, KaldiRecognizer
except Exception:
    Model = None
    KaldiRecognizer = None

try:
    from supabase import create_client
except Exception:
    create_client = None

import pickle
import joblib

router = APIRouter()

# Configuration (read from env or use sensible defaults)
VOSK_MODEL_PATH = os.getenv("VOSK_MODEL_PATH", str(Path(__file__).parent.parent.parent / "models" / "vosk-model"))
PIPER_MODEL = os.getenv("PIPER_MODEL", "en_US-amy-medium")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ML_MODEL_DIR = os.getenv("ML_MODEL_DIR", str(Path(__file__).parent.parent.parent / "ml"))

# Helper: create supabase client if available
def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_KEY or create_client is None:
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


async def run_ollama_streaming(input_queue: asyncio.Queue, output_queue: asyncio.Queue, stop_event: asyncio.Event):
    """Run Ollama CLI in streaming mode and forward tokens.

    This coroutine reads textual lines from input_queue and writes them to ollama's stdin. It
    reads stdout lines and puts ai_token events into output_queue.
    """
    # Start ollama subprocess
    proc = await asyncio.create_subprocess_exec(
        "ollama",
        "run",
        "llama3",
        "--stream",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def writer():
        while not stop_event.is_set():
            try:
                text = await asyncio.wait_for(input_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if text is None:
                break
            # Send text to ollama stdin (followed by newline to flush)
            if proc.stdin:
                proc.stdin.write((text + "\n").encode("utf-8"))
                await proc.stdin.drain()

    async def reader():
        # Read streaming output line-by-line
        if not proc.stdout:
            return
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            token = line.decode("utf-8", errors="ignore").strip()
            if token:
                await output_queue.put(token)

    writer_task = asyncio.create_task(writer())
    reader_task = asyncio.create_task(reader())

    await asyncio.wait([writer_task, reader_task], return_when=asyncio.FIRST_COMPLETED)

    # Cleanup
    stop_event.set()
    if proc.stdin:
        proc.stdin.close()
    await proc.wait()


async def synthesize_piper_audio(text: str) -> Optional[bytes]:
    """Call Piper CLI to synthesize text to WAV (returns bytes)"""
    if not text.strip():
        return None
    # Use a temporary file for output
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_f:
        out_path = out_f.name
    # Piper CLI invocation -- attempt to be compatible with common piper CLIs
    # Resolve backend-local model if available (backend/piper_voices/<model>.onnx)
    backend_root = Path(__file__).resolve().parents[2]
    candidate = backend_root / "piper_voices" / f"{PIPER_MODEL}.onnx"
    voices_dir = backend_root / "piper_voices"
    if candidate.exists():
        cmd = ["piper", "--model", str(candidate), "--text", text, "--output_file", out_path]
    elif voices_dir.exists():
        cmd = ["piper", "--data-dir", str(voices_dir), "--text", text, "--output_file", out_path]
    else:
        # Fallback to simple model tag or system piper
        cmd = ["piper", "--model", PIPER_MODEL, "--text", text, "--output_file", out_path]
    try:
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            # If Piper CLI behaves differently, you may need to adapt invocation.
            return None
        # Read the file and return bytes
        data = Path(out_path).read_bytes()
        Path(out_path).unlink(missing_ok=True)
        return data
    except FileNotFoundError:
        # Piper not installed / not in PATH
        return None


def load_ml_model():
    """Load ML model and optional preprocessing artifacts from ML_MODEL_DIR.

    Returns a dict with model, scaler, encoders, x_columns if present.
    """
    artifacts = {}
    model_pkl = Path(ML_MODEL_DIR) / "loan_xgboost_model.pkl"
    if model_pkl.exists():
        try:
            artifacts['model'] = joblib.load(model_pkl)
        except Exception:
            try:
                with open(model_pkl, 'rb') as f:
                    artifacts['model'] = pickle.load(f)
            except Exception:
                artifacts['model'] = None
    # Try JSON model (XGBoost JSON) -- out of scope to load here cleanly
    # Load optional scaler/encoders
    scaler_pkl = Path(ML_MODEL_DIR) / "feature_scaler.pkl"
    if scaler_pkl.exists():
        artifacts['scaler'] = joblib.load(scaler_pkl)
    encoders_pkl = Path(ML_MODEL_DIR) / "label_encoders.pkl"
    if encoders_pkl.exists():
        artifacts['encoders'] = joblib.load(encoders_pkl)
    xcols_pkl = Path(ML_MODEL_DIR) / "X_columns.pkl"
    if xcols_pkl.exists():
        artifacts['x_columns'] = joblib.load(xcols_pkl)
    return artifacts


@router.websocket("/voice/stream")
async def voice_stream(websocket: WebSocket):
    """Main WebSocket endpoint for real-time voice agent.

    Protocol:
    - Incoming binary frames: raw PCM16LE 16kHz mono audio
    - Incoming json text messages: control messages
    - Outgoing JSON messages: {type, data}
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())
    start_ts = datetime.utcnow().isoformat()

    # Initialize Vosk model
    recognizer = None
    if Model is not None and Path(VOSK_MODEL_PATH).exists():
        try:
            vosk_model = Model(VOSK_MODEL_PATH)
            recognizer = KaldiRecognizer(vosk_model, 16000)
        except Exception as e:
            recognizer = None
    else:
        recognizer = None

    # Queues for communicating with ollama subprocess
    ollama_in_q = asyncio.Queue()
    ollama_out_q = asyncio.Queue()
    ollama_stop = asyncio.Event()

    # Start ollama streaming task
    ollama_task = asyncio.create_task(run_ollama_streaming(ollama_in_q, ollama_out_q, ollama_stop))

    # Supabase client
    sb = get_supabase_client()

    # Load ML model artifacts
    ml_artifacts = load_ml_model()

    # Conversation buffers
    user_text_buffer = ""
    ai_text_buffer = ""
    structured_data = {}

    async def ollama_consumer():
        """Reads tokens from ollama_out_q and forwards to websocket; also runs TTS production."""
        nonlocal ai_text_buffer
        tts_buffer = ""
        while not ollama_stop.is_set():
            try:
                token = await asyncio.wait_for(ollama_out_q.get(), timeout=0.5)
            except asyncio.TimeoutError:
                await asyncio.sleep(0.01)
                continue
            # Forward token to frontend
            await websocket.send_text(json.dumps({"type": "ai_token", "data": token}))
            ai_text_buffer += token
            tts_buffer += token
            # If buffer gets long or token ends with punctuation, synthesize and send audio
            if len(tts_buffer) > 80 or token.endswith(('.', '!', '?', '\n')):
                wav = await synthesize_piper_audio(tts_buffer)
                if wav:
                    b64 = base64.b64encode(wav).decode('ascii')
                    await websocket.send_text(json.dumps({"type": "audio_chunk", "data": b64}))
                tts_buffer = ""
        # flush remaining buffer
        if tts_buffer:
            wav = await synthesize_piper_audio(tts_buffer)
            if wav:
                b64 = base64.b64encode(wav).decode('ascii')
                await websocket.send_text(json.dumps({"type": "audio_chunk", "data": b64}))

    ollama_consumer_task = asyncio.create_task(ollama_consumer())

    async def maybe_run_ml_prediction():
        nonlocal structured_data
        # Check presence of required keys
        needed = ["name", "monthly_income", "credit_score", "loan_amount"]
        if all(k in structured_data for k in needed) and 'model' in ml_artifacts and ml_artifacts['model'] is not None:
            model = ml_artifacts['model']
            import pandas as pd
            df = pd.DataFrame([{
                "annual_income": float(structured_data.get('monthly_income', 0)) * 12,
                "credit_score": float(structured_data.get('credit_score', 0)),
                "loan_amount": float(structured_data.get('loan_amount', 0)),
                # Add defaults for missing columns if required by the model
            }])
            scaler = ml_artifacts.get('scaler')
            if scaler is not None:
                X = scaler.transform(df)
            else:
                X = df.values
            try:
                proba = model.predict_proba(X)[0][1]
            except Exception:
                try:
                    proba = float(model.predict(X)[0])
                except Exception:
                    proba = None
            # Send eligibility via websocket
            await websocket.send_text(json.dumps({"type": "eligibility_result", "data": proba}))
            # store back into supabase if available
            if sb:
                try:
                    sb.table("voice_stream_sessions").insert({
                        "id": session_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "user_text": user_text_buffer,
                        "ai_reply": ai_text_buffer,
                        "structured_data": structured_data,
                        "eligibility_score": proba,
                    }).execute()
                except Exception:
                    pass

    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.receive":
                if "bytes" in msg:
                    data = msg.get("bytes")
                    # Feed to Vosk recognizer if available
                    if recognizer is not None:
                        if recognizer.AcceptWaveform(data):
                            res = json.loads(recognizer.Result())
                            text = res.get('text', '')
                            if text:
                                user_text_buffer += " " + text
                                # send finalized transcript
                                await websocket.send_text(json.dumps({"type": "final_transcript", "data": text}))
                                # push to ollama input queue
                                await ollama_in_q.put(text)
                                # simple structured extraction attempt (in real system, use LLM or parser)
                                # Here we try a lightweight heuristic: look for numbers and map to known fields
                                # (This is a placeholder — you should replace with a JSON extractor LLM call)
                                # Attempt to run ML prediction when fields present
                                await maybe_run_ml_prediction()
                        else:
                            # send partial
                            partial = recognizer.PartialResult()
                            try:
                                part_obj = json.loads(partial)
                                partial_text = part_obj.get('partial', '')
                            except Exception:
                                partial_text = ''
                            if partial_text:
                                await websocket.send_text(json.dumps({"type": "partial_transcript", "data": partial_text}))
                                # also send partial to ollama to enable streaming thinking
                                await ollama_in_q.put(partial_text)
                    else:
                        # If no recognizer, ignore or echo as control
                        pass
                elif "text" in msg:
                    # Expect JSON control messages from frontend (e.g., finalize field extraction or structured updates)
                    try:
                        obj = json.loads(msg.get("text"))
                    except Exception:
                        obj = {}
                    typ = obj.get("type")
                    if typ == "structured_update":
                        # Frontend may send extracted fields
                        fields = obj.get("data", {})
                        structured_data.update(fields)
                        # Store intermediate log
                        if sb:
                            try:
                                sb.table("voice_stream_sessions").insert({
                                    "id": session_id,
                                    "timestamp": datetime.utcnow().isoformat(),
                                    "user_text": user_text_buffer,
                                    "ai_reply": ai_text_buffer,
                                    "structured_data": structured_data,
                                }).execute()
                            except Exception:
                                pass
                        # maybe run ML prediction
                        await maybe_run_ml_prediction()
                    elif typ == "end_of_session":
                        break
            elif msg.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        # Signal ollama task to stop and wait
        ollama_stop.set()
        try:
            await ollama_task
        except Exception:
            pass
        try:
            await ollama_consumer_task
        except Exception:
            pass
        # Final persistence
        if sb:
            try:
                sb.table("voice_stream_sessions").insert({
                    "id": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "user_text": user_text_buffer,
                    "ai_reply": ai_text_buffer,
                    "structured_data": structured_data,
                }).execute()
            except Exception:
                pass
        await websocket.close()
