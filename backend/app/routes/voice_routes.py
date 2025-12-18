"""
Voice Routes for speech-to-text and text-to-speech

Also exposes a thin wrapper endpoint that reuses the chat pipeline so that
voice and text share identical business logic.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Form
from sqlalchemy.orm import Session
from app.services.voice_service import VoiceService
from app.services.ollama_service import OllamaService
from app.services.ml_model_service import MLModelService
from app.models.schemas import VoiceRequest, VoiceResponse, ChatRequest, ChatResponse, VoiceAgentResponse
from app.models.database import get_db, VoiceCall, LoanApplication
from app.routes.chat_routes import send_message as chat_send_message
from app.utils.logger import get_logger
from pathlib import Path
from datetime import datetime, timedelta
import tempfile
import json
import re
import os

logger = get_logger(__name__)
router = APIRouter()

voice_service = VoiceService()
# Use OLLAMA_MODEL from environment if provided (e.g., llama3.2)
ollama_service = OllamaService(model=os.getenv("OLLAMA_MODEL", "llama3"))
ml_service = MLModelService()


@router.post("/transcribe", response_model=VoiceResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio file to text using Whisper
    
    Supports: mp3, wav, m4a, flac, opus, vorbis, aac
    """
    try:
        # Preflight dependency check
        health = voice_service.get_health()
        if not (health.get("whisper") and health.get("ffmpeg")):
            missing = [k for k, v in health.items() if not v]
            detail = {
                "message": "Voice dependencies missing",
                "missing": missing,
                "suggest": {
                    "macOS": [
                        "brew install ffmpeg",
                        "pip install openai-whisper gTTS",
                    ]
                },
            }
            raise HTTPException(status_code=503, detail=detail)
        # Save uploaded file to temporary location
        temp_dir = Path(tempfile.gettempdir())
        temp_file = temp_dir / file.filename
        
        with open(temp_file, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Transcribe audio
        transcribed_text = voice_service.speech_to_text(str(temp_file))
        
        # Clean up
        temp_file.unlink()
        
        logger.info(f"Audio transcribed successfully")
        
        return {
            "transcribed_text": transcribed_text,
            "audio_response_base64": None
        }
    
    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )


@router.post("/synthesize")
async def synthesize_speech(text: str):
    """
    Convert text to speech using gTTS
    
    Returns base64 encoded audio
    """
    try:
        audio_base64 = voice_service.text_to_speech(text)
        
        logger.info(f"Speech synthesized for {len(text)} characters")
        
        return {
            "audio_base64": audio_base64,
            "format": "mp3"
        }
    
    except Exception as e:
        logger.error(f"Speech synthesis error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Speech synthesis failed: {str(e)}"
        )


@router.get("/status")
async def voice_status():
    """Check voice service availability"""
    is_available = voice_service.get_voice_enabled()
    health = getattr(voice_service, "get_health", lambda: {} )()
    return {
        "voice_enabled": is_available,
        "services": {
            "whisper": bool(health.get("whisper", False)),
            "ffmpeg": bool(health.get("ffmpeg", False)),
            "gtts_tts": True,
        }
    }


@router.get("/diag")
async def voice_diag():
    """Run a quick loopback diagnostic: TTS -> file -> STT.

    Returns a JSON payload indicating service health and whether
    the transcribed text matches the original phrase (case-insensitive).
    """
    try:
        health = voice_service.get_health()
        result = {
            "services": {
                "whisper": bool(health.get("whisper", False)),
                "ffmpeg": bool(health.get("ffmpeg", False)),
                "gtts_tts": True,
            },
            "ok": False,
            "phrase": None,
            "transcript": None,
            "match": False,
        }

        # If core binaries are missing, short-circuit
        if not (result["services"]["whisper"] and result["services"]["ffmpeg"]):
            return result

        test_phrase = "hello this is a test"
        result["phrase"] = test_phrase

        # TTS to a file under static/voices
        filename, _ = voice_service.text_to_speech_file(test_phrase)
        file_path = (voice_service.temp_dir / filename)

        # Transcribe the generated audio
        transcript = voice_service.speech_to_text(str(file_path))
        result["transcript"] = transcript
        # Normalize by removing punctuation/whitespace and lowercasing
        import re
        def _norm(s: str) -> str:
            return re.sub(r"[^a-z0-9]+", "", (s or "").lower())
        result["match"] = _norm(transcript) == _norm(test_phrase)
        result["ok"] = True

        # Cleanup the generated file best-effort
        try:
            file_path.unlink(missing_ok=True)  # type: ignore[arg-type]
        except TypeError:
            if file_path.exists():
                file_path.unlink()
        return result
    except Exception as e:
        logger.error(f"Voice diag error: {e}")
        raise HTTPException(status_code=500, detail=f"Voice diag failed: {e}")


