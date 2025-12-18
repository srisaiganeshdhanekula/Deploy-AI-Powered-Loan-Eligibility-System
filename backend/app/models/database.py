"""
Database Configuration and Models
"""

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, JSON, MetaData, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

# Schema control (defaults to public for Postgres/Supabase)
DB_SCHEMA = os.getenv("DB_SCHEMA", "public")


def _build_engine_with_fallback():
    """Create SQLAlchemy engine from DATABASE_URL, falling back to local SQLite if unreachable.

    Returns (engine, is_sqlite: bool, fallback_used: bool)
    """
    db_url = os.getenv("DATABASE_URL", "sqlite:///./ai_loan_system.db")

    def is_sqlite_url(url: str) -> bool:
        return url.startswith("sqlite")

    # Try primary URL first
    try:
        primary_is_sqlite = is_sqlite_url(db_url)
        connect_args = {"check_same_thread": False} if primary_is_sqlite else {}
        if not primary_is_sqlite:
            # Ensure connections use the intended schema for Postgres/Supabase
            connect_args["options"] = f"-c search_path={DB_SCHEMA}"
            # Optional DNS bypass: provide SUPABASE_HOSTADDR to connect directly by IP
            hostaddr = os.getenv("SUPABASE_HOSTADDR")
            if hostaddr:
                connect_args["hostaddr"] = hostaddr

        engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)

        # Test connectivity early to avoid import-time crashes
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return engine, primary_is_sqlite, False
    except Exception as e:  # noqa: BLE001 - log and fallback
        logger.warning(f"Primary DATABASE_URL unreachable, falling back to local SQLite. Reason: {e}")

    # Fallback to local SQLite in project root
    fallback_url = "sqlite:///./ai_loan_system.db"
    fallback_engine = create_engine(
        fallback_url, connect_args={"check_same_thread": False}, pool_pre_ping=True
    )
    return fallback_engine, True, True


# Create engine (with fallback if needed)
engine, _is_sqlite, DB_FALLBACK_USED = _build_engine_with_fallback()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models (pin schema for Postgres; None for SQLite)
metadata = MetaData(schema=DB_SCHEMA if not _is_sqlite else None)
Base = declarative_base(metadata=metadata)


class User(Base):
    """User model for authentication"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    full_name = Column(String)
    role = Column(String, default="applicant")  # applicant or manager
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)


class LoanApplication(Base):
    """Loan application model"""
    __tablename__ = "loan_applications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    full_name = Column(String)
    email = Column(String)
    phone = Column(String)
    
    # Direct input features
    age = Column(Integer)
    gender = Column(String)
    marital_status = Column(String)
    monthly_income = Column(Float)
    employment_type = Column(String)
    loan_amount_requested = Column(Float)
    loan_tenure_years = Column(Integer)
    credit_score = Column(Integer)
    region = Column(String)
    loan_purpose = Column(String)
    dependents = Column(Integer)
    existing_emi = Column(Float)
    salary_credit_frequency = Column(String)
    
    # OCR extracted features
    total_withdrawals = Column(Float, default=0.0)
    total_deposits = Column(Float, default=0.0)
    avg_balance = Column(Float, default=0.0)
    bounced_transactions = Column(Integer, default=0)
    account_age_months = Column(Integer, default=12)
    
    # Calculated features
    total_liabilities = Column(Float, default=0.0)
    debt_to_income_ratio = Column(Float, default=0.0)
    income_stability_score = Column(Float, default=0.8)
    credit_utilization_ratio = Column(Float, default=0.3)
    loan_to_value_ratio = Column(Float, default=0.7)
    
    # Legacy fields (keeping for backward compatibility)
    annual_income = Column(Float, nullable=True)  # Will be computed from monthly_income
    loan_amount = Column(Float, nullable=True)    # Will be computed from loan_amount_requested
    loan_term_months = Column(Integer, nullable=True)  # Will be computed from loan_tenure_years
    num_dependents = Column(Integer, nullable=True)    # Will be computed from dependents
    employment_status = Column(String, nullable=True)  # Will be computed from employment_type
    
    document_verified = Column(Boolean, default=False)
    document_path = Column(String, nullable=True)
    extracted_data = Column(JSON, nullable=True)
    eligibility_score = Column(Float, nullable=True)
    eligibility_status = Column(String, nullable=True)  # eligible, ineligible
    approval_status = Column(String, default="pending")  # pending, approved, rejected
    manager_notes = Column(Text, nullable=True)
    report_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatSession(Base):
    """Chat session model"""
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    application_id = Column(Integer, nullable=True)
    messages = Column(JSON)  # Store message history as JSON
    meta = Column(JSON, nullable=True)  # Aggregated metadata (e.g., collected_values)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class VoiceCall(Base):
    """Voice call conversation and extraction records (stored in Supabase/Postgres via SQLAlchemy)."""
    __tablename__ = "voice_calls"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_text = Column(Text, nullable=True)
    ai_reply = Column(Text, nullable=True)
    name = Column(String, nullable=True)
    monthly_income = Column(Float, nullable=True)
    credit_score = Column(Integer, nullable=True)
    loan_amount = Column(Float, nullable=True)
    audio_url = Column(String, nullable=True)
    structured_data = Column(JSON, nullable=True)
    eligibility_score = Column(Float, nullable=True)

# SharedDashboardLink must be a top-level class
class SharedDashboardLink(Base):
    """Persistent store for shared dashboard links"""
    __tablename__ = "shared_dashboard_links"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    user_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

# Create tables (works for SQLite and Postgres/Supabase)
Base.metadata.create_all(bind=engine)

# Lightweight column migration for email_verified (for existing deployments)
def _ensure_email_verified_column():
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if "users" in insp.get_table_names():
        cols = [c['name'] if isinstance(c, dict) and 'name' in c else c.name for c in insp.get_columns("users")]
        if "email_verified" not in cols:
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE"))
                logger.info("Added email_verified column to users table")
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Could not add email_verified column automatically: {e}")

_ensure_email_verified_column()


def _ensure_chat_sessions_meta_column():
    """Lightweight migration: add meta column to chat_sessions if missing.
    Works for SQLite and Postgres environments without full Alembic.
    """
    try:
        from sqlalchemy import inspect, text
        insp = inspect(engine)
        if "chat_sessions" in insp.get_table_names():
            cols = [c['name'] if isinstance(c, dict) and 'name' in c else c.name for c in insp.get_columns("chat_sessions")]
            if "meta" not in cols:
                with engine.connect() as conn:
                    # JSON type for Postgres, TEXT for SQLite (stored as JSON string logically)
                    if _is_sqlite:
                        conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN meta TEXT"))
                    else:
                        conn.execute(text(f"ALTER TABLE {DB_SCHEMA}.chat_sessions ADD COLUMN meta JSON"))
                logger.info("Added meta column to chat_sessions table")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not add meta column to chat_sessions automatically: {e}")


_ensure_chat_sessions_meta_column()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
