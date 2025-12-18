"""
Chat Routes for AI-powered conversations
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.models.database import get_db, ChatSession, LoanApplication, User
from app.models.schemas import ChatRequest, ChatResponse
from app.services.llm_selector import get_llm_service
from app.services.ml_model_service import MLModelService
from app.services.report_service import ReportService
from app.services.email_service import email_service
from app.utils.logger import get_logger
from app.utils.security import decode_token
import json
import re
import os

logger = get_logger(__name__)
router = APIRouter()

llm_service = get_llm_service()
ml_service = MLModelService()
report_service = ReportService()


@router.post("/message", response_model=ChatResponse)
async def send_message(request: ChatRequest, http_req: Request, db: Session = Depends(get_db)):
    """
    Send a message to the AI chat agent

    The AI will help with loan application questions and guide users through the process
    """
    try:
        # Identify current user (optional)
        user_id = None
        try:
            auth = http_req.headers.get("authorization") or http_req.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
                decoded = decode_token(token)
                if decoded and decoded.get("email"):
                    user = db.query(User).filter(User.email == decoded["email"]).first()
                    if user:
                        user_id = user.id
        except Exception:
            pass



        # --- USER EXISTENCE CHECK ---
        application = None
        user = None
        # Check for Application ID first (Existing User workflow)
        if request.application_id:
            application = db.query(LoanApplication).filter(LoanApplication.id == request.application_id).first()
            if application:
                prev_info = {
                    "full_name": application.full_name,
                    "email": application.email,
                    "phone": application.phone,
                    "annual_income": application.annual_income,
                    "credit_score": application.credit_score,
                    "loan_amount": application.loan_amount,
                    "loan_term_months": application.loan_term_months,
                    "num_dependents": application.num_dependents,
                    "employment_status": application.employment_status
                }
                ai_response = (
                    f"Here is your saved application information:\n"
                    f"Name: {application.full_name}\nEmail: {application.email}\nPhone: {application.phone}\n"
                    f"Annual Income: ₹{application.annual_income:,}\nCredit Score: {application.credit_score}\nLoan Amount: ₹{application.loan_amount:,}\n"
                    f"Loan Term: {application.loan_term_months} months\nDependents: {application.num_dependents}\nEmployment Status: {application.employment_status}\n"
                    "\nDo you want to continue with the same information or update it? (Reply 'Continue' or 'Update')"
                )
                if request.message.strip().lower() == "continue":
                    ai_response = "Please upload your Aadhaar Card, PAN Card, KYC documents, last 6-month bank statement, and your salary slip."
                    return {
                        "message": ai_response,
                        "action": "show_upload_buttons",
                        "application_id": application.id,
                        "collected_fields": list(prev_info.keys()),
                        "collected_values": prev_info
                    }
                elif request.message.strip().lower() == "update":
                    application = None  # Restart form questions
                else:
                    return {
                        "message": ai_response,
                        "application_id": application.id,
                        "collected_fields": list(prev_info.keys()),
                        "collected_values": prev_info
                    }
        # If no Application ID, check for user by full name (Existing User workflow)
        elif request.message and request.message.strip():
            name_query = request.message.strip()
            # FIX 3: Detect if user typed an Application ID instead of a name
            appid_match = re.fullmatch(r"(?:APP[-_])?(\d{4,12})", name_query, re.IGNORECASE)
            if appid_match:
                app_id_val = int(appid_match.group(1))
                application = db.query(LoanApplication).filter(LoanApplication.id == app_id_val).first()
                if application:
                    request.application_id = app_id_val
                    prev_info = {
                        "full_name": application.full_name,
                        "email": application.email,
                        "phone": application.phone,
                        "annual_income": application.annual_income,
                        "credit_score": application.credit_score,
                        "loan_amount": application.loan_amount,
                        "loan_term_months": application.loan_term_months,
                        "num_dependents": application.num_dependents,
                        "employment_status": application.employment_status
                    }
                    return {
                        "message": f"Here are your saved details for Application ID {app_id_val}. Do you want to continue or update?",
                        "application_id": app_id_val,
                        "collected_fields": list(prev_info.keys()),
                        "collected_values": prev_info,
                        "ask_continue_or_update": True
                    }

            # FIX 2: Robust name search
            clean = name_query.strip()
            if len(clean) >= 3:
                found_app = (
                    db.query(LoanApplication)
                    .filter(LoanApplication.full_name.ilike(f"%{clean}%"))
                    .order_by(LoanApplication.created_at.desc())
                    .first()
                )
            else:
                found_app = None
            if found_app:
                # Found user by name, ask for Application ID (only greet once)
                return {
                    "message": f"Welcome back, {name_query}! Please enter your Application ID to continue.",
                    "action": "ask_application_id"
                }
            else:
                # Step-by-step form flow: track answers across chat session history
                import re
                session_fields = [
                    ("full_name", "What's your full name?"),
                    ("email", "What's your email address?"),
                    ("phone", "What's your phone number?"),
                    ("annual_income", "What's your annual income (in INR)?"),
                    ("loan_amount", "What loan amount are you looking for (INR)?"),
                    ("loan_term_months", "What loan term do you want (in months)?"),
                    ("loan_purpose", "What is the purpose of your loan? (e.g., home, car, education, business, personal)"),
                    ("num_dependents", "How many dependents do you have?"),
                    ("employment_status", "What's your employment status? (salaried, self-employed, business)"),
                    ("credit_score", "What's your current credit score?"),
                ]

                email_regex = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
                phone_regex = r"^(\d{10})$"
                income_regex = r"^\d{4,9}$"
                credit_regex = r"^\d{3}$"
                loan_regex = r"^loan[:\s]*(\d{4,9})$"
                term_regex = r"^term[:\s]*(\d{1,3})$"
                dep_regex = r"^\d{1,2}$"
                emp_regex = r"^(salaried|self-employed|business)$"

                # FIX 1: Scoped chat history (per application or user)
                collected = {}
                if request.application_id:
                    chat_history = (
                        db.query(ChatSession)
                        .filter(ChatSession.application_id == request.application_id)
                        .order_by(ChatSession.created_at.desc())
                        .limit(50)
                        .all()
                    )
                elif user_id:
                    chat_history = (
                        db.query(ChatSession)
                        .filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
                        .order_by(ChatSession.created_at.desc())
                        .limit(50)
                        .all()
                    )
                else:
                    chat_history = []

                all_user_messages = []
                for session in reversed(chat_history):
                    try:
                        messages = json.loads(session.messages or "[]")
                        for m in messages:
                            if m.get("role") == "user" and "content" in m:
                                all_user_messages.append(m["content"])
                    except:
                        pass
                # Always include the current user message as the last one
                all_user_messages.append(name_query)
                for val in all_user_messages:
                    extracted = _extract_data_from_message(val)
                    for k, v in extracted.items():
                        if k not in collected or collected[k] != v:
                            collected[k] = v

                # Ask only the next missing field
                for key, question in session_fields:
                    if key not in collected or not collected[key]:
                        # Persist this turn so future requests can reconstruct session state
                        try:
                            chat_session = ChatSession(
                                user_id=user_id,
                                application_id=request.application_id,
                                messages=json.dumps([
                                    {"role": "user", "content": request.message},
                                    {"role": "assistant", "content": question}
                                ]),
                                meta={"collected_values": collected} if collected else None
                            )
                            db.add(chat_session)
                            db.commit()
                        except Exception:
                            logger.debug("Failed to persist interim chat session; continuing")
                        return {
                            "message": question,
                            "action": f"ask_{key}",
                            "collected_fields": list(collected.keys()) if collected else [],
                            "collected_values": collected if collected else {}
                        }
                # If all fields are collected, prompt for document upload
                try:
                    chat_session = ChatSession(
                        user_id=user_id,
                        application_id=request.application_id,
                        messages=json.dumps([
                            {"role": "user", "content": request.message},
                            {"role": "assistant", "content": "Now please upload your Aadhaar Card, PAN Card, KYC documents, last 6-month bank statement, and your salary slip."}
                        ]),
                        meta={"collected_values": collected} if collected else None
                    )
                    db.add(chat_session)
                    db.commit()
                except Exception:
                    logger.debug("Failed to persist interim complete-session; continuing")
                return {
                    "message": "Now please upload your Aadhaar Card, PAN Card, KYC documents, last 6-month bank statement, and your salary slip.",
                    "action": "show_upload_buttons",
                    "collected_fields": list(collected.keys()) if collected else [],
                    "collected_values": collected if collected else {}
                }
        # If neither Application ID nor name found, start New User workflow
        # ...existing code for conversation analysis and question flow...

        # Analyze user message and determine next steps
        conversation_context = _analyze_conversation(request.message, application, db=db, user_id=user_id)

        # Choose provider per request if provided; else fall back to default
        svc = get_llm_service(provider_override=request.provider) if request.provider else llm_service

        # Generate AI response based on conversation context (include DB/user for multi-turn history)
        ai_response = _generate_conversational_response(request.message, conversation_context, application, svc, db=db, user_id=user_id)


        # Handle specific actions based on conversation context
        action_result = None
        if conversation_context.get("action") == "collect_details":
            action_result = await _collect_applicant_details(request.message, application, db, user_id)
            # If all required fields are collected, save as new application and show document upload prompt
            if action_result and action_result.get("application_created") and application is None:
                # Find latest application for user
                latest_app = db.query(LoanApplication).filter(LoanApplication.user_id == user_id).order_by(LoanApplication.created_at.desc()).first()
                if latest_app:
                    ai_response = "Now please upload your Aadhaar Card, PAN Card, KYC documents, last 6-month bank statement, and your salary slip."
                    return {
                        "message": ai_response,
                        "action": "show_upload_buttons",
                        "application_id": latest_app.id,
                        "collected_fields": action_result.get("collected_fields", []),
                        "collected_values": action_result.get("collected_values", {})
                    }
        elif conversation_context.get("action") == "predict_eligibility":
            action_result = await _perform_eligibility_check(application, db)
        elif conversation_context.get("action") == "generate_report":
            action_result = await _generate_loan_report(application, db)
        elif conversation_context.get("action") == "send_otp":
            action_result = await _send_verification_otp(application, db)

        # Auto-trigger eligibility check if all required fields are now collected
        if not action_result and application and _has_required_fields(application) and conversation_context.get("intent") == "providing_info":
            # All fields collected - automatically run eligibility check
            action_result = await _perform_eligibility_check(application, db)
            # Update response to reflect the automatic check
            if "Perfect! I have all the key information" in ai_response:
                ai_response = ai_response.replace(
                    "This will just take a moment...",
                    "Based on the information you've shared, here's what I found:"
                )

        # Save chat message to database
        # Store meta so we can reconstruct collected fields across turns before application exists
        assistant_meta = {}
        if action_result and isinstance(action_result, dict):
            if "collected_fields" in action_result:
                assistant_meta["collected_fields"] = action_result["collected_fields"]
            if "application_created" in action_result:
                assistant_meta["application_created"] = action_result["application_created"]
            if "application_id" in action_result:
                assistant_meta["application_id"] = action_result.get("application_id")
        # Record the last asked question key (if any)
        if conversation_context.get("next_question_key"):
            assistant_meta["last_question"] = conversation_context.get("next_question_key")

        # Aggregate collected values for pre-application persistence
        aggregated_meta = None
        try:
            aggregated_meta = {"collected_values": {}}
            # Merge any extracted values from this turn
            if isinstance(conversation_context.get("collected_data"), dict):
                for k, v in conversation_context["collected_data"].items():
                    aggregated_meta["collected_values"][k] = v
            # Also mark keys from action_result if present
            if assistant_meta.get("collected_fields"):
                for k in assistant_meta["collected_fields"]:
                    aggregated_meta["collected_values"].setdefault(k, True)
        except Exception:
            aggregated_meta = None

        chat_session = ChatSession(
            user_id=user_id,
            application_id=request.application_id,
            messages=json.dumps([
                {"role": "user", "content": request.message},
                {"role": "assistant", "content": ai_response, "meta": assistant_meta or None}
            ]),
            meta=aggregated_meta
        )
        db.add(chat_session)
        db.commit()

        # Prepare response
        suggestions_text = _generate_suggestions(request.message, conversation_context)
        # Build structured suggestions (id + label)
        structured = _to_structured_suggestions(suggestions_text, conversation_context)

        response_data = {
            "message": ai_response,
            "application_id": request.application_id,
            "suggested_next_steps": suggestions_text,
            "suggestions": structured,
        }

        # Add action results if any
        if action_result:
            response_data.update(action_result)

        # Add UI action hint to open form when basics are present
        try:
            should_open_form = False
            intent = conversation_context.get("intent")
            missing = conversation_context.get("missing_fields", [])

            # If we have an application and no missing fields, prompt to open form
            if application and intent in {"providing_info", "loan_inquiry"} and not missing:
                should_open_form = True

            # If no application yet, but the message contains key basics, also suggest form
            collected = conversation_context.get("collected_data", {})
            basics = ["annual_income", "credit_score", "loan_amount"]
            if not application and intent in {"providing_info", "loan_inquiry"} and all(k in collected and collected[k] for k in basics):
                should_open_form = True

            if should_open_form:
                response_data["action"] = "open_form"
        except Exception as e:
            logger.warning(f"Failed to compute action hint: {e}")

        # Echo collected fields/values this turn for UI awareness
        try:
            if isinstance(conversation_context.get("collected_data"), dict) and conversation_context["collected_data"]:
                response_data["collected_fields"] = list(conversation_context["collected_data"].keys())
                response_data["collected_values"] = conversation_context["collected_data"]
        except Exception:
            pass

        logger.info(f"Chat message processed for application {request.application_id}")
        return response_data

    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process message"
        )


@router.post("/open", response_model=ChatResponse)
async def open_chat(request: ChatRequest, http_req: Request, db: Session = Depends(get_db)):
    """
    Open-ended chat endpoint: accept any question and let the LLM respond freely.

    The assistant is encouraged to ask clarifying follow-up questions when helpful.
    This endpoint does not trigger application-specific actions; it's for general Q&A and follow-ups.
    """
    try:
        svc = get_llm_service(provider_override=request.provider) if request.provider else llm_service

        # Identify current user (optional) for open chat history
        user_id = None
        try:
            auth = http_req.headers.get("authorization") or http_req.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
                decoded = decode_token(token)
                if decoded and decoded.get("email"):
                    user = db.query(User).filter(User.email == decoded["email"]).first()
                    if user:
                        user_id = user.id
        except Exception:
            pass

        # Construct an explicit system prompt that encourages the assistant to ask clarifying
        # questions and interact with the user conversationally.
        system_prompt = (
            "You are a helpful, concise AI assistant. Answer the user's question clearly. "
            "If the user's question lacks necessary details, ask one concise clarifying question. "
            "Do not take actions on behalf of the user; simply ask or answer. Keep replies friendly and short."
        )

        # Pass lightweight application context only if provided
        context_data = None
        if request.application_id:
            application = db.query(LoanApplication).filter(LoanApplication.id == request.application_id).first()
            if application:
                context_data = {
                    "full_name": application.full_name,
                    "loan_amount": application.loan_amount,
                    "status": application.approval_status,
                }

        # Use the LLM service to generate response using system prompt + user message
        if not svc.health():
            # If LLM unhealthy, return fallback
            reply = "Sorry, the AI service is currently unavailable. Please try again later."
        else:
            # Attempt to include system prompt if the provider supports it
            # Include recent conversation history as part of context when available
            history = []
            try:
                if db is not None:
                    history = _get_conversation_history(db, application, user_id, limit=8)
            except Exception:
                history = []

            merged_context = (context_data or {}).copy() if context_data else {}
            if history:
                merged_context["history"] = history

            try:
                # Some services accept (prompt, context) shapes; the service implementations handle it
                reply = svc.generate(request.message, context=merged_context or {}, system_prompt=system_prompt)
            except TypeError:
                # Fallback for services that don't support system_prompt parameter
                combined = f"{system_prompt}\n\nUser: {request.message}"
                reply = svc.generate(combined, context=merged_context or {})

        # Heuristic: if reply ends with a question mark or contains a short question, mark ask_followup
        ask_followup = False
        try:
            clean = (reply or "").strip()
            if clean.endswith("?") or "?" in clean.splitlines()[:2]:
                ask_followup = True
        except Exception:
            ask_followup = False

        # Persist chat session minimally for history
        try:
            chat_session = ChatSession(
                user_id=user_id,
                application_id=request.application_id,
                messages=json.dumps([
                    {"role": "user", "content": request.message},
                    {"role": "assistant", "content": reply}
                ])
            )
            db.add(chat_session)
            db.commit()
        except Exception:
            logger.debug("Failed to persist open chat session; continuing")

        return {
            "message": reply,
            "application_id": request.application_id,
            "ask_followup": ask_followup,
        }

    except Exception as e:
        logger.error(f"Open chat error: {e}")
        raise HTTPException(status_code=500, detail="Open chat failed")


@router.get("/health")
async def check_chat_health():
    """Check if LLM service is available"""
    is_healthy = llm_service.health()
    provider = os.getenv("LLM_PROVIDER", "ollama")
    model = os.getenv(f"{provider.upper()}_MODEL", "default")
    
    # Get cache stats if available
    cache_stats = {}
    if hasattr(llm_service, 'get_cache_stats'):
        cache_stats = llm_service.get_cache_stats()
    
    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "service": provider,
        "model": model,
        "cache": cache_stats
    }


@router.post("/admin/clear-cache")
async def clear_llm_cache():
    """Clear LLM response cache (admin endpoint)"""
    if hasattr(llm_service, 'clear_cache'):
        llm_service.clear_cache()
        return {"message": "Cache cleared successfully"}
    else:
        return {"message": "Caching not available for current LLM service"}


def _analyze_conversation(message: str, application, db: Session = None, user_id: int | None = None) -> dict:
    """
    Analyze user message to determine conversation context and next actions

    Returns:
        dict: Context information including detected intent and required actions
    """
    message_lower = message.lower()

    context = {
        "intent": "general_inquiry",
        "action": None,
        "collected_data": {},
        "missing_fields": []
    }

    # Check for greetings and introductions
    if any(word in message_lower for word in ["hello", "hi", "hey", "start", "begin"]):
        context["intent"] = "greeting"
        context["action"] = "collect_details"

    # Check for personal information sharing
    elif any(word in message_lower for word in ["name", "age", "income", "salary"]):
        context["intent"] = "providing_info"
        context["action"] = "collect_details"

    # Detect likely "name-only" message (e.g., "Nishtha Hooda") and treat as providing info
    # Only when: 1) 1-3 words, 2) All words Title Case, 3) No common loan keywords
    elif (
        (lambda s: (
            1 <= len(s.split()) <= 3 and
            not any(w.lower() in {"loan","apply","application","amount","borrow","credit","score","income","salary"} for w in s.split()) and
            all(w[0].isupper() and any(c.islower() for c in w[1:]) for w in s.split() if w and w[0].isalpha()) and
            re.fullmatch(r"^[A-Za-z][A-Za-z\-'\.]+(?:\s+[A-Za-z][A-Za-z\-'\.]+){0,2}$", s)
        ))(message.strip())
    ):
        context["intent"] = "providing_info"
        context["action"] = "collect_details"

    # Check for loan amount inquiries
    elif any(word in message_lower for word in ["loan", "amount", "borrow", "need money"]):
        context["intent"] = "loan_inquiry"
        context["action"] = "collect_details"

    # Check for document upload mentions
    elif any(word in message_lower for word in ["document", "upload", "file", "bank statement", "id"]):
        context["intent"] = "document_upload"
        context["action"] = "request_document"

    # Check for eligibility check requests
    elif any(word in message_lower for word in ["eligible", "check", "qualify", "eligibility"]):
        context["intent"] = "eligibility_check"
        if application and _has_required_fields(application):
            context["action"] = "predict_eligibility"
        else:
            context["action"] = "collect_details"

    # Check for OTP verification requests
    elif any(word in message_lower for word in ["verify", "otp", "code", "email"]):
        context["intent"] = "verification"
        context["action"] = "send_otp"

    # Extract potential data from message
    context["collected_data"] = _extract_data_from_message(message)

    # If message is numeric or unit-based without keywords, infer based on last assistant question
    if db is not None:
        # Prefer explicit last_question key from previous assistant meta
        last_q_key = _get_last_assistant_question_key(db, application, user_id)
        msg = message.strip().lower()
        digits = re.sub(r"\D", "", msg)
        unit_match = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)", msg)
        inferred = {}
        if last_q_key:
            if last_q_key == "annual_income":
                if unit_match:
                    amt = float(unit_match.group(1)); mult = 100000 if 'lakh' in unit_match.group(2) else 10000000
                    inferred = {"annual_income": int(round(amt * mult))}
                elif digits and 4 <= len(digits) <= 8:
                    inferred = {"annual_income": int(digits)}
            elif last_q_key == "loan_amount":
                if unit_match:
                    amt = float(unit_match.group(1)); mult = 100000 if 'lakh' in unit_match.group(2) else 10000000
                    inferred = {"loan_amount": int(round(amt * mult))}
                elif digits and 4 <= len(digits) <= 8:
                    inferred = {"loan_amount": int(digits)}
            elif last_q_key == "credit_score":
                if digits and len(digits) == 3 and 300 <= int(digits) <= 900:
                    inferred = {"credit_score": int(digits)}
        # Fallback to text-based detection if nothing inferred via key
        if not inferred:
            inferred = _infer_from_last_question(message, _get_last_assistant_prompt(db, application, user_id))
        if inferred:
            context["collected_data"].update(inferred)

    # If we have a logged-in user and no application yet, merge previously collected fields/values
    if user_id and not application and db is not None:
        try:
            recent = (
                db.query(ChatSession)
                .filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
                .order_by(ChatSession.created_at.desc())
                .limit(10)
                .all()
            )
            previously_collected = set()
            previously_values = {}
            for s in recent:
                try:
                    msgs = json.loads(s.messages) if isinstance(s.messages, str) else (s.messages or [])
                    for m in msgs:
                        meta = (m or {}).get("meta")
                        if isinstance(meta, dict) and "collected_fields" in meta and isinstance(meta["collected_fields"], list):
                            previously_collected.update([str(k) for k in meta["collected_fields"]])
                    # Also read aggregated meta.collected_values if available
                    if s.meta and isinstance(s.meta, dict):
                        cv = s.meta.get("collected_values")
                        if isinstance(cv, dict):
                            previously_values.update(cv)
                except Exception:
                    continue
            # Promote previously collected keys so we don't re-ask
            for key in previously_collected:
                context["collected_data"].setdefault(key, True)
            # Merge previously known values (do not overwrite current turn)
            for k, v in previously_values.items():
                context["collected_data"].setdefault(k, v)
        except Exception:
            pass
    # If user provided structured fields (e.g., an email), treat as providing info
    if not context.get("action") and context["collected_data"]:
        context["intent"] = "providing_info"
        context["action"] = "collect_details"

    # Determine missing fields if we have an application
    if application:
        context["missing_fields"] = _get_missing_fields(application)

    return context


def _get_last_assistant_prompt(db: Session, application, user_id: int | None) -> str:
    """Fetch the most recent assistant message content for this application or user (pre-application)."""
    try:
        q = db.query(ChatSession)
        if application and getattr(application, 'id', None):
            q = q.filter(ChatSession.application_id == application.id)
        elif user_id:
            q = q.filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
        else:
            return ""
        sess = q.order_by(ChatSession.created_at.desc()).first()
        if not sess:
            return ""
        msgs = json.loads(sess.messages) if isinstance(sess.messages, str) else (sess.messages or [])
        # Return last assistant content in that session
        for m in reversed(msgs):
            if (m or {}).get('role') == 'assistant':
                return str((m or {}).get('content') or "")
    except Exception:
        return ""
    return ""


def _infer_from_last_question(user_message: str, assistant_prompt: str) -> dict:
    """Infer which field the user's bare message likely answers, based on last assistant question."""
    if not assistant_prompt:
        return {}
    msg = user_message.strip().lower()
    # Detect plain numbers or lakh/crore units
    unit_match = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)", msg)
    digits = re.sub(r"\D", "", msg)
    # Annual income
    if "annual income" in assistant_prompt.lower():
        if unit_match:
            amt = float(unit_match.group(1))
            mult = 100000 if 'lakh' in unit_match.group(2) else 10000000
            return {"annual_income": int(round(amt * mult))}
        if digits and 4 <= len(digits) <= 8:
            return {"annual_income": int(digits)}
    # Loan amount
    if "loan amount" in assistant_prompt.lower():
        if unit_match:
            amt = float(unit_match.group(1))
            mult = 100000 if 'lakh' in unit_match.group(2) else 10000000
            return {"loan_amount": int(round(amt * mult))}
        if digits and 4 <= len(digits) <= 8:
            return {"loan_amount": int(digits)}
    # Credit score
    if "credit score" in assistant_prompt.lower():
        if digits and len(digits) == 3:
            val = int(digits)
            if 300 <= val <= 900:
                return {"credit_score": val}
    return {}


