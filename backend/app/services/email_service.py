"""
Email Service for OTP verification and notifications
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import pyotp
import random
import string
from typing import Optional
from app.utils.logger import get_logger
import os

logger = get_logger(__name__)


class EmailService:
    """Service for sending emails and managing OTP"""

    def __init__(self):
        # Email configuration - in production, use environment variables
        # Prefer project-level env var names used in current .env (SMTP_EMAIL/SMTP_PASSWORD)
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.sender_email = os.getenv("SMTP_EMAIL", os.getenv("SENDER_EMAIL", "your-email@gmail.com"))
        self.sender_password = os.getenv("SMTP_PASSWORD", os.getenv("SENDER_PASSWORD", "your-app-password"))

        # OTP configuration & in-memory store (development only)
        self.otp_secret = os.getenv("OTP_SECRET", "JBSWY3DPEHPK3PXP")  # Default for development
        self.totp = pyotp.TOTP(self.otp_secret)
        self._otp_store = {}  # email -> {code:str, expires:datetime}

    def send_otp_email(self, recipient_email: str, otp_code: str) -> bool:
        """
        Send OTP verification email

        Args:
            recipient_email: Email address to send OTP to
            otp_code: The OTP code to send

        Returns:
            bool: True if email sent successfully
        """
        try:
            subject = "AI Loan System - Email Verification Code"
            body = f"""
            Welcome to AI Loan System!

            Your verification code is: {otp_code}

            This code will expire in 10 minutes.

            If you didn't request this code, please ignore this email.

            Best regards,
            AI Loan System Team
            """

            return self._send_email(recipient_email, subject, body)

        except Exception as e:
            logger.error(f"Failed to send OTP email: {str(e)}")
            return False

    def send_loan_result_notification(self, recipient_email: str, applicant_name: str,
                                    eligibility_score: float, status: str) -> bool:
        """
        Send loan eligibility result notification

        Args:
            recipient_email: Applicant's email
            applicant_name: Applicant's full name
            eligibility_score: Eligibility score (0-1)
            status: "eligible" or "ineligible"

        Returns:
            bool: True if email sent successfully
        """
        try:
            score_percentage = round(eligibility_score * 100, 1)

            if status == "eligible":
                subject = "🎉 Congratulations! Your Loan Application Results"
                body = f"""
                Dear {applicant_name},

                Great news! Your loan application has been processed.

                📊 Eligibility Score: {score_percentage}%
                ✅ Status: ELIGIBLE

                Your application has been forwarded to our loan manager for final review.
                You will receive another notification once the final decision is made.

                Thank you for choosing AI Loan System!

                Best regards,
                AI Loan System Team
                """
            else:
                subject = "📋 Your Loan Application Results"
                body = f"""
                Dear {applicant_name},

                Your loan application has been processed.

                📊 Eligibility Score: {score_percentage}%
                ❌ Status: NOT ELIGIBLE

                Unfortunately, you don't meet our current eligibility criteria.
                We recommend improving your credit score or increasing your income
                before reapplying.

                Thank you for your interest in AI Loan System.

                Best regards,
                AI Loan System Team
                """

            return self._send_email(recipient_email, subject, body)

        except Exception as e:
            logger.error(f"Failed to send loan result email: {str(e)}")
            return False

    def send_manager_decision_notification(self, recipient_email: str, applicant_name: str,
                                         decision: str, manager_notes: Optional[str] = None) -> bool:
        """
        Send manager's final decision notification

        Args:
            recipient_email: Applicant's email
            applicant_name: Applicant's full name
            decision: "approved" or "rejected"
            manager_notes: Optional notes from manager

        Returns:
            bool: True if email sent successfully
        """
        try:
            if decision.lower() == "approved":
                subject = "🎉 Congratulations! Your Loan Has Been Approved"
                body = f"""
                Dear {applicant_name},

                EXCELLENT NEWS! Your loan application has been APPROVED by our loan manager.

                ✅ Final Decision: APPROVED

                Your loan documents will be prepared and sent to you shortly.
                Please contact our office to complete the final paperwork.

                """
            else:
                subject = "📋 Loan Application Update"
                body = f"""
                Dear {applicant_name},

                Thank you for your loan application.

                ❌ Final Decision: REJECTED

                """

            if manager_notes:
                body += f"\nManager Notes: {manager_notes}\n"

            body += """
            If you have any questions, please contact our customer service.

            Thank you for choosing AI Loan System!

            Best regards,
            AI Loan System Team
            """

            return self._send_email(recipient_email, subject, body)

        except Exception as e:
            logger.error(f"Failed to send manager decision email: {str(e)}")
            return False

    def generate_otp(self) -> str:
        """
        Generate a 6-digit OTP code

        Returns:
            str: 6-digit OTP code
        """
        # Generate a random 6-digit code
        code = ''.join(random.choices(string.digits, k=6))
        return code

    def store_otp(self, email: str, code: str, ttl_seconds: int = 600):
        from datetime import datetime, timedelta
        self._otp_store[email.lower()] = {
            "code": code,
            "expires": datetime.utcnow() + timedelta(seconds=ttl_seconds)
        }

    def verify_stored_otp(self, email: str, code: str) -> bool:
        from datetime import datetime
        record = self._otp_store.get(email.lower())
        if not record:
            return False
        if datetime.utcnow() > record["expires"]:
            # Expired
            del self._otp_store[email.lower()]
            return False
        if record["code"] == code:
            # One-time use
            del self._otp_store[email.lower()]
            return True
        return False

    def verify_otp(self, otp_code: str) -> bool:
        """
        Verify OTP code (basic implementation - in production use TOTP)

        Args:
            otp_code: The OTP code to verify

        Returns:
            bool: True if OTP is valid
        """
        # For development, accept any 6-digit code
        # In production, implement proper TOTP verification
        return len(otp_code) == 6 and otp_code.isdigit()

    def _send_email(self, recipient: str, subject: str, body: str) -> bool:
        """
        Send email using SMTP

        Args:
            recipient: Recipient email address
            subject: Email subject
            body: Email body

        Returns:
            bool: True if sent successfully
        """
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = recipient
            msg['Subject'] = subject

            # Add body
            msg.attach(MIMEText(body, 'plain'))

            # Create SMTP session
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.sender_email, self.sender_password)

            # Send email
            text = msg.as_string()
            server.sendmail(self.sender_email, recipient, text)
            server.quit()

            logger.info(f"Email sent successfully to {recipient}")
            return True

        except Exception as e:
            logger.error(f"SMTP error: {str(e)}")
            return False


# Global email service instance
email_service = EmailService()