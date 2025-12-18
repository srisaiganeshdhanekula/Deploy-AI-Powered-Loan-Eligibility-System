"""
Report Generation Routes
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.models.database import get_db, LoanApplication
from app.services.report_service import ReportService
from app.services.llm_selector import get_llm_service
from app.utils.logger import get_logger
from pathlib import Path

logger = get_logger(__name__)
router = APIRouter()

report_service = ReportService()


@router.post("/generate/{application_id}")
async def generate_report(
    application_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate PDF report for a loan application
    
    Report includes all application details and decision status
    """
    try:
        # Get application
        app = db.query(LoanApplication).filter(
            LoanApplication.id == application_id
        ).first()
        
        if not app:
            raise HTTPException(
                status_code=404,
                detail="Application not found"
            )
        
        # Prepare application data
        app_data = {
            "id": app.id,
            "full_name": app.full_name,
            "email": app.email,
            "phone": app.phone,
            "annual_income": app.annual_income,
            "monthly_income": app.monthly_income,
            "credit_score": app.credit_score,
            "loan_amount": app.loan_amount,
            "loan_amount_requested": app.loan_amount_requested,
            "loan_term_months": app.loan_term_months,
            "num_dependents": app.num_dependents or app.dependents,
            "employment_status": app.employment_status or app.employment_type,
            # OCR/Calculated Features
            "avg_balance": app.avg_balance,
            "existing_emi": app.existing_emi,
            "debt_to_income_ratio": app.debt_to_income_ratio,
            "eligibility_score": app.eligibility_score,
            "eligibility_status": app.eligibility_status,
            "approval_status": app.approval_status,
            "document_verified": app.document_verified,
            "manager_notes": app.manager_notes
        }
        
        # Generate report
        # Generate or fetch AI analysis and attach to report data
        try:
            analysis_resp = await generate_ai_analysis(application_id, db)
            if isinstance(analysis_resp, dict):
                app_data["analysis"] = analysis_resp.get("analysis")
                app_data["analysis_source"] = analysis_resp.get("source")
                app_data["llm_error"] = analysis_resp.get("llm_error")
        except Exception as e:
            # Don't fail report generation for analysis issues; log and continue
            logger.warning(f"Failed to generate AI analysis for report: {e}")

        try:
            report_path = report_service.generate_report(app_data)
        except RuntimeError as e:
            # Surface PDF generation errors (e.g., PDF library missing or conversion failed)
            logger.error(f"PDF generation failed for application {application_id}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"PDF generation failed: {str(e)}"
            )

        # Update application with report path
        app.report_path = report_path
        db.commit()

        logger.info(f"Report generated for application {application_id}")

        return {
            "report_path": report_path,
            "report_url": f"/static/reports/{Path(report_path).name}",
            "generated_at": app.updated_at
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(e)}"
        )


@router.get("/download/{application_id}")
async def download_report(
    application_id: int,
    db: Session = Depends(get_db)
):
    """
    Download PDF report for an application
    """
    try:
        # Get application
        app = db.query(LoanApplication).filter(
            LoanApplication.id == application_id
        ).first()
        
        if not app:
            raise HTTPException(
                status_code=404,
                detail="Application not found"
            )
        
        if not app.report_path:
            raise HTTPException(
                status_code=404,
                detail="Report not generated yet"
            )
        
        report_file = Path(app.report_path)
        
        if not report_file.exists():
            raise HTTPException(
                status_code=404,
                detail="Report file not found"
            )
        
        logger.info(f"Report downloaded for application {application_id}")
        
        # Serve according to file type (PDF or HTML fallback)
        if report_file.suffix.lower() == ".pdf":
            return FileResponse(
                path=report_file,
                filename=f"loan_report_{application_id}.pdf",
                media_type="application/pdf",
            )
        else:
            return FileResponse(
                path=report_file,
                filename=f"loan_report_{application_id}.html",
                media_type="text/html; charset=utf-8",
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report download error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Report download failed"
        )