def _get_last_assistant_question_key(db: Session, application, user_id: int | None) -> str:
    """Fetch the last assistant 'last_question' key stored in meta from the most recent session."""
    try:
        q = db.query(ChatSession)
        if application and getattr(application, 'id', None):
            q = q.filter(ChatSession.application_id == application.id)
        elif user_id:
            q = q.filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
        else:
            return ""
        sess = q.order_by(ChatSession.created_at.desc()).first()
        if not sess:
            return ""
        msgs = json.loads(sess.messages) if isinstance(sess.messages, str) else (sess.messages or [])
        for m in reversed(msgs):
            if (m or {}).get('role') == 'assistant':
                meta = (m or {}).get('meta') or {}
                if isinstance(meta, dict) and meta.get('last_question'):
                    return str(meta.get('last_question'))
    except Exception:
        return ""
    return ""


def _get_conversation_history(db: Session, application, user_id: int | None, limit: int = 6) -> list:
    """Return the last `limit` messages (role/content) for this application or user.

    Messages are returned in chronological order (oldest first).
    """
    history = []
    try:
        q = db.query(ChatSession)
        if application and getattr(application, 'id', None):
            q = q.filter(ChatSession.application_id == application.id)
        elif user_id:
            q = q.filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
        else:
            return []

        sessions = q.order_by(ChatSession.created_at.desc()).limit(10).all()
        # Collect messages from most recent sessions, then take last `limit` messages overall
        msgs = []
        for s in sessions:
            try:
                mlist = json.loads(s.messages) if isinstance(s.messages, str) else (s.messages or [])
                for m in mlist:
                    if isinstance(m, dict) and m.get('role') and m.get('content'):
                        msgs.append({'role': m['role'], 'content': m['content']})
            except Exception:
                continue

        # msgs currently newest-first across sessions; reverse to chronological
        msgs = list(reversed(msgs))
        # Return the last `limit` messages
        if len(msgs) <= limit:
            history = msgs
        else:
            history = msgs[-limit:]
    except Exception:
        return []
    return history


