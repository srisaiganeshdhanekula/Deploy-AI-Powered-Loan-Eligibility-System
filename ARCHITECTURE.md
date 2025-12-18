# AI Loan System - Architecture & Integration Guide

## 📋 Complete System Overview

This document explains how all components of the AI Loan System work together to create a complete loan application platform.

---

## 🔀 Dual Application Paths: Real‑Time Calling Agent and Chat Assistant

The platform exposes two complementary ways to start and progress a loan application. Both ultimately write to the same `LoanApplication` record and flow into OCR, prediction, and reporting.

- **Real‑Time Calling Agent (voice-first)**
    - Frontend: `CallingAgentPanel.jsx` → `VoiceAgentRealtime_v2`
    - Backend (default, cloud): `/api/voice-realtime-v2/voice/stream` WebSocket using **Deepgram Nova‑2** (streaming STT), **Groq Llama 3** (LLM), and **Deepgram Aura** (streaming TTS) as implemented in `voice_realtime_v2.py`.
    - Backend (local alternative): legacy `/voice/stream` WebSocket in `voice_realtime.py` using **Vosk** (offline STT) + **Piper** (offline TTS), with health checks in `voice_health.py`.
    - Best for “call centre style” flows: continuous speech, streaming feedback and live eligibility checks, either via cloud (Deepgram+Groq) or fully local (Vosk+Piper).

- **Chat Assistant (text-first, with optional simple voice button)**
    - Frontend: `MiniChatbot.jsx` on `ApplyPage.jsx`, full `Chatbot.jsx` page if you mount it separately
    - Backend: `POST /api/chat/message` (primary chat pipeline)
    - Ideal for form-style Q&A, reviewing previous applications by ID, or following up after voice.

On the main apply screen:

- Route: `/apply`
- Component: `pages/ApplyPage.jsx`
- Layout: left column = real‑time calling agent, right column = structured application form + eligibility card, with a floating mini-chatbot in the bottom-right.

### High-level flow comparison

Chat Assistant:
```
User types → `/api/chat/message` → selected LLM (Ollama/Gemini/OpenRouter) → response
     ↳ Application may be created/updated during the chat
     ↳ User proceeds to /verification for document upload
```

Real‑Time Calling Agent:
```
User speaks → `VoiceAgentRealtime_v2` streams audio
    ↳ Vosk STT (streaming) → live transcript
    ↳ LLM (via `LLM_PROVIDER`) extracts fields + drafts reply
    ↳ Piper TTS streams audio back to the browser
    ↳ Backend upserts `LoanApplication` (once enough structured fields exist)
    ↳ Optional ML eligibility computed and surfaced to the UI
    ↳ User is guided to the form/verification step on success
```

### Frontend components and routes (high‑level)

- `src/App.js`
    - Public routes: `/`, `/auth`, `/apply`, `/verify`, `/eligibility-result`, `/help`, `/contact`
    - Manager/admin routes under `/admin/*` and `/manager`
    - Public, read‑only route for shared dashboards: `/public-dashboard/:token`

- `src/pages/ApplyPage.jsx`
    - Left panel: `CallingAgentPanel` embedding `VoiceAgentRealtime_v2` (streaming agent)
    - Right panel: `LoanApplicationForm` and `LoanResultCard`
    - Floating `MiniChatbot` anchored bottom-right; can attach to an `applicationId` once created.

- `src/components/Chatbot.jsx`
    - Full‑screen chat assistant (separate route if you mount it)
    - Calls `chatAPI.sendMessage(text, applicationId?)` and shows structured suggestions returned by the backend.

- `src/components/VoiceAgentButton.jsx`
    - Simpler, non‑streaming voice capture that posts audio to `/api/voice/voice_agent`
    - Plays back MP3 replies from `/static/voices/*.mp3` and can notify the parent when an `application_id` is linked.

- Routes in `src/App.js`
    - `/apply` → two-option page (Chatbot + Calling Agent)
    - `/apply-chat` → optional standalone Chatbot page
    - `/verify` → document upload & OCR; accepts `?applicationId=`

### Backend services and endpoints