@router.post("/analysis/{application_id}")
async def generate_ai_analysis(
    application_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate an AI narrative analysis for a loan application's result.

    Returns a markdown/plain text explanation covering key drivers,
    risks, and actionable recommendations tailored to the applicant data.
    """
    try:
        app = db.query(LoanApplication).filter(LoanApplication.id == application_id).first()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")

        context = {
            "Applicant": app.full_name,
            "Annual Income": app.annual_income,
            "Monthly Income": app.monthly_income,
            "Credit Score": app.credit_score,
            "Loan Amount Requested": app.loan_amount_requested or app.loan_amount,
            "Loan Tenure (years)": app.loan_tenure_years,
            "Employment": app.employment_status or app.employment_type,
            "Dependents": app.num_dependents or app.dependents,
            "Region": app.region,
            "Loan Purpose": app.loan_purpose,
            "Existing EMI": app.existing_emi,
            "DTI": app.debt_to_income_ratio,
            "Avg Balance": app.avg_balance,
            "Bounced Txns": app.bounced_transactions,
            "Account Age (months)": app.account_age_months,
            "Eligibility Score": app.eligibility_score,
            "Eligibility Status": app.eligibility_status,
        }

        prompt = (
            "Provide a concise, applicant-friendly analysis of this loan eligibility result.\n"
            "Include: 1) Summary decision, 2) Top 3 drivers (with rationale), 3) Risk factors, "
            "4) Actionable recommendations to improve eligibility or loan terms, 5) Plain-language explanation of ratios like DTI.\n"
            "Use Indian currency style where applicable, avoid jargon, and keep it to ~150-250 words."
        )

        llm_error = None
        try:
            llm = get_llm_service()  # respects LLM_PROVIDER env
            analysis_text = llm.generate(prompt, context=context)
            if analysis_text and isinstance(analysis_text, str) and analysis_text.strip():
                return {"application_id": application_id, "analysis": analysis_text, "source": "llm"}
        except Exception as e:
            llm_error = str(e)
            logger.warning(f"LLM analysis unavailable, falling back to heuristic: {e}")

        # Heuristic fallback analysis
        try:
            score = float(context.get("Eligibility Score") or app.eligibility_score or 0)
        except Exception:
            score = float(app.eligibility_score or 0)
        status = (app.eligibility_status or ("eligible" if score >= 0.5 else "ineligible")).title()
        dti = app.debt_to_income_ratio or 0
        dti_pct = int(round((dti or 0) * 100))
        dti_band = (
            "Good" if dti <= 0.36 else "Borderline" if dti <= 0.43 else "High"
        )
        mi = app.monthly_income or 0
        emi = app.existing_emi or 0
        loan_amt = app.loan_amount_requested or app.loan_amount or 0
        tenure = app.loan_tenure_years or 0
        cs = app.credit_score or 0

        recommendations = []
        if dti > 0.43:
            recommendations.append(
                "Reduce monthly debt obligations or consider a lower loan amount to bring DTI below 40%."
            )
        if cs and cs < 700:
            recommendations.append(
                "Improve credit score (e.g., on-time payments, lower utilization) to access better terms."
            )
        if not app.document_verified:
            recommendations.append("Upload documents to finalize verification and improve confidence.")
        if not recommendations:
            recommendations.append("Proceed with final review; profile appears balanced.")

        analysis_lines = [
            f"Decision: {status} (Score: {int(round(score * 100))}%).",
            f"DTI: {dti_pct}% ({dti_band}). Monthly Income: ₹{int(mi):,}; Existing EMI: ₹{int(emi):,}.",
            f"Requested Loan: ₹{int(loan_amt):,} over {tenure} years; Credit Score: {cs}.",
            "Recommendations:",
        ] + [f"- {r}" for r in recommendations]

        return {
            "application_id": application_id,
            "analysis": "\n".join(analysis_lines),
            "source": "heuristic",
            "llm_error": llm_error,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI analysis generation error: {e}")
        raise HTTPException(status_code=500, detail="AI analysis generation failed")