def _generate_conversational_response(message: str, context: dict, application, svc, db: Session = None, user_id: int | None = None) -> str:
    """
    Generate a conversational AI response based on context
    """
    intent = context.get("intent")
    action = context.get("action")

    if intent == "greeting":
        response = "Hello! I'm your AI loan assistant. I'll help you apply for a loan and check your eligibility. To get started, could you please tell me your full name?"

    elif intent == "providing_info":
        collected_data = context.get("collected_data", {})
        # Acknowledge what was shared
        data_summary = []
        for k, v in collected_data.items():
            if isinstance(v, bool):
                continue
            if k == "annual_income":
                data_summary.append(f"annual income of ₹{v:,}")
            elif k == "loan_amount":
                data_summary.append(f"loan amount of ₹{v:,}")
            elif k == "credit_score":
                data_summary.append(f"credit score of {v}")
            elif k == "employment_status":
                data_summary.append(f"employment as {v}")
            elif k == "num_dependents":
                data_summary.append(f"{v} dependent{'s' if v != 1 else ''}")
            else:
                data_summary.append(f"{k}: {v}")
        if data_summary:
            response = f"Thank you for sharing that information. I've noted your {', '.join(data_summary)}. "
        else:
            response = "Thank you for sharing that information. "

        # Always ask for the next missing field, one by one
        required_order = [
            ("full_name", "What's your full name?"),
            ("email", "What's your email address?"),
            ("annual_income", "What's your annual income (in INR)?"),
            ("credit_score", "What's your current credit score?"),
            ("loan_amount", "What loan amount are you looking for (INR)?"),
            ("employment_status", "What's your employment status? Are you salaried, self-employed, or in business?"),
            ("num_dependents", "How many dependents do you have?")
        ]
        missing = context.get("missing_fields", [])
        collected = context.get("collected_data", {}) or {}
        next_field = None
        for key, question in required_order:
            # If this field is missing, ask for it next
            display_map = {
                "annual_income": "annual income",
                "credit_score": "credit score",
                "loan_amount": "loan amount",
                "num_dependents": "number of dependents",
                "employment_status": "employment status",
                "full_name": "full name",
                "email": "email address"
            }
            display_name = display_map.get(key, key)
            if display_name in missing:
                next_field = key
                response += f" {question}"
                context["next_question_key"] = key
                break

        # If all fields are collected, prompt for document upload
        if not missing:
            response += "Perfect! I have all the key information I need. Please upload your bank statement or ID proof to continue with document verification."
            context["action"] = "request_document"

    elif intent == "loan_inquiry":
        response = "I'd be happy to help you with your loan application! To determine the best loan amount and terms for you, I need some basic information. Let's start with your annual income - this helps me understand what loan amounts might work for your situation."

    elif intent == "document_upload":
        response = "Perfect! Document verification is an important step in the loan process. Please upload your bank statement or ID proof. You can drag and drop the file or click to browse. I'll analyze it to verify your information and help complete your application."

    elif intent == "eligibility_check":
        if action == "predict_eligibility":
            response = "Excellent! I have enough information to check your loan eligibility. Let me analyze your application and see what options are available. This will just take a moment..."
        else:
            missing = context.get("missing_fields", [])
            if missing:
                next_field = missing[0]
                response = f"I need a bit more information to check your eligibility. "
                if next_field == "annual income":
                    response += "Could you tell me your annual income? This helps me determine suitable loan amounts."
                elif next_field == "credit score":
                    response += "What's your current credit score? This is important for assessing your eligibility."
                elif next_field == "loan amount":
                    response += "What loan amount are you interested in applying for?"
                elif next_field == "number of dependents":
                    response += "How many dependents do you have? This affects your financial assessment."
                elif next_field == "employment status":
                    response += "What's your employment status? Are you salaried, self-employed, or in business?"
                else:
                    response += f"Could you please provide your {next_field}?"

    elif intent == "verification":
        response = "I'll send a verification code to your email. Please check your inbox and enter the 6-digit code when prompted. This helps ensure your application is secure."

    else:
        # Use LLM for general responses
        context_data = None
        if application:
            context_data = {
                "full_name": application.full_name,
                "loan_amount": application.loan_amount,
                "status": application.approval_status
            }
        # Graceful fallback if LLM isn't available
        if not svc.health():
            response = _fallback_single_question(context, application)
        else:
            # Include recent conversation history as part of context if db is available
            history = []
            try:
                if db is not None:
                    history = _get_conversation_history(db, application, user_id, limit=8)
            except Exception:
                history = []

            # Merge context_data with history
            merged_context = (context_data or {}).copy() if context_data else {}
            if history:
                merged_context["history"] = history

            response = svc.generate(message, merged_context)
            # Guard against provider errors with a helpful fallback
            if not response or response.strip() == "" or response.lower().startswith("sorry, i'm having trouble responding right now"):
                response = _fallback_single_question(context, application)

    return response