- `POST /api/chat/message`
    - Uses `OllamaService` to generate responses
    - May create/update a `LoanApplication` based on conversation context

- `POST /api/voice/voice_agent`
    - Pipeline per turn:
        1) Whisper STT → transcript
        2) Ollama JSON extraction → { name, monthly_income, credit_score, loan_amount }
        3) Normalize values (e.g., lakh/crore/k suffixes; commas)
        4) Natural reply generation
        5) gTTS → MP3 saved under `app/static/voices`, return `audio_url`
        6) Upsert `LoanApplication` (if `application_id` provided or found by name)
        7) If all fields present → `MLModelService.predict_eligibility` and save `eligibility_score`
        8) Persist `VoiceCall` row for audit/tracking

### Data model linkage

- `LoanApplication`: canonical record for the applicant; both chat and voice paths converge here
- `VoiceCall` (new): stores each voice interaction turn, extracted fields, reply, audio URL, and optional eligibility score

Key benefit: Regardless of entry path, the same downstream processes are used (OCR, ML prediction, report generation), simplifying review and management.

### How to test each path

Chatbot
1. Log in and open `/apply`
2. Use the left panel to chat with the AI
3. Once you’ve provided sufficient info, follow the CTA to `/verification`

Calling Agent
1. Log in and open `/apply`
2. Use the right panel to press “Speak” and talk to the agent
3. When the backend links/creates an application, click the “Upload Documents” CTA to go to `/verification?applicationId=...`

## 🏗️ System Architecture

### Component Interaction Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                             │
│  (Web Browser - React Frontend @ localhost:3000)                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP/REST + JWT Auth
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (localhost:8000)                  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Request Handling & Routing                                 │   │
│  │ - JWT Authentication/Authorization                         │   │
│  │ - Request validation (Pydantic schemas)                   │   │
│  │ - Error handling & logging                                │   │
│  └────────────────────────────────────────────────────────────┘   │
│                               │                                     │
│           ┌───────────────────┼───────────────────┐                │
│           ▼                   ▼                   ▼                │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Chat Service    │  │  Voice Service  │  │  OCR Service   │   │
│  │  (Ollama LLM)    │  │  (Whisper/gTTS) │  │ (Tesseract)    │   │
│  └──────────────────┘  └─────────────────┘  └────────────────┘   │
│           │                   │                   │                │
│           ▼                   ▼                   ▼                │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │          External Services (Local)                         │   │
│  │  - Ollama @ 11434 (LLM Inference)                         │   │
│  │  - Whisper (Speech-to-Text)                               │   │
│  │  - gTTS (Text-to-Speech)                                  │   │
│  │  - Tesseract (OCR)                                        │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ ML Model Service │  │ Report Service   │  │ Manager Service  │ │
│  │ (XGBoost)        │  │ (WeasyPrint)     │  │ (Admin Logic)    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│           │                   │                   │                │
│           └───────────────────┼───────────────────┘                │
│                               ▼                                    │
│                    ┌────────────────────────┐                      │
│                    │  Database (SQLite)     │                      │
│                    │  - Users               │                      │
│                    │  - Applications        │                      │
│                    │  - Chat Sessions       │                      │
│                    │  - Loan Data           │                      │
│                    └────────────────────────┘                      │
│                               │                                    │
│                    ┌──────────┴──────────┐                         │
│                    ▼                    ▼                         │
│              ┌──────────┐        ┌────────────┐                   │
│              │ Reports  │        │  Uploads   │                   │
│              │ (PDFs)   │        │ (Documents)│                   │
│              └──────────┘        └────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 User Journey & Data Flow

### 1. **New User Registration**

```
User Input (React)
    │
    ├─ Name, Email, Password, Role
    │
    ▼
POST /api/auth/register
    │
    ├─ Validate input (Pydantic schema)
    ├─ Check if email exists
    ├─ Hash password (bcrypt)
    ├─ Create user in database
    │
    ▼
JWT Token Generated
    │
    └─ Stored in localStorage (frontend)
```

