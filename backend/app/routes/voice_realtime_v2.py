"""
Real-Time Streaming Voice Agent for AI Loan System (Cloud API Version)
======================================================================

This module implements a fully streaming, real-time voice assistant that:
1. Accepts live audio from frontend via WebSocket (WebM/Opus)
2. Transcribes in real-time using Deepgram (WebSocket Streaming)
3. Streams transcripts to Groq (Llama 3) for intelligent responses
4. Converts LLM tokens to speech using Deepgram Aura (Cloud TTS)
5. Streams audio chunks back to frontend
6. Extracts structured loan data and triggers ML prediction

Tech Stack:
- STT: Deepgram Nova-2 (Direct WebSocket via websockets lib)
- LLM: Groq API (Llama 3 - 70b/8b)
- TTS: Deepgram Aura (Streaming REST)
- Transport: FastAPI WebSocket

Author: AI Development Assistant
Date: December 2025
"""

import asyncio
import json
import logging
import re
import os
import uuid
import base64
import numpy as np
import websockets
from typing import List, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from dotenv import load_dotenv

# Database
from app.models.database import get_db, LoanApplication, User
from sqlalchemy.orm import Session
from datetime import datetime

# Cloud APIs
from groq import AsyncGroq
# We keep DeepgramClient for REST/TTS, but use direct websockets for Streaming STT
from deepgram import DeepgramClient
from app.services.ml_model_service import MLModelService 
from app.utils.security import decode_token

# Try to import optional services
try:
    from app.services.ml_model_service import MLModelService
    ML_SERVICE_AVAILABLE = True
except ImportError:
    ML_SERVICE_AVAILABLE = False
    MLModelService = None

# Load env vars
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
fh = logging.FileHandler('backend_debug.log')
fh.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
fh.setFormatter(formatter)
logger.addHandler(fh)

router = APIRouter()

# Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
GROQ_MODEL = "llama-3.1-8b-instant" 

if not GROQ_API_KEY or not DEEPGRAM_API_KEY:
    logger.error("Missing GROQ_API_KEY or DEEPGRAM_API_KEY in .env")

# Initialize Clients
groq_client = AsyncGroq(api_key=GROQ_API_KEY)
# Used for TTS (REST)
deepgram_client = DeepgramClient(api_key=DEEPGRAM_API_KEY)
ml_service = MLModelService() # Initialize ML Service
import requests
tts_session = requests.Session()

async def get_groq_client():
    return groq_client

LOAN_AGENT_PROMPT = """You are LoanVoice. Be polite, friendly, but efficient.
 
Your Goal: Collect exactly these 7 fields naturally.
CHECKLIST:
1. Full Name
2. Monthly Income
3. Credit Score
4. Loan Amount Requested
5. Employment Type (Salaried / Business)
6. Loan Purpose (e.g., Personal, Home)
7. Existing EMI (if any)
 
Instructions:
1. Look at 'CURRENT KNOWN INFO'. A field is PRESENT only if it is NOT empty and NOT 0.
2. If a field is `""`, `0` or `-1`, it is MISSING. Ask for it naturally.
3. Only ask for ONE missing field at a time.
4. If name is missing, say: "Hi! I'm LoanVoice. Could I get your full name to start?"
5. Once ALL 7 fields are valid (non-zero, non-empty), output the JSON. (Do NOT say "Perfect...").
6. MAX RESPONSE LENGTH: 12 words. Be extremely concise.
7. ABSOLUTELY NO explaining corrections. If user says "Saloid", just map it to "Salaried" and ask next question. DO NOT say "I think you meant...".
8. ABSOLUTELY NO judgement on data. DO NOT say "That seems incomplete" or "That is a variation". Just say "Okay" and move on.
9. Keep acknowledgments neutral: "Okay.", "Sure.", "Thanks.".
   - CRITICAL: Do NOT summarize the collected fields like "Here are the details I have...".
   - CRITICAL: Just say something brief like "Thanks." or nothing at all before the JSON.
6. If user input clarifies a previous field, update it.
7. MAX RESPONSE LENGTH: 15 words. Keep it conversational but brief.
8. Avoid repetitive "Got it" phrases. Vary your acknowledgments (e.g., "Okay," "Sure," "Understood," "Thanks").
9. If input is unclear, politely ask for clarification.
10. AGGRESSIVE NAME CAPTURE: If asking for name and user gives 1-2 words, accept it as name. Exclude greetings. Exclude TITLES (Mr, Mrs, Dr, Er) if they are the ONLY word.
11. CORRECTIONS: If user corrects value, acknowledge it: "Oh, updated that for you."
 
CRITICAL INSTRUCTION:
At the very end of your response, you MUST append the extracted data in JSON format, separated by '|||'.
Format:
<Natural Language Response>
|||
{"name": "", "monthly_income": 0, "credit_score": 0, "loan_amount": 0, "employment_type": "", "loan_purpose": "", "existing_emi": -1}
 
IMPORTANT: Do NOT use markdown code blocks (```json). Just raw JSON.
If a field is unknown, use empty string "" or 0 (or -1 for EMI). DO NOT USE 'null'.
KEYS MUST BE SNAKE_CASE: "monthly_income", "loan_amount", etc.
CRITICAL: ALWAYS output the JSON block containing the full current state at the end of every response.
CRITICAL: Do NOT begin your response with "CURRENT KNOWN INFO:". Start directly with the question or answer.
"""
# ========================== Helper Functions ==========================