def _fallback_single_question(context: dict, application) -> str:
    """Produce a concise, one-question fallback based on what's missing."""
    # Handle general inquiry briefly, then ask the next field
    intent = context.get("intent")
    prefix = ""
    if intent == "general_inquiry":
        prefix = (
            "I can answer your loan questions and help you apply. "
        )

    # Determine next missing field in preferred order
    order = [
        ("full_name", "What's your full name?"),
        ("email", "What's your email address?"),
        ("annual_income", "What's your annual income (in INR)?"),
        ("credit_score", "What's your current credit score?"),
        ("loan_amount", "What loan amount are you looking for (INR)?"),
        ("employment_status", "What's your employment status (salaried, self-employed, business)?"),
        ("num_dependents", "How many dependents do you have?"),
    ]

    collected = context.get("collected_data", {}) or {}
    missing_fields = []
    if application:
        # Use application-based missing fields if available
        missing_fields = _get_missing_fields(application)
        # Convert display names back to keys for matching
        display_to_key = {
            'annual income': 'annual_income',
            'credit score': 'credit_score',
            'loan amount': 'loan_amount',
            'loan term (months)': 'loan_term_months',
            'number of dependents': 'num_dependents',
            'employment status': 'employment_status',
        }
        missing_keys = [display_to_key.get(m, m) for m in missing_fields]
    else:
        missing_keys = [k for k, _ in order if not collected.get(k)]

    # Heuristic: if the current message provided an email but no name, skip asking name now
    if not application:
        collected_now = context.get("collected_data", {}) or {}
        if collected_now.get("email") and not collected_now.get("full_name"):
            missing_keys = [k for k in missing_keys if k != "full_name"]

    for key, question in order:
        if key in missing_keys:
            return f"{prefix}{question}"

    # If nothing obvious is missing, default to a simple next step
    return f"{prefix}How can I help you proceed with your application?"