**Database Record Created**:
```
users table:
├─ id: 1
├─ email: newuser@example.com
├─ password_hash: $2b$12$... (bcrypt hash)
├─ full_name: John Doe
├─ role: applicant
└─ created_at: 2024-01-15T10:30:00
```

---

### 2. **Loan Application Creation**

```
User clicks "Start Application"
    │
    ▼
Frontend: Create loan_applications record
    │
    ├─ Form collects:
    │  ├─ Income
    │  ├─ Credit Score
    │  ├─ Loan Amount
    │  ├─ Employment Status
    │  └─ Dependents
    │
    ▼
POST /api/loan/predict
    │
    ├─ MLModelService.predict_eligibility()
    │  ├─ Prepare features (normalize data)
    │  ├─ Load trained XGBoost model (loan_model.pkl)
    │  ├─ Get prediction (0-1 score)
    │  ├─ Calculate risk level
    │  └─ Generate recommendations
    │
    ▼
Update Application with:
├─ eligibility_score: 0.82
├─ eligibility_status: "eligible"
├─ risk_level: "low_risk"
└─ recommendations: [...]
```

---

### 3. **Chat with AI Agent**

```
User Message
    │
    ├─ "What are your interest rates?"
    │
    ▼
POST /api/chat/message
    │
    ├─ Extract loan context (if application_id provided)
    │  └─ Income, Credit Score, Loan Amount, etc.
    │
    ├─ Build system prompt with context
    │
    ▼
OllamaService.generate_response()
    │
    ├─ Connect to Ollama @ localhost:11434
    ├─ Send prompt: "You are loan officer. Context: {user_data}"
    ├─ Llama3 generates response
    │
    ▼
Post-process Response
    │
    ├─ Save chat to chat_sessions table
    ├─ Generate suggested next steps
    │
    ▼
Return AI Response to Frontend
    │
    └─ Display in chatbot UI
```

**Example Exchange**:
```
User: "Is my credit score good enough?"
System Prompt includes: credit_score: 720

Ollama/Llama3 Response:
"Your credit score of 720 is in the 'Good' range. 
This is above average and strengthens your loan application. 
Continue to make on-time payments to improve it further."
```

---

### 4. **Voice Input Processing**

```
User clicks "🎤 Voice Input"
    │
    ├─ Browser requests microphone access
    ├─ Records 10 seconds of audio
    ├─ Encodes to Base64
    │
    ▼
POST /api/voice/transcribe
    │
    ├─ Decode Base64 → WAV file
    │
    ├─ VoiceService.speech_to_text()
    │  ├─ Call Whisper CLI: whisper audio.wav
    │  ├─ Whisper transcribes to text
    │  └─ Return transcribed text
    │
    ▼
Automatically send transcribed text as chat message
    │
    └─ Continue to Chat flow (step 3)
```

---

### 5. **Document Verification & OCR**

```
User uploads document (ID, Paystub, Bank Statement)
    │
    ├─ File validation (size < 5MB)
    │
    ▼
POST /api/verify/document/{application_id}
    │
    ├─ Save file to: backend/app/static/uploads/
    │
    ├─ OCRService.extract_document_data()
    │  │
    │  ├─ Image Quality Check
    │  │  ├─ Resolution >= 300x200
    │  │  └─ File size check
    │  │
    │  ├─ Tesseract OCR
    │  │  └─ pytesseract.image_to_string(image)
    │  │
    │  ├─ Extract Fields using Regex
    │  │  ├─ Phone numbers: (\+?1[-.\s]?)?\(?([0-9]{3})\)?...
    │  │  ├─ Emails: ^\S+@\S+\.\S+$
    │  │  ├─ SSN: \d{3}-\d{2}-\d{4}
    │  │  └─ Dates: \d{1,2}[/-]\d{1,2}[/-]\d{4}
    │  │
    │  └─ Identify Document Type
    │     ├─ Keywords: "driver", "license" → Driver's License
    │     ├─ Keywords: "w-2", "tax" → W-2 Form
    │     └─ etc.
    │
    ▼
Return Extracted Data
    │
    ├─ Update application:
    │  ├─ document_path: "/path/to/file"
    │  ├─ document_verified: true
    │  └─ extracted_data: { ... JSON ... }
    │
    └─ Display in UI with confidence scores
```

