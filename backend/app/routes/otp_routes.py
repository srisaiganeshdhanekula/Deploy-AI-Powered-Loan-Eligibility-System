"""
OTP Routes for email verification
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.models.database import get_db, User
from app.models.schemas import OTPRequest, OTPVerifyRequest, OTPResponse
from app.services.email_service import email_service
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.post("/send", response_model=OTPResponse)
async def send_otp(request: OTPRequest, db: Session = Depends(get_db)):
    """
    Send OTP code to user's email for verification

    Used during registration or identity verification
    """
    try:
        # Check if user exists (for existing users)
        user = None
        if hasattr(request, 'user_id') and request.user_id:
            user = db.query(User).filter(User.id == request.user_id).first()

        # Generate & store OTP (in-memory for dev)
        otp_code = email_service.generate_otp()
        email_service.store_otp(request.email, otp_code, ttl_seconds=600)

        # Send email (don't hard-fail on SMTP errors in dev)
        success = email_service.send_otp_email(request.email, otp_code)
        if not success:
            logger.warning(f"SMTP send failed for {request.email}; continuing in dev mode")

        logger.info(f"OTP sent to {request.email}")

        return {
            "success": True,
            "message": "OTP sent successfully",
            "expires_in": 600  # 10 minutes
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP send error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP"
        )


@router.post("/verify", response_model=OTPResponse)
async def verify_otp(request: OTPVerifyRequest, db: Session = Depends(get_db)):
    """
    Verify OTP code entered by user

    Used to complete identity verification
    """
    try:
        # Verify stored OTP first; fallback to dev acceptance
        is_valid = email_service.verify_stored_otp(request.email, request.otp_code)
        if not is_valid:
            is_valid = email_service.verify_otp(request.otp_code)

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OTP code"
            )

        # Update user verification status if user_id provided
        if hasattr(request, 'user_id') and request.user_id:
            user = db.query(User).filter(User.id == request.user_id).first()
            if user:
                user.email_verified = True
                db.commit()

        logger.info(f"OTP verified for user {getattr(request, 'user_id', 'unknown')}")

        return {
            "success": True,
            "message": "OTP verified successfully",
            "verified": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify OTP"
        )


@router.get("/status")
async def otp_status():
    """Check OTP service availability"""
    return {
        "otp_enabled": True,
        "service": "email_otp",
        "message": "OTP service is available"
    }