async def _collect_applicant_details(message: str, application, db: Session, user_id: int | None = None):
    """
    Extract and save applicant details from conversation
    """
    extracted_data = _extract_data_from_message(message)

    if not extracted_data:
        return None

    # Create or update application
    if not application:
        # Need basic info to create application
        if "email" in extracted_data:
            # Merge previously collected values for this user (pre-application)
            merged_values = {}
            try:
                if user_id:
                    recent = (
                        db.query(ChatSession)
                        .filter(ChatSession.user_id == user_id, ChatSession.application_id == None)  # noqa: E711
                        .order_by(ChatSession.created_at.desc())
                        .limit(15)
                        .all()
                    )
                    for s in reversed(recent):  # older first, then newer overrides
                        if s.meta and isinstance(s.meta, dict):
                            cv = s.meta.get("collected_values")
                            if isinstance(cv, dict):
                                merged_values.update(cv)
            except Exception:
                pass

            # Latest extraction should win over historical values
            candidate = {**merged_values, **extracted_data}

            # Create new application with available data
            application = LoanApplication(
                user_id=user_id,
                full_name=candidate.get("full_name", ""),
                email=candidate.get("email", ""),
                phone=candidate.get("phone", ""),
                annual_income=candidate.get("annual_income", 0),
                credit_score=candidate.get("credit_score", 0),
                loan_amount=candidate.get("loan_amount", 0),
                loan_term_months=candidate.get("loan_term_months", 12),
                num_dependents=candidate.get("num_dependents", 0),
                employment_status=candidate.get("employment_status", "unemployed")
            )
            db.add(application)
            db.commit()
            db.refresh(application)
        else:
            # Return partial fields so frontend can persist progress until email arrives
            return {
                "application_created": False,
                "application_id": None,
                "collected_fields": list(extracted_data.keys()),
                "collected_values": extracted_data
            }
    else:
        # Update existing application: always overwrite with new user data
        for field, value in extracted_data.items():
            if hasattr(application, field):
                setattr(application, field, value)
        db.commit()

    return {
        "application_created": application is not None,
        "application_id": application.id if application else None,
        "collected_fields": list(extracted_data.keys()),
        "collected_values": extracted_data
    }


