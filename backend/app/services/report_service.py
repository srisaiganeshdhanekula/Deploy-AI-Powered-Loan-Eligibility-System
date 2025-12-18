
from pathlib import Path
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from app.utils.logger import get_logger

logger = get_logger(__name__)

class ReportService:
    """Service for generating PDF reports using ReportLab (no WeasyPrint/GTK3 required)"""

    def __init__(self):
        self.reports_dir = Path(__file__).parent.parent / "static" / "reports"
        self.reports_dir.mkdir(exist_ok=True, parents=True)

    def generate_report(self, application_data: dict, output_filename: str = None) -> str:
        """
        Generate PDF report for loan application using ReportLab
        """
        if not output_filename:
            app_id = application_data.get("id", "unknown")
            output_filename = f"loan_report_{app_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.reports_dir / output_filename
        try:
            c = canvas.Canvas(str(output_path), pagesize=letter)
            width, height = letter
            y = height - 40
            c.setFont("Helvetica-Bold", 16)
            c.drawString(40, y, "AI Loan System - Application Report")
            y -= 30
            c.setFont("Helvetica", 10)
            c.drawString(40, y, f"Report ID: {application_data.get('id', '')} | Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
            y -= 30

            def draw_field(label, value):
                nonlocal y
                c.setFont("Helvetica-Bold", 10)
                c.drawString(40, y, f"{label}:")
                c.setFont("Helvetica", 10)
                c.drawString(180, y, str(value))
                y -= 18

            # Applicant Info
            c.setFont("Helvetica-Bold", 12)
            c.drawString(40, y, "Applicant Information")
            y -= 20
            draw_field("Full Name", application_data.get("full_name", "N/A"))
            draw_field("Email", application_data.get("email", "N/A"))
            draw_field("Phone", application_data.get("phone", "N/A"))
            draw_field("Employment Status", application_data.get("employment_status", "N/A"))
            draw_field("Dependents", application_data.get("num_dependents", 0))

            # Financial Info
            c.setFont("Helvetica-Bold", 12)
            c.drawString(40, y, "Financial Information")
            y -= 20
            draw_field("Annual Income", application_data.get("annual_income", "N/A"))
            draw_field("Monthly Income", application_data.get("monthly_income", "N/A"))
            draw_field("Credit Score", application_data.get("credit_score", "N/A"))
            draw_field("Avg Balance", application_data.get("avg_balance", "N/A"))
            draw_field("Existing EMI", application_data.get("existing_emi", "N/A"))
            draw_field("DTI", application_data.get("debt_to_income_ratio", "N/A"))

            # Loan Info
            c.setFont("Helvetica-Bold", 12)
            c.drawString(40, y, "Loan Details")
            y -= 20
            draw_field("Loan Amount Requested", application_data.get("loan_amount_requested", application_data.get("loan_amount", "N/A")))
            draw_field("Loan Term (months)", application_data.get("loan_term_months", "N/A"))
            draw_field("Loan Purpose", application_data.get("loan_purpose", "N/A"))

            # Eligibility & Status
            c.setFont("Helvetica-Bold", 12)
            c.drawString(40, y, "Eligibility & Status")
            y -= 20
            draw_field("Eligibility Score", application_data.get("eligibility_score", "N/A"))
            draw_field("Eligibility Status", application_data.get("eligibility_status", "N/A"))
            draw_field("Approval Status", application_data.get("approval_status", "N/A"))
            draw_field("Manager Notes", application_data.get("manager_notes", "N/A"))
            draw_field("Document Verified", "Yes" if application_data.get("document_verified") else "No")

            # AI Analysis (if present)
            ai_analysis = application_data.get("analysis")
            if ai_analysis:
                c.setFont("Helvetica-Bold", 12)
                c.drawString(40, y, "AI Analysis")
                y -= 20
                c.setFont("Helvetica", 10)
                for line in str(ai_analysis).splitlines():
                    c.drawString(40, y, line)
                    y -= 14

            c.save()
            logger.info(f"Generated PDF report: {output_path}")
            return str(output_path)
        except Exception as e:
            logger.error(f"ReportLab failed to generate PDF: {e}")
            raise RuntimeError(f"Failed to generate PDF report: {e}")