@router.post("/chat", response_model=ChatResponse)
async def voice_chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Voice agent compatible chat endpoint.

    Delegates to the primary chat pipeline so voice and text agents behave the same.
    """
    return await chat_send_message(request, db)


def _normalize_amount(value):
    """Normalize amounts stated in INR, handling words like lakh/crore/k/thousand and commas."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower().replace(',', '')
    # Extract numeric part optionally
    match = re.match(r"([0-9]*\.?[0-9]+)", s)
    num = float(match.group(1)) if match else None
    if 'crore' in s:
        return (num or 0) * 10000000
    if 'lakh' in s or 'lac' in s:
        return (num or 0) * 100000
    if 'thousand' in s or s.endswith('k'):
        return (num or 0) * 1000
    return float(num) if num is not None else None


def _missing_fields(structured: dict):
    """Return the list of missing form-required fields for model readiness (pre-OCR).

    We mirror the detailed form inputs (not OCR fields):
    age, gender, marital_status, employment_type, monthly_income,
    loan_amount (requested), loan_tenure_years, credit_score,
    region, loan_purpose, dependents, existing_emi, salary_credit_frequency.
    """
    required = [
        "age",
        "gender",
        "marital_status",
        "employment_type",
        "monthly_income",
        "loan_amount",
        "loan_tenure_years",
        "credit_score",
        "region",
        "loan_purpose",
        "dependents",
        "existing_emi",
        "salary_credit_frequency",
    ]
    missing = []
    for f in required:
        v = structured.get(f)
        # Consider 0 valid for numeric fields like dependents/existing_emi
        if v is None or (isinstance(v, str) and not v.strip()):
            missing.append(f)
    return missing


def _local_extract_structured(text: str) -> dict:
    """Lightweight local extraction from transcript as a fallback to LLM.
    Returns keys: name, monthly_income, credit_score, loan_amount
    (Minimal local extraction. Other fields will be prompted by LLM flow.)
    """
    s = text or ""
    s_lower = s.lower()
    out = {"name": None, "monthly_income": None, "credit_score": None, "loan_amount": None}

    # Name phrases
    try:
        m = re.search(r"(?:my\s+name\s+is|i\s*am|i'm|this\s+is)\s+([A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+){0,3})", s, re.IGNORECASE)
        if m:
            name_val = m.group(1).strip()
            out["name"] = " ".join([p.capitalize() for p in name_val.split()])
    except Exception:
        pass

    # Fallback: if user says just a likely name (1-3 words, letters only)
    try:
        if not out["name"]:
            m2 = re.match(r"^\s*([A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+){0,2})\s*$", s)
            if m2 and len(s.split()) <= 3:
                name_val = m2.group(1).strip()
                out["name"] = " ".join([p.capitalize() for p in name_val.split()])
    except Exception:
        pass

    # Monthly income: support lakh/crore and raw numbers near income/salary/earn
    try:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)", s_lower)
        if m and any(w in s_lower for w in ["income", "salary", "earn"]):
            amt = float(m.group(1))
            mult = 100000 if 'lakh' in m.group(2) else 10000000
            out["monthly_income"] = int(round((amt * mult) / 12)) if "annual" in s_lower else int(round(amt * mult))
        else:
            m2 = re.search(r"(income|salary|earn)[^0-9]*(\d{4,8})", s_lower)
            if m2:
                val = int(m2.group(2))
                out["monthly_income"] = val
    except Exception:
        pass

    # Loan amount: lakh/crore or numbers near loan/borrow/need
    try:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)", s_lower)
        if m and any(w in s_lower for w in ["loan", "borrow", "need"]):
            amt = float(m.group(1))
            mult = 100000 if 'lakh' in m.group(2) else 10000000
            out["loan_amount"] = int(round(amt * mult))
        else:
            m2 = re.search(r"(loan|borrow|need)[^0-9]*(\d{4,8})", s_lower)
            if m2:
                out["loan_amount"] = int(m2.group(2))
    except Exception:
        pass

    # Credit score: 3 digits between 300-900
    try:
        m = re.search(r"\b([3-9]\d{2})\b", s_lower)
        if m:
            val = int(m.group(1))
            if 300 <= val <= 900:
                out["credit_score"] = val
    except Exception:
        pass

    # Sanitize: don't treat gender words as names
    try:
        banned = {"male", "female", "man", "woman", "boy", "girl"}
        if out.get("name") and out["name"].strip().lower() in banned:
            out["name"] = None
    except Exception:
        pass

    return out