async def _perform_eligibility_check(application, db: Session):
    """
    Perform loan eligibility check using ML model
    """
    if not application:
        return {"error": "No application found"}

    # Prepare data for prediction
    applicant_data = {
        "annual_income": application.annual_income,
        "credit_score": application.credit_score,
        "loan_amount": application.loan_amount,
        "loan_term_months": application.loan_term_months,
        "num_dependents": application.num_dependents,
        "employment_status": application.employment_status
    }

    # Get prediction
    prediction = ml_service.predict_eligibility(applicant_data)

    # Update application
    application.eligibility_score = prediction["eligibility_score"]
    application.eligibility_status = prediction["eligibility_status"]
    db.commit()

    # Send notification email
    email_service.send_loan_result_notification(
        application.email,
        application.full_name,
        prediction["eligibility_score"],
        prediction["eligibility_status"]
    )

    score_percentage = round(prediction["eligibility_score"] * 100, 1)
    status_text = "eligible" if prediction["eligibility_status"] == "eligible" else "not eligible"

    return {
        "eligibility_score": prediction["eligibility_score"],
        "eligibility_status": prediction["eligibility_status"],
        "score_percentage": score_percentage,
        "status_text": status_text,
        "recommendations": prediction["recommendations"],
        "notification_sent": True
    }