**Extracted Data Example**:
```json
{
  "full_text": "DRIVER LICENSE... John Doe... DOB: 01/15/1990...",
  "fields": {
    "email": ["john.doe@email.com", 0.95],
    "phone": ["555-123-4567", 0.95],
    "date": ["01/15/1990", 0.85]
  },
  "document_type": "Driver's License"
}
```

---

### 6. **Loan Eligibility Prediction**

```
Backend has collected:
├─ User financial data
├─ Document extracted data
├─ AI chat context
│
▼
POST /api/loan/predict-for-application/{id}
    │
    ├─ Load application from database
    │
    ├─ Prepare features:
    │  ├─ annual_income
    │  ├─ credit_score
    │  ├─ loan_amount
    │  ├─ loan_term_months
    │  ├─ num_dependents
    │  ├─ employment_status → one-hot encode
    │  │  ├─ employment_status_employed: 1
    │  │  ├─ employment_status_self_employed: 0
    │  │  └─ employment_status_unemployed: 0
    │  │
    │  └─ Create numpy array: [75000, 720, 50000, 60, 2, 1, 0, 0]
    │
    ├─ MLModelService.predict_eligibility()
    │  │
    │  ├─ Load model: pickle.load('loan_model.pkl')
    │  │
    │  ├─ Get prediction: model.predict_proba(features)
    │  │  └─ XGBoost returns: [0.18, 0.82]
    │  │     (probability of ineligible, eligible)
    │  │
    │  ├─ Extract score: 0.82
    │  │
    │  ├─ Calculate metrics:
    │  │  ├─ Eligibility Status: "eligible" (score >= 0.5)
    │  │  ├─ Risk Level:
    │  │  │  ├─ If score < 0.3: "high_risk"
    │  │  │  ├─ If score < 0.6 & credit < 650: "medium_risk"
    │  │  │  └─ If score >= 0.7 & credit >= 700: "low_risk"
    │  │  │
    │  │  ├─ Debt-to-Income Ratio:
    │  │  │  └─ monthly_payment / monthly_income = 450 / 6250 = 0.072 (7.2%)
    │  │  │
    │  │  ├─ Credit Tier:
    │  │  │  ├─ 740+: "Excellent"
    │  │  │  ├─ 670-739: "Good"
    │  │  │  ├─ 580-669: "Fair"
    │  │  │  └─ <580: "Poor"
    │  │  │
    │  │  └─ Recommendations (dynamic):
    │  │     ├─ "Your application is strong. Proceed with submission."
    │  │     ├─ "Consider extending loan term to lower DTI."
    │  │     └─ "Excellent credit history supports your application."
    │  │
    │  └─ Return prediction object
    │
    ▼
Update database:
    │
    ├─ eligibility_score: 0.82
    ├─ eligibility_status: "eligible"
    ├─ updated_at: NOW()
    │
    └─ User sees result with visual score bar (82%)
```

---

### 7. **PDF Report Generation**

```
Application Approved/Manager Requests Report
    │
    ▼
POST /api/report/generate/{application_id}
    │
    ├─ Fetch application data from database
    │
    ├─ Prepare report_data dictionary:
    │  ├─ applicant_id: 1
    │  ├─ full_name: "John Doe"
    │  ├─ email: "john@example.com"
    │  ├─ annual_income: "$75,000.00"
    │  ├─ credit_score: 720
    │  ├─ loan_amount: "$50,000.00"
    │  ├─ loan_term: "60 months"
    │  ├─ eligibility_score: "82%"
    │  ├─ eligibility_status: "Eligible"
    │  ├─ approval_status: "Approved"
    │  ├─ document_verified: "Yes"
    │  ├─ manager_notes: "Strong application with good credit."
    │  └─ generated_date: "January 15, 2024 at 10:30 AM"
    │
    ├─ ReportService._render_template()
    │  │
    │  ├─ Load Jinja2 template: report_template.html
    │  │
    │  ├─ Render with context:
    │  │  ```html
    │  │  <h1>AI Loan System</h1>
    │  │  <div class="field">
    │  │    <span>Loan Amount</span>
    │  │    <span>{{ loan_amount }}</span>  ← Replaced with $50,000.00
    │  │  </div>
    │  │  ```
    │  │
    │  └─ Returns HTML string
    │
    ├─ WeasyPrint HTML to PDF conversion
    │  │
    │  ├─ HTML(string=html_content).write_pdf(path)
    │  │
    │  └─ Generate PDF with:
    │     ├─ Professional styling
    │     ├─ Color-coded status boxes (green for approved)
    │     ├─ Eligibility score visualization
    │     └─ Signature section
    │
    ▼
Save PDF to: backend/app/static/reports/loan_report_1_20240115_103000.pdf
    │
    ├─ Update application:
    │  └─ report_path: "/path/to/report.pdf"
    │
    ▼
Return report URL
    │
    └─ Frontend: Provide download button
```