def _normalize_employment_type(val) -> str | None:
    if not val:
        return None
    s = str(val).strip().lower()
    # common miss-hearings and variants
    salaried_aliases = {
        "salaried", "salary", "sallery", "salarie", "salarid",
        "celery", "sellery", "salari", "salaried employee"
    }
    self_emp_aliases = {
        "self-employed", "self employed", "selfemployed", "freelancer",
        "consultant", "contractor", "entrepreneur", "business owner"
    }
    business_aliases = {"business", "trader", "merchant"}
    unemployed_aliases = {"unemployed", "no job", "jobless"}

    if s in salaried_aliases:
        return "Salaried"
    if s in self_emp_aliases:
        return "Self-Employed"
    if s in business_aliases:
        return "Business"
    if s in unemployed_aliases:
        return "Unemployed"
    # try loose contains
    if "salary" in s or "salar" in s or "celery" in s:
        return "Salaried"
    if "self" in s and ("employ" in s or "employed" in s):
        return "Self-Employed"
    if "business" in s:
        return "Business"
    return s.title()


@router.post("/voice_agent", response_model=VoiceAgentResponse)
async def voice_agent(
    file: UploadFile = File(...),
    application_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
):
    """
    End-to-end voice agent:
    - Accepts an audio file
    - Transcribes using Whisper
    - Extracts structured info with Ollama (Llama 3)
    - Generates a natural reply and TTS to MP3
    - Saves conversation + fields into DB (voice_calls)
    - If all fields present, runs ML prediction and stores eligibility score
    """
    try:
        # Preflight dependency check to avoid opaque failures
        health = voice_service.get_health()
        if not (health.get("whisper") and health.get("ffmpeg")):
            missing = [k for k, v in health.items() if not v]
            detail = {
                "message": "Voice dependencies missing",
                "missing": missing,
                "suggest": {
                    "macOS": [
                        "brew install ffmpeg",
                        "pip install openai-whisper gTTS",
                    ]
                },
            }
            raise HTTPException(status_code=503, detail=detail)
        # 1) Save uploaded file to temp and transcribe
        temp_dir = Path(tempfile.gettempdir())
        temp_file = temp_dir / file.filename
        with open(temp_file, 'wb') as f:
            content = await file.read()
            f.write(content)

        # Basic validation: avoid trying to transcribe empty/too-small audio
        try:
            if temp_file.stat().st_size < 1024:  # < 1KB
                try:
                    temp_file.unlink(missing_ok=True)  # type: ignore[arg-type]
                except TypeError:
                    if temp_file.exists():
                        temp_file.unlink()
                raise HTTPException(status_code=400, detail="Audio too short or empty. Please try again.")
        except FileNotFoundError:
            raise HTTPException(status_code=400, detail="Audio not received. Please retry.")

        transcript = voice_service.speech_to_text(str(temp_file))
        temp_file.unlink(missing_ok=True)

        # 2) Extract structured data: local regex fallback + Ollama, prefer non-null values
        local = _local_extract_structured(transcript)
        extracted_llm = ollama_service.extract_structured_data(transcript) or {}
        extracted = {
            "name": extracted_llm.get("name") or local.get("name"),
            "monthly_income": extracted_llm.get("monthly_income") or local.get("monthly_income"),
            "credit_score": extracted_llm.get("credit_score") or local.get("credit_score"),
            "loan_amount": extracted_llm.get("loan_amount") or local.get("loan_amount"),
        }

        # 3) Normalize fields and map common synonyms
        def to_int(val):
            try:
                return int(float(val))
            except Exception:
                return None

        def to_float(val):
            try:
                return float(val)
            except Exception:
                return None

        sx = {k.lower(): v for k, v in (extracted_llm or {}).items()}
        t_lower = (transcript or "").lower()
        # Lightweight gender detection from transcript
        gender_from_text = None
        if re.search(r"\b(female|woman|women)\b", t_lower):
            gender_from_text = "Female"
        elif re.search(r"\b(male|man|men)\b", t_lower):
            gender_from_text = "Male"
        structured = {
            # Core ones with numeric normalization
            "name": extracted.get("name") or sx.get("full_name") or sx.get("name"),
            "monthly_income": _normalize_amount(extracted.get("monthly_income") or sx.get("monthly_income")),
            "credit_score": to_int(extracted.get("credit_score") or sx.get("credit_score")),
            "loan_amount": _normalize_amount(extracted.get("loan_amount") or sx.get("loan_amount_requested")),
            # Additional form fields (categorical/numeric)
            "age": to_int(sx.get("age")),
            "gender": sx.get("gender") or gender_from_text,
            "marital_status": sx.get("marital_status"),
            "employment_type": _normalize_employment_type(sx.get("employment_type") or sx.get("employment_status")),
            "loan_tenure_years": to_int(sx.get("loan_tenure_years") or sx.get("tenure_years") or sx.get("loan_term_years")),
            "region": sx.get("region"),
            "loan_purpose": sx.get("loan_purpose") or sx.get("purpose"),
            "dependents": to_int(sx.get("dependents") or sx.get("num_dependents")),
            "existing_emi": to_float(sx.get("existing_emi")),
            "salary_credit_frequency": sx.get("salary_credit_frequency") or sx.get("salary_frequency"),
        }
        # Cast to int when safe
        if structured["monthly_income"] is not None:
            structured["monthly_income"] = int(structured["monthly_income"])
        if structured["loan_amount"] is not None:
            structured["loan_amount"] = int(structured["loan_amount"])

        # Final sanitation: avoid gender words captured as names
        try:
            banned = {"male", "female", "man", "woman", "boy", "girl"}
            if structured.get("name") and str(structured["name"]).strip().lower() in banned:
                structured["name"] = None
        except Exception:
            pass

        # 4) Create or update LoanApplication as we collect fields (move earlier to leverage persistence for prompting)
        application = None
        # On a fresh login/session (no application_id provided), always start a NEW application.
        # Do not resume by name to avoid pulling prior sessions.
        try:
            allow_continuity = bool(application_id)
            if application_id:
                application = db.query(LoanApplication).filter(LoanApplication.id == application_id).first()
            created_new = False
            if not application:
                application = LoanApplication(
                    full_name=structured.get("name") or None,
                )
                # Seed any known values
                mi = structured.get("monthly_income")
                if mi is not None:
                    try:
                        application.monthly_income = float(mi)
                        application.annual_income = float(mi) * 12.0
                    except Exception:
                        pass
                cs = structured.get("credit_score")
                if cs is not None:
                    try:
                        application.credit_score = int(cs)
                    except Exception:
                        pass
                la = structured.get("loan_amount")
                if la is not None:
                    try:
                        application.loan_amount_requested = float(la)
                        application.loan_amount = float(la)
                    except Exception:
                        pass
                db.add(application)
                db.commit()
                db.refresh(application)
                created_new = True

            # Update known fields when we have an application row
            if application:
                if structured.get("name"):
                    application.full_name = structured.get("name")
                if structured.get("monthly_income") is not None:
                    mi = float(structured.get("monthly_income"))
                    application.monthly_income = mi
                    application.annual_income = mi * 12
                if structured.get("credit_score") is not None:
                    application.credit_score = int(structured.get("credit_score"))
                if structured.get("loan_amount") is not None:
                    la = float(structured.get("loan_amount"))
                    application.loan_amount_requested = la
                    # maintain legacy field for compatibility
                    application.loan_amount = la
                # Additional form fields
                if structured.get("age") is not None:
                    application.age = int(structured.get("age"))
                if structured.get("gender"):
                    application.gender = str(structured.get("gender")).title()
                if structured.get("marital_status"):
                    application.marital_status = str(structured.get("marital_status")).title()
                if structured.get("employment_type"):
                    application.employment_type = str(structured.get("employment_type"))
                    application.employment_status = str(structured.get("employment_type"))
                if structured.get("loan_tenure_years") is not None:
                    application.loan_tenure_years = int(structured.get("loan_tenure_years"))
                    application.loan_term_months = int(structured.get("loan_tenure_years")) * 12
                if structured.get("region"):
                    application.region = str(structured.get("region")).title()
                if structured.get("loan_purpose"):
                    application.loan_purpose = str(structured.get("loan_purpose")).title()
                if structured.get("dependents") is not None:
                    application.dependents = int(structured.get("dependents"))
                    application.num_dependents = int(structured.get("dependents"))
                if structured.get("existing_emi") is not None:
                    try:
                        application.existing_emi = float(structured.get("existing_emi"))
                    except Exception:
                        pass
                if structured.get("salary_credit_frequency"):
                    application.salary_credit_frequency = str(structured.get("salary_credit_frequency")).title()
                db.commit()

        except Exception as e:
            logger.warning(f"Voice agent could not upsert LoanApplication: {e}")
            application = None

        # 5) Augment structured values with any persisted application fields (so we don't re-ask)
        if application:
            if not structured.get("name") and getattr(application, "full_name", None):
                structured["name"] = application.full_name
            if structured.get("monthly_income") is None:
                mi = getattr(application, "monthly_income", None)
                if mi is None and getattr(application, "annual_income", None) is not None:
                    try:
                        mi = float(application.annual_income) / 12.0
                    except Exception:
                        mi = None
                if mi is not None:
                    structured["monthly_income"] = int(mi)
            if structured.get("credit_score") is None and getattr(application, "credit_score", None) is not None:
                structured["credit_score"] = int(application.credit_score)
            if structured.get("loan_amount") is None:
                la = getattr(application, "loan_amount_requested", None)
                if la is None:
                    la = getattr(application, "loan_amount", None)
                if la is not None:
                    structured["loan_amount"] = int(float(la))
            # New: merge categorical/numeric form fields
            if structured.get("gender") is None and getattr(application, "gender", None):
                structured["gender"] = application.gender
            if structured.get("marital_status") is None and getattr(application, "marital_status", None):
                structured["marital_status"] = application.marital_status
            if structured.get("employment_type") is None and getattr(application, "employment_type", None):
                structured["employment_type"] = application.employment_type
            if structured.get("loan_tenure_years") is None and getattr(application, "loan_tenure_years", None) is not None:
                try:
                    structured["loan_tenure_years"] = int(application.loan_tenure_years)
                except Exception:
                    pass
            if structured.get("region") is None and getattr(application, "region", None):
                structured["region"] = application.region
            if structured.get("loan_purpose") is None and getattr(application, "loan_purpose", None):
                structured["loan_purpose"] = application.loan_purpose
            if structured.get("dependents") is None and getattr(application, "dependents", None) is not None:
                try:
                    structured["dependents"] = int(application.dependents)
                except Exception:
                    pass
            if structured.get("existing_emi") is None and getattr(application, "existing_emi", None) is not None:
                try:
                    structured["existing_emi"] = float(application.existing_emi)
                except Exception:
                    pass
            if structured.get("salary_credit_frequency") is None and getattr(application, "salary_credit_frequency", None):
                structured["salary_credit_frequency"] = application.salary_credit_frequency

        # 5a) Also merge values from the most recent VoiceCall (last 10 minutes) only when continuing an existing application
        try:
            if allow_continuity:
                recent_cutoff = datetime.utcnow() - timedelta(minutes=10)
                last_call = db.query(VoiceCall).order_by(VoiceCall.created_at.desc()).first()
                prev_last_question = None
                if last_call and getattr(last_call, "created_at", datetime.utcnow()) >= recent_cutoff:
                    prev_struct = last_call.structured_data or {}
                    prev_last_question = prev_struct.get("last_question") if isinstance(prev_struct, dict) else None
                    for key in ("name", "monthly_income", "credit_score", "loan_amount"):
                        if structured.get(key) in (None, "") and prev_struct.get(key) not in (None, ""):
                            # Only merge if we don't already have a value
                            structured[key] = prev_struct.get(key)
        except Exception as e:
            logger.warning(f"Voice agent continuity merge skipped: {e}")

        # 5b) Map short/numeric-only replies to the previously asked field using prev_last_question
        try:
            cleaned = (transcript or "").strip()
            numbers_only = re.sub(r"[^0-9]", "", cleaned)
            just_words = re.sub(r"[^A-Za-z\s'-]", "", cleaned).strip()
            if prev_last_question and structured.get(prev_last_question) in (None, ""):
                if prev_last_question in ("monthly_income", "loan_amount"):
                    val = _normalize_amount(cleaned)
                    if val is None and numbers_only:
                        try:
                            val = float(numbers_only)
                        except Exception:
                            val = None
                    if val is not None and val > 0:
                        structured[prev_last_question] = int(val)
                elif prev_last_question == "credit_score":
                    m = re.search(r"\b([3-9]\d{2})\b", cleaned)
                    if m:
                        cs = int(m.group(1))
                        if 300 <= cs <= 900:
                            structured["credit_score"] = cs
                    elif numbers_only and len(numbers_only) in (2, 3):
                        try:
                            cs = int(numbers_only)
                            if 300 <= cs <= 900:
                                structured["credit_score"] = cs
                        except Exception:
                            pass
                elif prev_last_question == "name":
                    # Try extracting standalone name
                    name_try = _local_extract_structured(cleaned).get("name")
                    if not name_try and just_words and 1 <= len(just_words.split()) <= 3:
                        name_try = " ".join([p.capitalize() for p in just_words.split()])
                    # Don't accept gender words as names
                    if name_try and name_try.strip().lower() in {"male", "female", "man", "woman", "boy", "girl"}:
                        name_try = None
                    if name_try:
                        structured["name"] = name_try
        except Exception as e:
            logger.warning(f"last_question mapping skipped: {e}")

        # 6) Now compute missing with application-aware structured values and generate reply
        missing = _missing_fields(structured)

        # Reduce repetition: if previous call asked for the same first field and it's still missing, rotate order
        try:
            last_call_for_rotation = db.query(VoiceCall).order_by(VoiceCall.created_at.desc()).first()
            if last_call_for_rotation and isinstance(last_call_for_rotation.structured_data, dict):
                prev_missing = _missing_fields(last_call_for_rotation.structured_data)
                if missing and prev_missing and missing[0] == prev_missing[0] and len(missing) > 1:
                    # Move the repeated field to the end to ask a different one next
                    first = missing[0]
                    missing = [m for m in missing if m != first] + [first]
        except Exception as e:
            logger.warning(f"Voice agent rotation logic skipped: {e}")

        ai_reply = ollama_service.generate_natural_reply(transcript, structured, missing)

        # If LLM fallback produced a generic repeated line, provide a more explicit prompt with example
        if ai_reply.strip().lower().startswith("thanks for the details. could you also share your ") and missing:
            field = missing[0]
            examples = {
                "name": "Please tell me your full name. For example: 'My name is Priya Sharma.'",
                "monthly_income": "What is your monthly income? You can say: 'My monthly income is 60,000 rupees.'",
                "credit_score": "What is your credit score? For example: 'My credit score is 750.'",
                "loan_amount": "What loan amount do you need? For example: 'I need a 5 lakh loan.'",
            }
            ai_reply = examples.get(field, ai_reply)

        # 7) TTS to file
        _, audio_url = voice_service.text_to_speech_file(ai_reply)

        # 8) Persist voice call record
        # Persist the last question we are about to ask, if any
        next_question = missing[0] if missing else None
        persist_struct = dict(structured)
        persist_struct["last_question"] = next_question

        voice_call = VoiceCall(
            user_text=transcript,
            ai_reply=ai_reply,
            name=structured.get("name"),
            monthly_income=structured.get("monthly_income"),
            credit_score=structured.get("credit_score"),
            loan_amount=structured.get("loan_amount"),
            audio_url=audio_url,
            structured_data=persist_struct,
        )
        db.add(voice_call)
        db.commit()
        db.refresh(voice_call)

        # 9) If all fields present, run ML model
        eligibility_score = None
        if not missing:
            applicant = {
                "Monthly_Income": structured["monthly_income"],
                "Credit_Score": structured["credit_score"],
                "Loan_Amount_Requested": structured["loan_amount"],
                # Optional: mark voice verified
                "Voice_Verified": 1,
            }
            try:
                pred = ml_service.predict_eligibility(applicant)
                eligibility_score = float(pred.get("eligibility_score")) if pred else None
            except Exception as e:
                logger.warning(f"ML prediction failed: {e}")

            # Update row with prediction
            if eligibility_score is not None:
                voice_call.eligibility_score = eligibility_score
                # also update LoanApplication if present
                if application:
                    application.eligibility_score = eligibility_score
                    application.eligibility_status = (
                        "eligible" if eligibility_score >= 0.5 else "ineligible"
                    )
                db.commit()

        # 10) Prepare response
        response = {
            "transcript": transcript,
            "ai_reply": ai_reply,
            "structured_data": structured,
            "audio_url": audio_url,
        }
        # Include missing fields and readiness signal
        try:
            response["missing_fields"] = missing
            response["ready_for_prediction"] = bool(not missing)
        except Exception:
            response["ready_for_prediction"] = False
        if eligibility_score is not None:
            response["eligibility_score"] = eligibility_score
        if application:
            response["application_id"] = application.id

        logger.info("Voice agent processed successfully")
        return response

    except HTTPException:
        # Already well-formed
        raise
    except Exception as e:
        logger.error(f"Voice agent error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Voice agent failed: {str(e)}")