async def _generate_loan_report(application, db: Session):
    """
    Generate PDF report for the loan application
    """
    if not application:
        return {"error": "No application found"}

    # Prepare application data
    app_data = {
        "id": application.id,
        "full_name": application.full_name,
        "email": application.email,
        "phone": application.phone,
        "annual_income": application.annual_income,
        "credit_score": application.credit_score,
        "loan_amount": application.loan_amount,
        "loan_term_months": application.loan_term_months,
        "num_dependents": application.num_dependents,
        "employment_status": application.employment_status,
        "eligibility_score": application.eligibility_score,
        "eligibility_status": application.eligibility_status,
        "approval_status": application.approval_status,
        "document_verified": application.document_verified,
        "manager_notes": application.manager_notes
    }

    # Generate report
    report_path = report_service.generate_report(app_data)

    # Update application
    application.report_path = report_path
    db.commit()

    return {
        "report_generated": True,
        "report_path": report_path,
        "report_url": f"/static/reports/{report_path.split('/')[-1]}"
    }


async def _send_verification_otp(application, db: Session):
    """
    Send OTP verification email
    """
    if not application or not application.email:
        return {"error": "No email address available"}

    # Generate and send OTP
    otp_code = email_service.generate_otp()
    success = email_service.send_otp_email(application.email, otp_code)

    return {
        "otp_sent": success,
        "email": application.email
    }


