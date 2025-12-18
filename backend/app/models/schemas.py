"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


# Authentication Schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: str = "applicant"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    created_at: datetime
    email_verified: bool
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# Loan Application Schemas
class LoanApplicationCreate(BaseModel):
    user_id: Optional[int] = None
    full_name: Optional[str] = None
    email: EmailStr
    phone: str
    annual_income: float
    credit_score: int
    loan_amount: float
    loan_term_months: int
    num_dependents: int
    employment_status: str


class LoanApplicationUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    annual_income: Optional[float] = None
    credit_score: Optional[int] = None
    loan_amount: Optional[float] = None
    loan_term_months: Optional[int] = None
    num_dependents: Optional[int] = None
    employment_status: Optional[str] = None
    # Additional fields for complete form data
    age: Optional[int] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    monthly_income: Optional[float] = None
    employment_type: Optional[str] = None
    loan_amount_requested: Optional[float] = None
    loan_tenure_years: Optional[int] = None
    region: Optional[str] = None
    loan_purpose: Optional[str] = None
    dependents: Optional[int] = None
    existing_emi: Optional[float] = None
    salary_credit_frequency: Optional[str] = None
    total_withdrawals: Optional[float] = None
    total_deposits: Optional[float] = None
    avg_balance: Optional[float] = None
    bounced_transactions: Optional[int] = None
    account_age_months: Optional[int] = None
    total_liabilities: Optional[float] = None


class LoanApplicationResponse(BaseModel):
    id: int
    user_id: int
    full_name: Optional[str] = None
    email: str
    annual_income: float
    credit_score: int
    loan_amount: float
    eligibility_score: Optional[float]
    eligibility_status: Optional[str]
    approval_status: str
    document_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# Chat Schemas
class ChatMessage(BaseModel):
    role: str  # user or assistant
    content: str


class ChatRequest(BaseModel):
    message: str
    application_id: Optional[int] = None
    user_id: Optional[int] = None
    provider: Optional[str] = None



class ChatResponse(BaseModel):
    message: str
    application_id: Optional[int] = None
    suggested_next_steps: Optional[List[str]] = None
    # Optional UI action hint for frontend (e.g., 'open_form')
    action: Optional[str] = None
    # Structured suggestions with machine-readable IDs
    suggestions: Optional[List[Dict[str, str]]] = None
    # Optional echo of what was collected this turn
    collected_fields: Optional[List[str]] = None
    collected_values: Optional[Dict[str, Any]] = None
    # Whether the assistant's reply includes a follow-up question
    ask_followup: Optional[bool] = False


# Voice Schemas
class VoiceRequest(BaseModel):
    audio_base64: str


class VoiceResponse(BaseModel):
    transcribed_text: str
    audio_response_base64: Optional[str] = None


class VoiceAgentResponse(BaseModel):
    transcript: str
    ai_reply: str
    structured_data: dict
    audio_url: str
    eligibility_score: Optional[float] = None
    application_id: Optional[int] = None


# OCR Schemas
class DocumentVerificationRequest(BaseModel):
    application_id: int


class DocumentVerificationResponse(BaseModel):
    extracted_data: Dict[str, Any]
    confidence_scores: Dict[str, float]
    verification_status: str


# Loan Prediction Schemas
class LoanPredictionRequest(BaseModel):
    # Direct input features
    Age: int
    Gender: str
    Marital_Status: str
    Monthly_Income: float
    Employment_Type: str
    Loan_Amount_Requested: float
    Loan_Tenure_Years: int
    Credit_Score: int
    Region: str
    Loan_Purpose: str
    Dependents: int
    Existing_EMI: float
    Salary_Credit_Frequency: str
    
    # OCR extracted features
    Total_Withdrawals: Optional[float] = 0.0
    Total_Deposits: Optional[float] = 0.0
    Avg_Balance: Optional[float] = 0.0
    Bounced_Transactions: Optional[int] = 0
    Account_Age_Months: Optional[int] = 12
    
    # Calculated features
    Total_Liabilities: Optional[float] = 0.0
    Debt_to_Income_Ratio: Optional[float] = 0.0
    Income_Stability_Score: Optional[float] = 0.8
    Credit_Utilization_Ratio: Optional[float] = 0.3
    Loan_to_Value_Ratio: Optional[float] = 0.7


class LoanPredictionResponse(BaseModel):
    eligibility_score: float
    eligibility_status: str
    risk_level: str
    recommendations: List[str]
    credit_tier: str
    debt_to_income_ratio: float
    confidence: float


# Report Schemas
class ReportGenerationRequest(BaseModel):
    application_id: int


class ReportGenerationResponse(BaseModel):
    report_path: str
    report_url: str
    generated_at: datetime


# Manager Dashboard Schemas
class ApplicationStats(BaseModel):
    total_applications: int
    pending_applications: int
    approved_applications: int
    rejected_applications: int
    voice_calls_count: Optional[int] = 0
    avg_credit_score: Optional[float] = 0.0
    loan_amount_distribution: Optional[List[Dict[str, Any]]] = None


class ManagerApplicationResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    annual_income: Optional[float] = None
    loan_amount: Optional[float] = None
    loan_amount_requested: Optional[float] = None
    eligibility_score: Optional[float]
    approval_status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class ManagerDecisionRequest(BaseModel):
    application_id: int
    decision: str  # approved or rejected
    notes: Optional[str] = None


# OTP Schemas
class OTPRequest(BaseModel):
    email: EmailStr
    user_id: Optional[int] = None


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp_code: str
    user_id: Optional[int] = None


class OTPResponse(BaseModel):
    success: bool
    message: str
    verified: Optional[bool] = None
    expires_in: Optional[int] = None