**Generated PDF Structure**:
```
┌─────────────────────────────────────────┐
│  AI LOAN SYSTEM - APPLICATION REPORT    │
│  Report ID: 1 | Generated: Jan 15, 2024 │
├─────────────────────────────────────────┤
│ APPLICANT INFORMATION                   │
│ Full Name: John Doe                     │
│ Email: john@example.com                 │
│ Phone: 555-123-4567                     │
├─────────────────────────────────────────┤
│ FINANCIAL INFORMATION                   │
│ Annual Income: $75,000                  │
│ Credit Score: 720                       │
│ Loan Amount: $50,000                    │
│ Loan Term: 60 months                    │
├─────────────────────────────────────────┤
│ APPLICATION STATUS & DECISION            │
│ Eligibility Score: ████████░░ 82%       │
│ ✓ ELIGIBLE                              │
│ ✓ APPROVED                              │
├─────────────────────────────────────────┤
│ MANAGER NOTES                           │
│ Strong application with good credit...  │
├─────────────────────────────────────────┤
```

---

### 8. **Manager Dashboard & Decision Making**

```
Manager logs in with role="manager"
    │
    ▼
GET /api/manager/stats
    │
    ├─ Query database counts:
    │  ├─ SELECT COUNT(*) FROM loan_applications
    │  ├─ SELECT COUNT(*) WHERE approval_status='pending'
    │  ├─ SELECT COUNT(*) WHERE approval_status='approved'
    │  └─ SELECT COUNT(*) WHERE approval_status='rejected'
    │
    ▼
Display Dashboard Stats
    │
    ├─ Total Applications: 50
    ├─ Pending: 10
    ├─ Approved: 35
    └─ Rejected: 5
    │
    ▼
GET /api/manager/applications?status_filter=pending
    │
    ├─ Fetch all pending applications with:
    │  ├─ Applicant name
    │  ├─ Loan amount
    │  ├─ Eligibility score (visual bar)
    │  └─ Current status
    │
    ▼
Manager clicks "Review"
    │
    ├─ GET /api/manager/applications/{id}
    │  └─ Shows detailed application data
    │
    ├─ Manager reads:
    │  ├─ Financial details
    │  ├─ Document verification status
    │  ├─ Extracted OCR data
    │  ├─ ML eligibility score
    │  └─ Chat history (context)
    │
    ▼
Manager clicks "Approve" or "Reject"
    │
    ├─ POST /api/manager/applications/{id}/decision
    │  │
    │  ├─ Validate decision: "approved" or "rejected"
    │  │
    │  ├─ Update database:
    │  │  ├─ approval_status = "approved"
    │  │  ├─ manager_notes = "Good profile"
    │  │  └─ updated_at = NOW()
    │  │
    │  └─ Return success response
    │
    ▼
Manager can download report:
    │
    ├─ GET /api/report/download/{application_id}
    │  │
    │  ├─ Retrieve PDF file path
    │  ├─ Return file as binary response
    │  └─ Browser downloads PDF
    │
    └─ Report shows approval decision
```

---

## 🔐 Security & Authentication Flow

### JWT Token Lifecycle