def _extract_data_from_message(message: str) -> dict:
    """
    Extract applicant data from natural language message
    """
    extracted = {}
    message_lower = message.lower()
    message_stripped = message.strip()
    import re

    # Email address
    email_match = re.search(r'([a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+)', message)
    if email_match:
        extracted["email"] = email_match.group(1)
    # Fallback: treat a plain email-like string as email
    elif re.fullmatch(r'[a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+', message_stripped):
        extracted["email"] = message_stripped

    # Name phrases: "my name is X", "I'm X", "I am X", "This is X"
    name_phrase = re.search(r"(?:my\s+name\s+is|i\s*am|i'm|this\s+is)\s+([A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+){0,3})", message_lower, re.IGNORECASE)
    if name_phrase:
        name_val = name_phrase.group(1).strip()
        extracted["full_name"] = " ".join([p.capitalize() for p in name_val.split()])

    employment_statuses = {"salaried": "salaried", "self-employed": "self-employed", "business": "business"}
    if message_stripped.lower() in employment_statuses:
        extracted["employment_status"] = employment_statuses[message_stripped.lower()]
    if "full_name" not in extracted:
        words = message_stripped.split()
        loan_keywords = {"loan", "apply", "application", "amount", "borrow", "credit", "score", "income", "salary", "salaried", "self-employed", "business"}
        if (
            1 <= len(words) <= 3
            and not any(w.lower() in loan_keywords for w in words)
            and all(w[0].isupper() and any(c.islower() for c in w[1:]) for w in words if w and w[0].isalpha())
            and re.fullmatch(r"^[A-Za-z][A-Za-z\-'.]+(?:\s+[A-Za-z][A-Za-z\-'.]+){0,2}$", message_stripped)
        ):
            extracted["full_name"] = " ".join([p[0].upper() + p[1:] if len(p) > 1 else p.upper() for p in words])

    # Income patterns
    unit_income = re.search(r'(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)', message_lower)
    if unit_income:
        amount = float(unit_income.group(1))
        unit = unit_income.group(2)
        multiplier = 100000 if 'lakh' in unit else 10000000
        extracted["annual_income"] = int(round(amount * multiplier))
    else:
        income_match = re.search(r'income.*?(\d{4,8})|salary.*?(\d{4,8})|earn.*?(\d{4,8})', message_lower)
        found_income = False
        if income_match:
            for group in income_match.groups():
                if group and len(group) >= 4:
                    extracted["annual_income"] = int(group)
                    found_income = True
                    break
        # Fallback: treat a plain 5-8 digit string as income if not already matched as loan amount
        if not found_income and "annual_income" not in extracted:
            plain_income = re.fullmatch(r"\d{5,8}", message_stripped)
            if plain_income and ("loan_amount" not in extracted or int(message_stripped) != extracted["loan_amount"]):
                extracted["annual_income"] = int(message_stripped)

    # Loan amount patterns
    unit_loan = re.search(r'(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores)', message_lower)
    if unit_loan and "loan_amount" not in extracted:
        amount = float(unit_loan.group(1))
        unit = unit_loan.group(2)
        multiplier = 100000 if 'lakh' in unit else 10000000
        extracted["loan_amount"] = int(round(amount * multiplier))
    else:
        loan_match = re.search(r'loan.*?(\d{4,8})|borrow.*?(\d{4,8})|need.*?(\d{4,8})', message_lower)
        found = False
        if loan_match:
            for group in loan_match.groups():
                if group and len(group) >= 4:
                    extracted["loan_amount"] = int(group)
                    found = True
                    break
        # If not found, treat a plain 5-8 digit number as loan amount (if not already matched as income)
        if not found and "loan_amount" not in extracted:
            plain_num = re.fullmatch(r"\d{5,8}", message_stripped)
            if plain_num and ("annual_income" not in extracted or int(message_stripped) != extracted["annual_income"]):
                extracted["loan_amount"] = int(message_stripped)

    # Credit score patterns
    credit_match = re.search(r'credit.*?(\d{3})|score.*?(\d{3})', message_lower)
    if credit_match:
        for group in credit_match.groups():
            if group and 300 <= int(group) <= 850:
                extracted["credit_score"] = int(group)
                break

    # Phone number
    phone_match = re.search(r'(\d{10})', message)
    if phone_match:
        extracted["phone"] = phone_match.group(1)
    # Fallback: treat a plain 10-digit string as phone
    elif re.fullmatch(r'\d{10}', message_stripped):
        extracted["phone"] = message_stripped

    # Employment status
    if "employed" in message_lower:
        extracted["employment_status"] = "employed"
    elif "self" in message_lower and "employed" in message_lower:
        extracted["employment_status"] = "self-employed"
    elif "unemployed" in message_lower:
        extracted["employment_status"] = "unemployed"

    # Dependents: match explicit phrase or infer from plain number if last question was about dependents
    dep_match = re.search(r'(\d+)\s*(?:dependent|kid|child)', message_lower)
    if dep_match:
        extracted["num_dependents"] = int(dep_match.group(1))
    else:
        if message_stripped.isdigit():
            num = int(message_stripped)
            if 0 <= num <= 20:
                extracted["num_dependents"] = num

    return extracted


def _has_required_fields(application) -> bool:
    """
    Check if application has all required fields for eligibility check
    """
    required_fields = [
        'annual_income', 'credit_score', 'loan_amount',
        'loan_term_months', 'num_dependents', 'employment_status'
    ]

    for field in required_fields:
        value = getattr(application, field, None)
        if value is None or (isinstance(value, (int, float)) and value == 0):
            return False

    return True


def _get_missing_fields(application) -> list:
    """
    Get list of missing required fields
    """
    required_fields = {
        'annual_income': 'annual income',
        'credit_score': 'credit score',
        'loan_amount': 'loan amount',
        'loan_term_months': 'loan term (months)',
        'num_dependents': 'number of dependents',
        'employment_status': 'employment status'
    }

    missing = []
    for field, display_name in required_fields.items():
        value = getattr(application, field, None)
        if value is None or (isinstance(value, (int, float)) and value == 0):
            missing.append(display_name)

    return missing


def _generate_suggestions(message: str, context: dict = None) -> list:
    """Generate suggested next steps based on message content and conversation context"""
    suggestions = []
    message_lower = message.lower()

    # Context-aware suggestions
    if context:
        intent = context.get("intent")
        action = context.get("action")
        missing_fields = context.get("missing_fields", [])

        if action == "collect_details" and missing_fields:
            suggestions.append(f"Provide your {missing_fields[0]}")

        if action == "predict_eligibility":
            suggestions.append("Check your loan eligibility score")

        if action == "request_document":
            suggestions.append("Upload your identity document for verification")

        if intent == "verification":
            suggestions.append("Enter the OTP code sent to your email")

    # General suggestions based on message content
    if any(word in message_lower for word in ["document", "verify", "upload"]):
        suggestions.append("Upload your identity document for verification")

    if any(word in message_lower for word in ["eligibility", "qualify", "eligible"]):
        suggestions.append("Check your loan eligibility score")

    if any(word in message_lower for word in ["interest", "rate", "term", "payment"]):
        suggestions.append("Review loan terms and calculate monthly payments")

    # Encourage proceeding to form when basics are likely captured
    if context and context.get("intent") in {"providing_info", "loan_inquiry"}:
        missing = context.get("missing_fields", [])
        if not missing:
            suggestions.insert(0, "Open detailed application form")

    if not suggestions:
        suggestions.append("Continue with the application process")

    return suggestions[:3]  # Return top 3 suggestions


def _to_structured_suggestions(suggestions: list, context: dict | None) -> list:
    """Map human-readable suggestion labels to machine-readable ids."""
    mapping = {
        "open detailed application form": "open_form",
        "check your loan eligibility score": "check_eligibility",
        "upload your identity document for verification": "upload_document",
        "enter the otp code sent to your email": "enter_otp",
        "continue with the application process": "continue",
    }
    structured = []
    for s in suggestions or []:
        label = str(s).strip()
        sid = mapping.get(label.lower())
        # For dynamic "Provide your X" suggestion
        if not sid and label.lower().startswith("provide your "):
            sid = f"provide_{label[12:].strip().replace(' ', '_')}"
        structured.append({"id": sid or "other", "label": label})
    return structured