async def synthesize_speech_deepgram(text: str) -> Optional[bytes]:
    """Convert text to speech using Deepgram Aura."""
    if not text.strip():
        return None
    
    try:
        url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&container=wav"
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {"text": text}
        
        # Requests is blocking, so run in executor to keep websocket loop aligned
        import requests
        loop = asyncio.get_event_loop()
        
        def call_api():
             return tts_session.post(url, headers=headers, json=payload, timeout=5)
             
        response = await loop.run_in_executor(None, call_api)
        
        if response.status_code == 200:
             return response.content
        else:
             logger.error(f"Deepgram TTS API Error: {response.status_code} - {response.text}")
             return None

    except Exception as e:
        logger.error(f"Deepgram TTS error: {e}")
        return None

# ========================== WebSocket Endpoint ==========================

@router.websocket("/voice/stream")
async def voice_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Check if API keys are available
    if not GROQ_API_KEY or not DEEPGRAM_API_KEY or not deepgram_client or not groq_client:
        logger.warning("Voice agent accessed but API keys are missing")
        await websocket.send_json({
            "type": "error",
            "message": "Voice agent is currently unavailable. API keys not configured. Please use the chat or form instead."
        })
        await websocket.close()
        return
    session_id = str(uuid.uuid4())
    logger.info(f"Voice session started: {session_id} | VERSION V4: NUCLEAR JSON FILTER ACTIVE")
    
    # State
    conversation_history = []
    structured_data = {}
    # Try to resolve the currently logged-in user from JWT token
    # Token is expected as `?token=...` on the WebSocket URL, but we
    # also fall back to an Authorization header if present.
    try:
        token: Optional[str] = websocket.query_params.get("token")
        if not token:
            auth_header = websocket.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if token:
            token_data = decode_token(token)
            email = token_data.get("email") if isinstance(token_data, dict) else None
            if email:
                db = next(get_db())
                try:
                    user = db.query(User).filter(User.email == email).first()
                    if user:
                        # Store for downstream logic (DB insert, manager view, emails)
                        structured_data["user_email"] = user.email
                        structured_data["user_id"] = user.id
                finally:
                    try:
                        db.close()
                    except Exception:
                        pass
    except Exception as auth_err:
        logger.warning(f"Failed to resolve user from WebSocket token: {auth_err}")
    
    # Direct Direct WebSocket Connection Logic
    deepgram_url = "wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&numerals=true&interim_results=true&utterance_end_ms=1100&vad_events=true&endpointing=400"
    
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}"
    }

    try:
        logger.info(f"Deepgram: Initializing DIRECT connection...")
        async with websockets.connect(deepgram_url, extra_headers=headers) as dg_socket:
            logger.info("Deepgram WebSocket Connected!")
            
            # Helper to process logic when document is uploaded
            async def handle_document_logic():
                logger.info("Processing Document Logic...")
                structured_data["document_verified"] = True
                
                income = structured_data.get("monthly_income", 0)
                credit = structured_data.get("credit_score", 0)
                loan = structured_data.get("loan_amount", 0)
                
                missing = []
                if not income: missing.append("monthly income")
                if not credit: missing.append("credit score")
                if not loan: missing.append("loan amount")
                
                if missing:
                    msg = f"I've verified your document. However, I still need your {', '.join(missing)} to check your eligibility. Please tell me those details."
                    eligible = False
                else:
                    eligible = False
                    reason = ""
                    score = 0.5

                    if ML_SERVICE_AVAILABLE:
                        try:
                            ml_service = MLModelService()
                            applicant_data = {
                                "Monthly_Income": income,
                                "Credit_Score": credit,
                                "Loan_Amount_Requested": loan,
                                "Loan_Tenure_Years": 5,
                                "Employment_Type": "Salaried",
                                "Age": 30,
                                "Existing_EMI": 0,
                                "Document_Verified": 1
                            }
                            result = ml_service.predict_eligibility(applicant_data)
                            eligible = result["eligibility_status"] == "eligible"
                            score = result["eligibility_score"]
                            msg = result.get("reason", "Based on our analysis...")
                        except Exception as e:
                            logger.error(f"ML Prediction failed: {e}")
                            score = 0
                            msg = "Error checking eligibility."
                    
                    # Save to Database
                    application_id = None
                    try:
                        from app.models.database import SessionLocal, LoanApplication
                        from datetime import datetime
                        db = SessionLocal()
                        # Persist both modern and legacy fields so manager dashboard "View" shows values
                        monthly_income_val = float(income) if income else 0.0
                        loan_amount_val = float(loan) if loan else 0.0
                        new_app = LoanApplication(
                            full_name=structured_data.get("name", "Voice User"),
                            monthly_income=monthly_income_val,
                            # Legacy fields used by ManagerDashboard detail view
                            annual_income=monthly_income_val * 12 if monthly_income_val else None,
                            loan_amount=loan_amount_val if loan_amount_val else None,
                            credit_score=int(credit),
                            loan_amount_requested=loan_amount_val,
                            loan_tenure_years=5,
                            employment_type="Salaried",
                            eligibility_status="eligible" if eligible else "ineligible",
                            eligibility_score=float(score) if ML_SERVICE_AVAILABLE else (0.9 if eligible else 0.4),
                            debt_to_income_ratio=float(result.get("debt_to_income_ratio", 0.0)) if ML_SERVICE_AVAILABLE and 'result' in locals() else 0.0,
                            document_verified=True,
                            created_at=datetime.utcnow()
                        )
                        db.add(new_app)
                        db.commit()
                        db.refresh(new_app)
                        application_id = new_app.id
                        db.close()
                    except Exception as e:
                        logger.error(f"Failed to save application to DB: {e}")

                    await websocket.send_json({
                        "type": "eligibility_result", 
                        "data": {
                            "eligible": eligible, 
                            "message": msg,
                            "application_id": application_id,
                            "score": score
                        }
                    })
                
                await websocket.send_json({"type": "assistant_transcript", "data": msg})
                conversation_history.append({"role": "assistant", "content": msg})
                
                audio = await synthesize_speech_deepgram(msg)
                if audio:
                    b64 = base64.b64encode(audio).decode('ascii')
                    await websocket.send_json({"type": "audio_chunk", "data": b64})

            # Start Sender Task (Frontend Audio -> Deepgram)
            async def sender_task():
                logger.info("SENDER TASK STARTED")
                try:
                    chunk_count = 0
                    while True:
                        try:
                            # KeepAlive Logic: Wait for message with timeout
                            try:
                                # logger.info("Waiting for WebSocket message...")
                                message = await asyncio.wait_for(websocket.receive(), timeout=5.0)
                            except asyncio.TimeoutError:
                                # Send KeepAlive to Deepgram to prevent net0001
                                await dg_socket.send(json.dumps({"type": "KeepAlive"}))
                                continue

                            # logger.info(f"Received message type: {message.keys()}")
                            
                            # DIAGNOSTIC LOGGING (Safe)
                            if "bytes" in message:
                                pass 
                            elif "text" in message:
                                logger.info(f"WS RX: Text ({len(message['text'])} chars): {message['text'][:100]}")

                            # PROCESSING
                            if "bytes" in message:
                                chunk = message["bytes"]
                                chunk_count += 1
                                # VERBOSE LOGGING ENABLED
                                logger.info(f"Audio chunk #{chunk_count} ({len(chunk)} bytes) -> Sending to Deepgram")
                                
                                try:
                                    await dg_socket.send(chunk)
                                except Exception as e:
                                    logger.error(f"Failed to send chunk #{chunk_count} to Deepgram: {e}")
                                    break
                            
                            elif "text" in message:
                                try:
                                    data_json = json.loads(message["text"])
                                    if isinstance(data_json, dict):
                                        if data_json.get("type") == "debug_log":
                                            logger.info(f"FRONTEND DEBUG: {data_json.get('message')}")
            
                                        if data_json.get("type") == "audio_data":
                                            b64 = data_json.get("data")
                                            if b64:
                                                chunk = base64.b64decode(b64)
                                                chunk_count += 1
                                                if chunk_count % 50 == 0: logger.info(f"Audio chunk #{chunk_count} ({len(chunk)} bytes) [Base64]")
                                                await dg_socket.send(chunk)
                                                
                                        if data_json.get("type") == "text_input":
                                            text = data_json.get("data")
                                            
                                            # Send KeepAlive to Deepgram (Prevent Net0001 Timeout)
                                            await dg_socket.send(json.dumps({"type": "KeepAlive"}))
                                            
                                            await websocket.send_json({"type": "final_transcript", "data": text})
                                            
                                            # DIAGNOSTIC: Test ML service directly
                                            if "TEST123" in text.upper():
                                                logger.error("!!! DIAGNOSTIC TEST TRIGGERED !!!")
                                                test_applicant = {
                                                    "Monthly_Income": 5000.0,
                                                    "Credit_Score": 750,
                                                    "Loan_Amount_Requested": 10000.0,
                                                    "Loan_Tenure_Years": 5,
                                                    "Existing_EMI": 0,
                                                }
                                                test_result = ml_service.predict_eligibility(test_applicant)
                                                logger.error(f"!!! TEST RESULT: {test_result} !!!")
                                                await websocket.send_json({"type": "eligibility_result", "data": test_result})
                                                continue
                                            
                                            # NON-BLOCKING: Process LLM in background so we don't freeze inputs
                                            asyncio.create_task(
                                                process_llm_response(text, websocket, conversation_history, structured_data, generate_audio=False)
                                            )
            
                                        elif data_json.get("type") == "document_uploaded":
                                            logger.info("DOCUMENT UPLOADED - Acknowledged")
                                            # Wait for user to click "Done" in frontend
                                            pass

                                        elif data_json.get("type") == "interaction_end":
                                            logger.info("INTERACTION END - Mic Toggled Off. Sending KeepAlive to flush/maintain connection.")
                                            await dg_socket.send(json.dumps({"type": "KeepAlive"}))
                                            # Optional: If we want to force Close: await dg_socket.send(json.dumps({"type": "CloseStream"}))
                                            # But we want to KeepAlive for resume.

                                        elif data_json.get("type") == "verification_completed":
                                            logger.info("VERIFICATION COMPLETED - Verifying and Re-checking Eligibility")
                                            structured_data["documents_verified"] = True
                                            # Re-run eligibility check now that docs are verified
                                            await evaluate_eligibility(structured_data, websocket, ml_service)


                                    else:
                                        logger.warning(f"Ignored non-dict JSON: {data_json}")

                                except Exception as e:
                                    logger.error(f"Error handling text message: {e}")

                        except RuntimeError:
                            logger.info("WebSocket disconnected")
                            break
                        except Exception as e:
                            logger.error(f"CRITICAL ERROR in Sender Loop: {e}")
                            # Continue loop to keep audio alive
                            continue
                except Exception as e:
                    logger.error(f"Sender Task Fatal Error: {e}")
            
            # Start Receiver Task (Deepgram Transcript -> Frontend/LLM)
            async def receiver_task():
                logger.info("RECEIVER TASK STARTED")
                llm_task = None
                try:
                    async for msg in dg_socket:
                        try:
                            # Verify msg is a valid type
                            if not isinstance(msg, (str, bytes)):
                                logger.warning(f"Ignored non-text/bytes from Deepgram: {type(msg)}")
                                continue

                            res = json.loads(msg)
                            if not isinstance(res, dict):
                                logger.warning(f"Ignored non-dict response from Deepgram: {res}")
                                continue

                            # Parse Transcript
                            if 'channel' in res:
                                channel = res['channel']
                                # Safety Check
                                if not isinstance(channel, dict):
                                    logger.warning(f"Unexpected channel type: {type(channel)} - Body: {res}")
                                    continue

                                alts = channel.get('alternatives', [])
                                if alts:
                                    sentence = alts[0]['transcript']
                                    is_final = res.get('is_final', False)
                                    
                                    if len(sentence) > 0:
                                         # logger.info(f"Deepgram transcript: {sentence}")
                                         pass
                                    
                            # Interruption Handling: Cancel previous LLM task if user speaks again
                                    if is_final and len(sentence) > 0:
                                        logger.info(f"User said: {sentence}")
                                        
                                        # Cancel previous task if still running
                                        if llm_task and not llm_task.done():
                                            logger.info("Interrupting previous LLM task...")
                                            llm_task.cancel()
                                            
                                        await websocket.send_json({"type": "final_transcript", "data": sentence})
                                        llm_task = asyncio.create_task(process_llm_response(sentence, websocket, conversation_history, structured_data))
                        except Exception as e:
                             logger.error(f"Error processing Deepgram message: {e} - RAW: {msg[:200]}")
                             continue
                    
                    logger.info("Deepgram Stream Ended (Receiver Loop Finished)")

                except Exception as e:
                    logger.error(f"Receiver Task Fatal Error: {e}")
                finally:
                    logger.info("RECEIVER TASK EXITING")

            # Run both tasks concurrently
            sender = asyncio.create_task(sender_task())
            receiver = asyncio.create_task(receiver_task())
            
            done, pending = await asyncio.wait(
                [sender, receiver],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            for task in pending:
                task.cancel()
                
    except Exception as e:
        logger.error(f"Connection/WebSocket Error: {e}", exc_info=True)
        try:
            await websocket.close()
        except:
            pass

async def evaluate_eligibility(data: dict, websocket, ml_service):
    """
    Centralized logic to check eligibility criteria and trigger result OR document verification.
    """
    # Simply: Check strictly against 'data' which is the source of truth
    # FIX: Check for TRUTHINESS (non-zero, non-empty), not just existence
    income = data.get("monthly_income", 0)
    score = data.get("credit_score", 0)
    amount = data.get("loan_amount", 0)
    name = data.get("name", "")
    employment = data.get("employment_type", "")
    purpose = data.get("loan_purpose", "")
    # Required Fields Check
    has_income = dict(data).get("monthly_income") and float(income) > 0
    has_score = dict(data).get("credit_score") and int(score) > 0 
    has_amount = dict(data).get("loan_amount") and float(amount) > 0
    # FIX: Reject "..." as valid string
    has_name = len(str(name).strip()) > 1 and "..." not in str(name)
    has_employment = len(str(employment).strip()) > 2 and "..." not in str(employment)
    has_purpose = len(str(purpose).strip()) > 2 and "..." not in str(purpose)
    # FIX: Require EMI (Allow 0, but reject -1 which is our "Missing" flag)
    # Note: If key is missing, get() returns -1 (default)
    emi = data.get("existing_emi", -1)
    has_emi = float(emi) >= 0

    # If we have all required fields
    if has_income and has_score and has_amount and has_name and has_employment and has_purpose and has_emi:
        
        # 1. VERIFICATION GATE
        # If documents are NOT verified yet, request them first
        if not data.get("documents_verified"):
            
            # Check if we already asked (to prevent spamming, optional but good UX)
            if not data.get("verification_requested"):
                # LOCK IMMEDIATELY to prevent race conditions (Echo/Barge-in)
                # LOCK IMMEDIATELY to prevent race conditions (Echo/Barge-in)
                data["verification_requested"] = True
                logger.info("Critical Data Present -> REQUESTING DOCUMENT VERIFICATION")

                # 1. Save to Database FIRST (To get ID)
                application_id = None
                try:
                    db = next(get_db())
                    monthly_income_val = float(data.get("monthly_income", 0) or 0.0)
                    loan_amount_val = float(data.get("loan_amount", 0) or 0.0)
                    user_email = data.get("user_email") or "voice_user@example.com"
                    user_id = data.get("user_id") or None
                    new_app = LoanApplication(
                        user_id=int(user_id) if user_id is not None else None,
                        full_name=data.get("name", "Voice User"),
                        monthly_income=monthly_income_val,
                        # Legacy fields used by ManagerDashboard detail view
                        annual_income=monthly_income_val * 12 if monthly_income_val else None,
                        loan_amount=loan_amount_val if loan_amount_val else None,
                        credit_score=int(data.get("credit_score", 0)),
                        loan_amount_requested=loan_amount_val,
                        # Enhanced Voice Fields
                        employment_type=data.get("employment_type", "Salaried"),
                        loan_purpose=data.get("loan_purpose", "Personal"),
                        loan_tenure_years=float(data.get("loan_tenure_years", 5)),
                        existing_emi=float(data.get("existing_emi", 0)),
                        marital_status=data.get("marital_status", "Single"),
                        # Defaults
                        email=user_email,
                        phone="0000000000",
                        approval_status="pending",
                        document_verified=False,
                        created_at=datetime.utcnow()
                    )
                    db.add(new_app)
                    db.commit()
                    db.refresh(new_app)
                    application_id = new_app.id
                    logger.info(f"Created Draft Application ID: {application_id}")
                except Exception as db_e:
                    logger.error(f"Failed to create draft application: {db_e}")
                    application_id = 9999

                # 2. Send Signal to Frontend IMMEDIATELLY (Show Button, Stop Mic)
                speech_text = "Perfect. I have all your details. I am taking you to the verification step now."
                applicant_preview = {
                    "monthly_income": data.get("monthly_income"),
                    "loan_amount": data.get("loan_amount"),
                    "credit_score": data.get("credit_score")
                }
                
                await websocket.send_json({
                    "type": "document_verification_required", 
                    "data": {
                        "structured_data": applicant_preview,
                        "message": speech_text,
                        "application_id": application_id
                    }
                })

                # 3. Generate & Send Audio (Parallel-ish to UI)
                # Now that button is visible, we play the audio
                audio = await synthesize_speech_deepgram(speech_text)
                if audio:
                    b64 = base64.b64encode(audio).decode('ascii')
                    await websocket.send_json({"type": "audio_chunk", "data": b64})

                return

            # 2. ELIGIBILITY CHECK (Only runs if documents_verified == True)
            if not data.get("eligibility_checked"):
                try:
                    # Prepare data for ML
                    income = float(data.get("monthly_income", 0))
                    score = int(data.get("credit_score", 0))
                    amount = float(data.get("loan_amount", 0))

                    # GUARD: Prevent premature check if values are effectively zero
                    if income < 100 or amount < 100 or score < 300:
                            logger.warning(f"Premature Eligibility Check blocked: Income={income}, Score={score}, Amount={amount}")
                            return

                    logger.error(f"!!! DEBUG PROACTIVE CHECK !!! Income={income}, Score={score}, Amount={amount}")

                    applicant = {
                        "Monthly_Income": income,
                        "Credit_Score": score,
                        "Loan_Amount_Requested": amount,
                        # Defaults
                        "Loan_Tenure_Years": 5, 
                        "Existing_EMI": float(data.get("existing_emi", 0)),
                    }
                    
                    logger.info(f"APPLICANT FOR ML: {applicant}")
                    
                    result = ml_service.predict_eligibility(applicant)
                    data["eligibility_checked"] = True # Prevent loops
                    
                    # Send Success Result
                    await websocket.send_json({"type": "eligibility_result", "data": result})
                    
                    # Verbal Announcement
                    announcement = f"Based on your validated profile, you are {result['eligibility_score']*100:.0f} percent eligible."
                    if result['eligibility_status'] == 'eligible':
                        announcement += " Your application looks strong."
                    else:
                        announcement += " We might need to adjust the loan amount."
                        
                    await websocket.send_json({"type": "assistant_transcript", "data": announcement})
                    
                    # Audio for announcement
                    audio = await synthesize_speech_deepgram(announcement)
                    if audio:
                        b64 = base64.b64encode(audio).decode('ascii')
                        await websocket.send_json({"type": "audio_chunk", "data": b64})

                except Exception as e:
                    logger.error(f"Error in evaluate_eligibility: {e}")

            # Start Sender Task (Frontend -> Deepgram)
            async def sender_task():
                logger.info("SENDER TASK STARTED")
                try:
                    while True:
                        try:
                            try:
                                message = await asyncio.wait_for(websocket.receive(), timeout=5.0)
                            except asyncio.TimeoutError:
                                await dg_socket.send(json.dumps({"type": "KeepAlive"}))
                                continue

                            if "bytes" in message:
                                await dg_socket.send(message["bytes"])
                            elif "text" in message:
                                data = json.loads(message["text"])
                                if data.get("type") == "audio_data":
                                    b64 = data.get("data")
                                    if b64:
                                         chunk = base64.b64decode(b64)
                                         await dg_socket.send(chunk)
                        except RuntimeError:
                            break
                        except Exception as e:
                            logger.error(f"Sender Loop Error: {e}")
                            break
                except Exception as e:
                    logger.error(f"Sender Task Fatal: {e}")
                finally:
                    logger.info("SENDER TASK EXITING")

            # Start Receiver Task (Deepgram -> Frontend/LLM)
            async def receiver_task():
                logger.info("RECEIVER TASK STARTED")
                llm_task = None
                try:
                    async for msg in dg_socket:
                        res = json.loads(msg)
                        channel = res.get('channel', {})
                        alts = channel.get('alternatives', [])
                        if alts:
                            sentence = alts[0]['transcript']
                            is_final = res.get('is_final', False)
                            
                            if is_final and len(sentence) > 0:
                                # FIX: Stop processing if verification already requested (Prevent Echo Loop)
                                if structured_data.get("verification_requested"):
                                    logger.info(f"Verification requested. Ignoring input: {sentence}")
                                    continue

                                # NOISE GATE: Ignore very short inputs or common hallucinations
                                clean_text = sentence.strip().lower()
                                # Allow: hi, no, ok, yes, hey. Block: "a", "", "thank you"
                                # FIX: Allow digits! (e.g. "5", "1")
                                if (len(clean_text) < 2 and not clean_text.isdigit() and clean_text not in ["i"]) or clean_text in ["thank you.", "thank you"]:
                                    if clean_text not in ["hi", "no", "ok", "yes", "hey"]:
                                         logger.info(f"Ignored noise/hallucination: {sentence}")
                                         continue

                                logger.info(f"User said (Accepted): {sentence}")

                                # BARGE-IN: User spoke. Interrupt playback.
                                await websocket.send_json({"type": "interrupt"})

                                logger.info(f"User said: {sentence}")
                                if llm_task and not llm_task.done(): 
                                    llm_task.cancel()
                                    logger.info("Cancelled previous LLM task for new input")
                                
                                await websocket.send_json({"type": "final_transcript", "data": sentence.rstrip('.')})
                                # Call global process function
                                llm_task = asyncio.create_task(process_llm_response(sentence, websocket, conversation_history, structured_data))
                except Exception as e:
                    logger.error(f"Receiver Task Error: {e}")
                finally:
                    logger.info("RECEIVER TASK EXITING")

            # Run tasks concurrently
            sender = asyncio.create_task(sender_task())
            receiver = asyncio.create_task(receiver_task())
            
            try:
                done, pending = await asyncio.wait(
                    [sender, receiver],
                    return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
            except Exception as e:
                logger.error(f"Task Wait Error: {e}")



async def process_llm_response(user_text: str, websocket: WebSocket, history: List[Dict], data: Dict, generate_audio: bool = True):
    """Process user text with Groq LLM and stream response."""
    history.append({"role": "user", "content": user_text})
    current_state_str = json.dumps(data, indent=2)
    system_prompt = LOAN_AGENT_PROMPT + f"\n\nCURRENT KNOWN INFO:\n{current_state_str}"
    
    # We use last 24 messages for context (increased to cover full 7-field flow)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-24:])
    
    # DOUBLE LOCK: Reject processing if we are already verifying
    if data.get("verification_requested"):
         logger.warning("Rejecting LLM processing: Verification already requested.")
         return
    
    try:
        completion = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=1024
        )
        
        full_response = ""
        is_collecting_json = False
        suppress_text_stream = False
        json_buffer = ""
        sentence_buffer = ""
        held_tokens = "" # FIX: Buffer for risky prefixes
        
        async for chunk in completion:
            content = chunk.choices[0].delta.content
            if not content: continue

            # TRIPLE LOCK: Runtime check for parallel completion
            if data.get("verification_requested"):
                logger.warning("Aborting stream: Verification triggered by parallel task.")
                break
            
            # 0. KEYWORD SUPPRESSION LOGIC (V5 - Prefix Buffering)
            if not is_collecting_json:
                # FAST PATH: Immediately allow safe conversational starters
                # This prevents "Prefix Check" latency for common words
                SAFE_STARTERS = ["Okay", "Sure", "Thanks", "Yes", "No", "Right", "Great", "Ah", "Oh"]
                if any(content.lstrip().startswith(s) for s in SAFE_STARTERS) and not sentence_buffer:
                     await websocket.send_json({"type": "ai_token", "data": content})
                     sentence_buffer += content
                     full_response += content
                     continue

                # Check if what we are building is a prefix of the forbidden phrases
                RISKY_PHRASES = ["Perfect. I have all your details", "I am taking you to the verification"]
                
                temp_check = sentence_buffer + content
                is_risky_prefix = False
                should_suppress = False
                
                for phrase in RISKY_PHRASES:
                    # Check if this could BECOME the forbidden phrase
                    if phrase.startswith(temp_check):
                        is_risky_prefix = True
                    # Check if it IS the forbidden phrase (or enough of it)
                    if temp_check.startswith(phrase) or (len(temp_check) > 15 and temp_check in phrase):
                        should_suppress = True
            
            if suppress_text_stream:
                    pass
            elif should_suppress:
                    # MATCH FOUND! ENABLE SUPPRESSION
                    logger.warning(f"SUPPRESSING FORBIDDEN PHRASE: {temp_check}")
                    suppress_text_stream = True
                    held_tokens = "" 
            elif is_risky_prefix:
                    # DANGER: It *might* be the phrase. Hold tokens.
                    # logger.info(f"Holding risky tokens: {content} | Total: {held_tokens + content}")
                    held_tokens += content
            else:
                    if held_tokens:
                        await websocket.send_json({"type": "ai_token", "data": held_tokens})
                        held_tokens = ""
                    if not suppress_text_stream:
                        await websocket.send_json({"type": "ai_token", "data": content})

            if suppress_text_stream and not is_collecting_json:
                 # Accumulate for analysis but DO NOT STREAM
                 sentence_buffer += content
                 full_response += content
                 # Still check for JSON start (Nuclear Option)
                 json_start_index = sentence_buffer.find('{')
                 if json_start_index != -1:
                      # If JSON starts, we can stop suppressing and switch to JSON mode
                      pass 
                 else:
                      continue # SKIP STREAMING TOKENS

            # 1. State: Collecting JSON
            if is_collecting_json:
                json_buffer += content
                continue

            # 2. State: Streaming Text
            full_response += content # Track full response for history
            
            # Append to buffer for analysis
            sentence_buffer += content
            
            # HOTFIX: Strip "CURRENT KNOWN INFO:" if it leaks at the start
            if full_response.strip().startswith("CURRENT KNOWN INFO:"):
                 logger.warning("Stripped leaked prompt header from response")
                 sentence_buffer = sentence_buffer.replace("CURRENT KNOWN INFO:", "").lstrip()
                 full_response = full_response.replace("CURRENT KNOWN INFO:", "").lstrip()
            
            # SAFETY NET v4: NUCLEAR OPTION
            # Any occurrence of '{' is treated as code start.
            json_start_index = sentence_buffer.find('{')

            if json_start_index != -1:
                # JSON DETECTED!
                logger.info("JSON detected in stream (Nuclear Check)! Switching mode.")
                
                # Split: Text | JSON
                text_part = sentence_buffer[:json_start_index]
                
                # FIX: Clean delimiters AND duplicate messages from the text part
                text_part = text_part.replace("|||", "").replace("||", "")
                text_part = text_part.replace("Perfect. I have all your details.", "")
                text_part = text_part.replace("I am taking you to the verification step now.", "")
                text_part = text_part.strip()
                
                json_part = sentence_buffer[json_start_index:]
                
                # 1. Handle JSON
                is_collecting_json = True
                json_buffer += json_part
                
                # 2. Handle Text (Prevent Silence)
                # Calculate the new safe text chunk to stream to frontend
                # sentence_buffer = old_buffer + content
                # text_part = old_buffer + safe_content
                # safe_content = text_part - old_buffer
                old_buffer_len = len(sentence_buffer) - len(content)
                if len(text_part) > old_buffer_len:
                    safe_new_chunk = text_part[old_buffer_len:]
                    if safe_new_chunk:
                         await websocket.send_json({"type": "ai_token", "data": safe_new_chunk})

                # 3. Force TTS for the text part (Flush it)
                if text_part.strip() and generate_audio:
                     logger.info(f"TTS Streaming [Forced Flush]: {text_part[:30]}...")
                     speech_chunk = re.sub(r'\*+|`+|\[.*?\]|\(.*?\)', ' ', text_part)
                     audio = await synthesize_speech_deepgram(speech_chunk)
                     if audio:
                         b64 = base64.b64encode(audio).decode('ascii')
                         await websocket.send_json({"type": "audio_chunk", "data": b64})

                sentence_buffer = "" # Clear sentence buffer as we flushed it
                continue

            # If SAFE, stream tokens (Unless it's the duplicate duplicate completion message)
            # FIX: Tokens handled by V5 Buffer Logic above. 
            # We do NOT stream here anymore to avoid duplication.
            pass
            
            # Check for JSON delimiter (Legacy support for |||)
            
            # Check for JSON delimiter in the ACCUMULATED buffer
            # Check for JSON delimiter in the ACCUMULATED buffer
            if "|||" in sentence_buffer:
                parts = sentence_buffer.split("|||")
                speech_part = parts[0]
                json_part = parts[1] if len(parts) > 1 else ""
                
                # Speak the final speech part
                if speech_part.strip() and generate_audio:
                     cleaned_speech = re.sub(r'\*+|`+|\[.*?\]|\(.*?\)', ' ', speech_part)
                     audio = await synthesize_speech_deepgram(cleaned_speech)
                     if audio:
                        b64 = base64.b64encode(audio).decode('ascii')
                        await websocket.send_json({"type": "audio_chunk", "data": b64})
                
                # Switch to JSON mode
                is_collecting_json = True
                json_buffer += json_part
                sentence_buffer = "" # Clear buffer forever
                continue

            # Check for sentence delimiters (Sentence-Level Streaming)
            delimiters = ['. ', '? ', '! ', '.\n', '?\n', '!\n', ', ', ',\n']
            if any(punct in sentence_buffer for punct in delimiters):
                for delimiter in delimiters:
                     if delimiter in sentence_buffer:
                         parts = sentence_buffer.split(delimiter)
                         # Everything except the last part is a complete sentence(s)
                         complete_sentence = delimiter.join(parts[:-1]) + delimiter.strip()
                         remainder = parts[-1]
                         
                         # SMART TTS LOGIC v3 (Stability Focused):
                         # Only split on commas if:
                         # 1. It is a Safe Starter (Instant Ack: "Okay,")
                         # 2. OR The chunk is LONG enough to be worth speaking (> 40 chars) to hide latency.
                         if delimiter.strip() == ',':
                             SAFE_STARTERS = ["Okay", "Sure", "Thanks", "Yes", "No", "Right", "Great"]
                             is_safe = any(complete_sentence.lstrip().startswith(s) for s in SAFE_STARTERS)
                             
                             if not is_safe and len(complete_sentence) < 40:
                                 # It's a short/medium fragment (e.g. "However," or "Then I said,").
                                 # Don't split. Buffer it to ensure smooth flow.
                                 continue

                         # FIX: Check for duplicate message
                         is_duplicate = "Perfect. I have all your details" in complete_sentence
                         if complete_sentence.strip() and generate_audio and not is_duplicate:
                             # Clean and Speak IMMEDIATELLY
                             speech_chunk = re.sub(r'\*+|`+|\[.*?\]|\(.*?\)', ' ', complete_sentence)
                             logger.info(f"TTS Streaming: {speech_chunk[:30]}...")
                             
                             audio = await synthesize_speech_deepgram(speech_chunk)
                             if audio:
                                 b64 = base64.b64encode(audio).decode('ascii')
                                 await websocket.send_json({"type": "audio_chunk", "data": b64})
                         
                         sentence_buffer = remainder
                         break



        if full_response.strip():
             history.append({"role": "assistant", "content": full_response})

        # FLUSH HELD TOKENS (Important if stream ends with a partial prefix)
        if held_tokens and not suppress_text_stream:
             logger.info(f"Flushing trailing held tokens: {held_tokens}")
             await websocket.send_json({"type": "ai_token", "data": held_tokens})

        # FLUSH REMAINING BUFFER (Critical for short replies like "Hello" or "Yes")
        # Combine held_tokens into sentence_buffer for TTS if needed
        # (Though visually we just sent it, TTS needs the buffer)
        if held_tokens:
             sentence_buffer += held_tokens

        if sentence_buffer.strip() and generate_audio:
             logger.info(f"TTS Streaming [FLUSH]: {sentence_buffer[:30]}...")
             speech_chunk = re.sub(r'\*+|`+|\[.*?\]|\(.*?\)', ' ', sentence_buffer)
             audio = await synthesize_speech_deepgram(speech_chunk)
             if audio:
                 b64 = base64.b64encode(audio).decode('ascii')
                 await websocket.send_json({"type": "audio_chunk", "data": b64})

        
        # Parse JSON
        if json_buffer:
            logger.info(f"PROCESSING JSON BUFFER: {json_buffer}")
            try:
                # Remove markdown code blocks if present
                clean_json = json_buffer.replace("```json", "").replace("```", "").strip()
                
                # Attempt 1: Direct Parse
                try:
                    extracted = json.loads(clean_json)
                except json.JSONDecodeError:
                    # Attempt 2: Regex Extraction (Soft Fallback)
                    logger.warning(f"Direct JSON parse failed. Trying Regex on: {clean_json[:50]}...")
                    match = re.search(r'(\{.*?\})', clean_json, re.DOTALL)
                    if match:
                        try:
                            extracted = json.loads(match.group(1))
                        except:
                            logger.error("Regex extracted JSON also failed to parse.")
                            extracted = {}
                    else:
                        logger.error("No JSON object found in buffer via Regex.")
                        extracted = {}
                
                # DIAGNOSTIC LOG
                logger.info(f"LLM EXTRACTED RAW: {extracted}")
                
                 # KEY NORMALIZATION (Refactored Helper Logic)
                normalized = {}
                for k, v in extracted.items():
                    k_lower = k.lower().strip().replace(" ", "_")
                    
    # 1. Income
                    if k_lower in ["income", "monthly_income", "monthlyincome", "salary", "annual_income"]:
                         try: 
                            clean_val = re.sub(r'[^\d.]', '', str(v))
                            normalized["monthly_income"] = float(clean_val) 
                         except: pass
                    
                    # 7. Existing EMI (NEW)
                    if k_lower in ["existing_emi", "emi", "monthly_emi", "installments", "current_emi"]:
                         try: 
                            clean_val = re.sub(r'[^\d.-]', '', str(v))
                            normalized["existing_emi"] = float(clean_val) 
                         except: pass
                    # 2. Credit Score
                    elif k_lower in ["credit_score", "score", "cibil", "creditscore", "credit"]:
                         try: 
                            clean_val = re.sub(r'[^\d.]', '', str(v))
                            normalized["credit_score"] = int(float(clean_val))
                         except: pass
                         
                    # 3. Loan Amount
                    elif k_lower in ["loan_amount", "amount", "loanamount", "loan", "requested_amount", "amount_requested", "total_amount"]:
                         try: 
                            clean_val = re.sub(r'[^\d.]', '', str(v))
                            normalized["loan_amount"] = float(clean_val)
                         except: pass
                         
                    # 4. Tenure
                    elif k_lower in ["loan_tenure_years", "tenure", "years", "term"]:
                         try: normalized["loan_tenure_years"] = float(v)
                         except: pass
                         
                    # 5. Name (Pass through)
                    elif k_lower in ["name", "full_name", "fullname", "first_name", "user_name"]:
                        normalized["name"] = v
                    
                    # 6. Employment Type
                    elif k_lower in ["employment_type", "employment", "job_type", "employment_status", "work_type", "profession", "type"]:
                        normalized["employment_type"] = v
                        
                    # 7. Loan Purpose
                    elif k_lower in ["loan_purpose", "purpose", "reason", "loan_reason"]:
                        normalized["loan_purpose"] = v

                logger.info(f"NORMALIZED CLEAN DATA: {normalized}")
                # Only update keys if the new value is valid (non-zero/non-empty)
                # This stops the LLM from wiping existing data with hallucinated 0s
                for key, value in normalized.items():
                    if value not in [0, 0.0, "", None]:
                        data[key] = value
                    else:
                        # Optional: Key exists but value is 0. 
                        # Do we update? NO, keep old valid value if present.
                        if key not in data:
                            data[key] = value
                
                # DIAGNOSTIC: Log global data state
                logger.info(f"FINAL DATA STATE: {data}")
                
                await websocket.send_json({"type": "structured_update", "data": normalized})

                # PROACTIVE ELIGIBILITY CHECK
                await evaluate_eligibility(data, websocket, ml_service)

            except Exception as json_err:
                 # This catch block handles JSON parsing failures
                 logger.error(f"Failed to parse JSON: {json_err}")

    except Exception as e:
        logger.error(f"LLM Error: {e}")