```
┌──────────────────────────────────────────┐
│  User Credentials (email + password)     │
└───────────────────┬──────────────────────┘
                    │
                    ▼
         Verify password (bcrypt)
                    │
                    ├─ Hash submitted password
                    ├─ Compare with stored hash
                    └─ Match? → Continue
                    │
                    ▼
         Create JWT Token
                    │
                    ├─ Payload:
                    │  ├─ sub: user@example.com
                    │  ├─ exp: 2024-01-15T11:00:00 (30 min from now)
                    │  └─ iat: 2024-01-15T10:30:00
                    │
                    ├─ Sign with SECRET_KEY using HS256
                    │
                    └─ Return to client
                    │
                    ▼
         Client stores in localStorage
                    │
                    └─ "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    │
                    ▼
         Subsequent API Requests
                    │
                    ├─ Include in header:
                    │  └─ Authorization: Bearer eyJ...
                    │
                    ▼
         Backend validates token
                    │
                    ├─ Decode JWT
                    ├─ Check signature (SECRET_KEY)
                    ├─ Verify not expired
                    ├─ Extract email from "sub"
                    │
                    └─ Request authorized ✓
```

**Protected Endpoints** (require valid JWT):
- `GET /api/chat/message`
- `POST /api/verify/document/{id}`
- `GET /api/report/download/{id}`
- `POST /api/manager/applications/{id}/decision`

---

## 🧠 ML Model Training Pipeline

### Data Preparation

```
Raw CSV: loan_applicants_dataset.csv
├─ annual_income: float (20K-150K)
├─ credit_score: int (300-850)
├─ loan_amount: float (5K-500K)
├─ loan_term_months: int (12, 24, 36, 48, 60)
├─ num_dependents: int (0-4)
├─ employment_status: str (employed, self-employed, unemployed)
└─ eligible: int (0 or 1) ← Target variable
    │
    ▼
Feature Engineering
    │
    ├─ Numerical features: use as-is
    ├─ Categorical: one-hot encode
    │  └─ employment_status_employed: [1,0,0]
    │     employment_status_self_employed: [0,1,0]
    │     employment_status_unemployed: [0,0,1]
    │
    ▼
Train/Test Split: 80/20
    │
    ├─ Training set: 800 samples
    └─ Test set: 200 samples
    │
    ▼
Model Training
    │
    ├─ Algorithm: XGBoost Classifier
    ├─ Parameters:
    │  ├─ n_estimators: 100
    │  ├─ max_depth: 6
    │  ├─ learning_rate: 0.1
    │  └─ random_state: 42
    │
    ├─ Training: Fits 100 decision trees
    │
    └─ Cross-validation: Measures performance
    │
    ▼
Model Evaluation
    │
    ├─ Training Accuracy: ~87%
    ├─ Testing Accuracy: ~85%
    │
    └─ Save model: pickle.dump(model, 'loan_model.pkl')
```

### Prediction Process

```
New Application Data
    │
    ├─ annual_income: 75000
    ├─ credit_score: 720
    ├─ loan_amount: 50000
    ├─ loan_term_months: 60
    ├─ num_dependents: 2
    └─ employment_status: "employed"
    │
    ▼
Feature Preparation
    │
    ├─ Normalize/scale (if model used scaling)
    ├─ One-hot encode: employment_status → [1, 0, 0]
    │
    └─ Create array: [75000, 720, 50000, 60, 2, 1, 0, 0]
    │
    ▼
Model Prediction
    │
    ├─ model.predict_proba(features)
    │  └─ Returns: [[0.18, 0.82]]
    │     (18% chance ineligible, 82% chance eligible)
    │
    ├─ Eligibility score: 0.82
    ├─ Class: "eligible" (score >= 0.5)
    │
    └─ Risk assessment: Combine with other factors
    │
    ▼
Post-Processing & Recommendations
    │
    ├─ Risk Level:
    │  └─ Score 0.82 + Credit 720 → "low_risk"
    │
    ├─ DTI Ratio:
    │  └─ Monthly payment $450 / Income $6250 = 7.2% ✓
    │
    ├─ Recommendations:
    │  ├─ "Your application is strong."
    │  ├─ "Approve" (if DTI < 43%)
    │  └─ "Proceed with document submission."
    │
    └─ Return to frontend
```

---

## 🔌 External Service Integration

### Ollama (LLM Chat)

```
Request: POST http://localhost:11434/api/generate
├─ model: "llama3"
├─ prompt: "You are a loan officer. User asked: ..."
└─ stream: false
    │
    ▼
Ollama (running locally)
    │
    ├─ Loads llama3 model into memory (if not cached)
    ├─ Processes prompt through neural network
    ├─ Generates response token-by-token
    │
    ▼
Response: { "response": "Based on your credit score... " }
```

**Advantages**:
- No API calls to external services
- No latency from network
- Private (data stays local)
- Free (open-source)

---

### Whisper (Speech-to-Text)

```
Audio File (MP3/WAV)
    │
    ▼
whisper --model base audio.mp3
    │
    ├─ Loads Whisper base model (~140MB)
    ├─ Converts speech to text
    │
    ▼
Output: Transcribed text file (audio.txt)
    │
    └─ "What is your interest rate?"
```

**Process**:
1. Browser records audio via WebRTC
2. Encodes to WAV
3. Sends to backend
4. Backend calls Whisper CLI
5. Returns transcribed text
6. Sends as chat message

---

### Tesseract (OCR)

```
Image File (JPG/PNG)
    │
    ▼
pytesseract.image_to_string(image)
    │
    ├─ Loads Tesseract OCR engine
    ├─ Extracts text from image
    ├─ Returns as string
    │
    ▼
Text Processing
    │
    ├─ Apply regex patterns
    ├─ Extract phone, email, dates
    ├─ Identify document type
    │
    └─ Return structured data
```

**Quality Checks**:
- Image resolution >= 300x200 pixels
- File size <= 5MB
- Readable text detected (length > 20 chars)

---

## 📊 Data Models & Relationships

### Database Schema

```sql
-- Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'applicant',  -- applicant, manager
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Loan Applications Table
CREATE TABLE loan_applications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER FOREIGN KEY,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    annual_income FLOAT,
    credit_score INTEGER,
    loan_amount FLOAT,
    loan_term_months INTEGER,
    num_dependents INTEGER,
    employment_status TEXT,  -- employed, self-employed, unemployed
    document_verified BOOLEAN DEFAULT FALSE,
    document_path TEXT,
    extracted_data JSON,  -- OCR results
    eligibility_score FLOAT,
    eligibility_status TEXT,  -- eligible, ineligible
    approval_status TEXT DEFAULT 'pending',  -- pending, approved, rejected
    manager_notes TEXT,
    report_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat Sessions Table
CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER FOREIGN KEY,
    application_id INTEGER,
    messages JSON,  -- [{role: "user", content: "..."}, ...]
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Entity Relationships

```
users (1) ──────────(N) loan_applications
          user_id         ├─ Applicant can have multiple applications
                          └─ Track application history
                                    │
                                    ├─ (1) loan_applications (N) chat_sessions
                                    │     └─ Each application has chat history
                                    │
                                    └─ Generated reports
                                        └─ Report path stored in application
```

---

## 🚀 Deployment Considerations

### Frontend Deployment (Vercel/Netlify)

```
Github Repository
    │
    ├─ Vercel/Netlify detects changes
    │
    ├─ Install dependencies: npm install
    ├─ Build: npm run build
    │
    ├─ Outputs static files to ./build
    │
    └─ Deploy to CDN
        └─ Available at https://yourdomain.com
```

### Backend Deployment (Render/Railway)

```
Github Repository
    │
    ├─ Railway/Render detects changes
    │
    ├─ Detect Python project
    ├─ Install from requirements.txt
    │
    ├─ Set environment variables:
    │  ├─ DATABASE_URL (use PostgreSQL)
    │  ├─ SECRET_KEY (change to strong value)
    │  └─ OLLAMA_API_URL (use remote Ollama or local)
    │
    ├─ Run: uvicorn main:app
    │
    └─ Available at https://yourapi.railway.app
```

### Database Options (Production)

| Option | Pros | Cons |
|--------|------|------|
| SQLite | Simple, no setup | Single user, not scalable |
| PostgreSQL (AWS RDS) | Scalable, reliable | Small cost |
| MongoDB Atlas | NoSQL, flexible | Less structured |
| Supabase | PostgreSQL + Auth | Price after free tier |

---

## ✅ Testing Workflows

### 1. Happy Path Test (All Systems Go)

```
1. User registers ✓
2. Logs in ✓
3. Starts loan application ✓
4. Chats with AI ✓
5. Uploads document ✓
6. Document verified ✓
7. Eligibility predicted (0.82 eligible) ✓
8. PDF report generated ✓
9. Manager approves ✓
10. User downloads report ✓
```

### 2. Voice Test

```
1. User clicks 🎤 Voice Input
2. Browser requests microphone ✓
3. User says: "What is my eligibility?" ✓
4. Audio sent to backend
5. Whisper transcribes → "What is my eligibility?"
6. Sent as chat message ✓
7. AI responds ✓
8. gTTS converts response to audio ✓
9. Audio played in browser ✓
```

### 3. OCR Test

```
1. Upload driver's license image
2. Tesseract extracts: name, DOB, address ✓
3. Regex extracts email & phone ✓
4. Document type identified ✓
5. Confidence scores displayed ✓
6. Application updated ✓
```

### 4. Manager Decision Test

```
1. Manager logs in ✓
2. Views 10 pending applications ✓
3. Clicks "Review" on one ✓
4. Sees full details & extracted data ✓
5. Clicks "Approve" ✓
6. Status updated in database ✓
7. Downloads PDF report ✓
8. Application removed from pending list ✓
```

---

## 🎯 Key Integration Points

### Frontend ↔ Backend

| Feature | Frontend | Backend Route | Service |
|---------|----------|---------------|---------|
| Chat | Chatbot.jsx | POST /api/chat/message | OllamaService |
| Voice | VoiceAgent | POST /api/voice/transcribe | VoiceService |
| Document | DocumentVerification.jsx | POST /api/verify/document | OCRService |
| Eligibility | LoanForm | POST /api/loan/predict | MLModelService |
| Reports | ManagerDashboard.jsx | GET /api/report/download | ReportService |
| Auth | LoginForm.jsx | POST /api/auth/login | JWT + Database |

### State Management

```
Frontend (React)
├─ localStorage
│  ├─ access_token (JWT)
│  └─ user (user object)
│
├─ useState hooks
│  ├─ messages (chat history)
│  ├─ extractedData (OCR results)
│  ├─ applications (manager list)
│  └─ selectedApp (for modal)
│
└─ API calls (axios)
   └─ Include JWT in Authorization header
```

---

## 🔄 Continuous Improvement

### Monitoring

```
Backend Monitoring
├─ Log file: backend/logs/app.log
├─ Database size: SELECT COUNT(*) FROM loan_applications
├─ Error rate: Check logs for 500 errors
└─ Performance: Response times > 2s?

Frontend Monitoring
├─ Console errors (F12)
├─ Network tab (API calls)
├─ User feedback
└─ Conversion rate (users who complete application)
```

### Optimization Opportunities

1. **Caching**: Store Ollama responses for common questions
2. **Async Processing**: Use Celery for long-running tasks
3. **Database Indexing**: Index on email, status fields
4. **API Rate Limiting**: Prevent abuse
5. **ML Model Updates**: Retrain with new data monthly

---

## 📚 References & Resources

- **FastAPI**: https://fastapi.tiangolo.com/
- **SQLAlchemy**: https://www.sqlalchemy.org/
- **React**: https://react.dev/
- **Ollama**: https://ollama.ai/
- **Whisper**: https://github.com/openai/whisper
- **Tesseract**: https://github.com/UB-Mannheim/tesseract/wiki
- **XGBoost**: https://xgboost.readthedocs.io/
- **WeasyPrint**: https://weasyprint.org/
- **Tailwind CSS**: https://tailwindcss.com/

---

**This architecture ensures a seamless, secure, and intelligent loan processing system entirely on open-source technologies! 🎉**
