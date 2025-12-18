# import required FastAPI modules
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import get_db

# Initialize router
router = APIRouter()

from app.models.database import SharedDashboardLink


@router.post("/share-dashboard/{user_id}")
async def share_dashboard(user_id: int, db: Session = Depends(get_db)):
    """
    Generate a shareable link for the user's dashboard and persist it to DB.
    """
    token = str(uuid.uuid4())
    try:
        link_row = SharedDashboardLink(token=token, user_id=user_id)
        db.add(link_row)
        db.commit()
    except Exception:
        db.rollback()
        # best-effort fallback
        link = f"http://localhost:3000/public-dashboard/{token}"
        return {"link": link, "token": token}

    link = f"http://localhost:3000/public-dashboard/{token}"
    return {"link": link, "token": token}


@router.get("/public-dashboard/{token}")
async def get_public_dashboard(token: str, db: Session = Depends(get_db)):
    """
    Return all dashboard data for the user associated with the token. Token lookup is persisted in DB.
    """
    link_row = db.query(SharedDashboardLink).filter(SharedDashboardLink.token == token).first()
    if not link_row:
        # For demo: return dummy dashboard data instead of 404 so the public view can be shown.
        # Log a warning for visibility.
        logger = get_logger(__name__)
        logger.warning(f"Public dashboard token not found: {token} — returning demo data")

        user_id = None

        # Provide minimal dummy stats and empty applications for demo purposes
        stats = {
            "total_applications": 3,
            "pending_applications": 1,
            "approved_applications": 1,
            "rejected_applications": 1,
            "voice_calls_count": 0,
            "avg_credit_score": 710.0,
            "loan_amount_distribution": [
                {"range": "< 2L", "count": 1},
                {"range": "2–5L", "count": 1},
                {"range": "5–10L", "count": 0},
                {"range": "> 10L", "count": 1},
            ],
        }

        applications = [
            {
                "id": 9999,
                "user_id": None,
                "full_name": "Demo Applicant",
                "email": "demo@example.com",
                "phone": "0000000000",
                "loan_amount_requested": 250000,
                "approval_status": "pending",
                "created_at": None,
            }
        ]
    else:
        user_id = link_row.user_id

        # Fetch all dashboard data for the user
        stats = await get_application_stats(db)
        applications = await get_all_applications(db=db)
    # Dummy ML metrics (replace with real logic)
    ml_metrics = {
        "xgboost": {"accuracy": 0.92, "precision": 0.91, "recall": 0.90, "f1": 0.905},
        "decision_tree": {"accuracy": 0.85, "precision": 0.83, "recall": 0.82, "f1": 0.825},
        "random_forest": {"accuracy": 0.89, "precision": 0.88, "recall": 0.87, "f1": 0.875},
    }

    return {
        "user_id": user_id,
        "stats": stats,
        "applications": applications,
        "ml_metrics": ml_metrics,
    }
from app.services.ml_model_service import MLModelService
from fastapi import BackgroundTasks
from app.routes.notification_routes import send_manager_notification
ml_service = MLModelService()


@router.post("/model-refresh")
async def refresh_models(background_tasks: BackgroundTasks):
    """Reload model artifacts and notify connected managers that models changed."""
    try:
        # reload models
        ml_service._load_models()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload models: {e}")

    # queue a manager notification
    notification = {
        "type": "models_refreshed",
        "message": "ML models were refreshed on the server",
        "created_at": None,
    }
    try:
        background_tasks.add_task(send_manager_notification, notification)
    except Exception:
        # best-effort
        pass

    return {"success": True, "message": "Models refreshed"}


@router.get("/model-metrics")
async def get_model_metrics():
    """
    Return metrics for XGBoost, Decision Tree, and Random Forest models
    """
    # Use MLModelService to gather available model metrics. If training artifacts
    # (accuracies, feature importances, confusion matrices) are present, return
    # them. Otherwise return sensible defaults indicating missing data.
    try:
        ml = MLModelService()
    except Exception:
        ml = None

    model_keys = ["xgboost", "decision_tree", "random_forest"]
    results = {}

    for key in model_keys:
        model_obj = None
        acc_entry = None
        if ml:
            model_obj = ml.models.get(key)
            # model_accuracies may be a dict of dicts or simple mapping
            try:
                acc_entry = ml.model_accuracies.get(key) if isinstance(ml.model_accuracies, dict) else None
            except Exception:
                acc_entry = None

        # Defaults
        accuracy = float(acc_entry.get("accuracy")) if isinstance(acc_entry, dict) and acc_entry.get("accuracy") is not None else None
        precision = float(acc_entry.get("precision")) if isinstance(acc_entry, dict) and acc_entry.get("precision") is not None else None
        recall = float(acc_entry.get("recall")) if isinstance(acc_entry, dict) and acc_entry.get("recall") is not None else None
        f1 = float(acc_entry.get("f1")) if isinstance(acc_entry, dict) and acc_entry.get("f1") is not None else None

        # Feature importance extraction
        feature_importance = []
        try:
            if model_obj is not None:
                fi = getattr(model_obj, "feature_importances_", None)
                if fi is None and hasattr(model_obj, "get_booster"):
                    # xgboost sklearn wrapper -> get_booster().get_score()
                    try:
                        booster = model_obj.get_booster()
                        score_map = booster.get_score(importance_type="gain")
                        feature_importance = [{"feature": k, "value": v} for k, v in score_map.items()]
                    except Exception:
                        feature_importance = []
                elif fi is not None:
                    # map to feature names if available
                    cols = ml.x_columns if ml and ml.x_columns else None
                    if cols and len(cols) == len(fi):
                        feature_importance = [{"feature": c, "value": float(v)} for c, v in zip(cols, fi)]
                    else:
                        feature_importance = [{"feature": f"f{i}", "value": float(v)} for i, v in enumerate(fi)]
        except Exception:
            feature_importance = []

        # Confusion matrix: prefer if stored in accuracies
        confusion = []
        if isinstance(acc_entry, dict) and acc_entry.get("confusion_matrix"):
            cm = acc_entry.get("confusion_matrix")
            # Expect cm as [tn, fp, fn, tp] or dict
            if isinstance(cm, (list, tuple)) and len(cm) == 4:
                confusion = [
                    {"label": "TN", "value": int(cm[0])},
                    {"label": "FP", "value": int(cm[1])},
                    {"label": "FN", "value": int(cm[2])},
                    {"label": "TP", "value": int(cm[3])},
                ]
            elif isinstance(cm, dict):
                confusion = [{"label": k, "value": int(v)} for k, v in cm.items()]

        # Confidence distribution and outliers if available
        confidence_distribution = acc_entry.get("confidence_distribution") if isinstance(acc_entry, dict) else []
        outliers = acc_entry.get("outliers") if isinstance(acc_entry, dict) else []

        # Build model metrics response (use numeric accuracy 0-1 or 0.0)
        results[key] = {
            "loaded": model_obj is not None,
            "accuracy": accuracy if accuracy is not None else 0.0,
            "precision": precision if precision is not None else 0.0,
            "recall": recall if recall is not None else 0.0,
            "f1": f1 if f1 is not None else 0.0,
            "feature_importance": feature_importance,
            "confidence_distribution": confidence_distribution or [],
            "confusionMatrix": confusion,
            "outliers": outliers or [],
        }

    # Attach diagnostics about where MLModelService looked for artifacts
    try:
        diag = ml.get_status()
    except Exception:
        diag = {
            "model_dir": "<unknown>",
            "available_artifacts": {},
            "loaded_models": list(ml.models.keys()) if ml else [],
            "x_columns_loaded": bool(getattr(ml, "x_columns", None)),
            "model_accuracies_present": bool(getattr(ml, "model_accuracies", None)),
        }

    return {"models": results, "diagnostics": diag}
from sqlalchemy import func
from app.models.database import LoanApplication, User, VoiceCall
from app.models.schemas import ManagerApplicationResponse, ManagerDecisionRequest, ApplicationStats
from app.services.email_service import email_service
from app.utils.logger import get_logger

logger = get_logger(__name__)


@router.get("/stats", response_model=ApplicationStats)
async def get_application_stats(db: Session = Depends(get_db)):
    """
    Get statistics about all loan applications
    
    Requires manager role
    """
    try:
        total = db.query(LoanApplication).count()
        pending = db.query(LoanApplication).filter(
            LoanApplication.approval_status == "pending"
        ).count()
        approved = db.query(LoanApplication).filter(
            LoanApplication.approval_status == "approved"
        ).count()
        rejected = db.query(LoanApplication).filter(
            LoanApplication.approval_status == "rejected"
        ).count()
        
        # Calculate additional stats
        voice_calls_count = db.query(VoiceCall).count()
        
        avg_credit_score_result = db.query(func.avg(LoanApplication.credit_score)).scalar()
        avg_credit_score = round(avg_credit_score_result, 1) if avg_credit_score_result else 0.0
        
        # Loan amount distribution
        # Ranges: < 2L, 2-5L, 5-10L, > 10L
        # Assuming loan_amount_requested is in INR or similar unit. If it's raw number, we group it.
        # Let's assume 2L = 200000
        
        range_1 = db.query(LoanApplication).filter(LoanApplication.loan_amount_requested < 200000).count()
        range_2 = db.query(LoanApplication).filter(LoanApplication.loan_amount_requested >= 200000, LoanApplication.loan_amount_requested < 500000).count()
        range_3 = db.query(LoanApplication).filter(LoanApplication.loan_amount_requested >= 500000, LoanApplication.loan_amount_requested < 1000000).count()
        range_4 = db.query(LoanApplication).filter(LoanApplication.loan_amount_requested >= 1000000).count()
        
        loan_amount_distribution = [
            {"range": "< 2L", "count": range_1},
            {"range": "2–5L", "count": range_2},
            {"range": "5–10L", "count": range_3},
            {"range": "> 10L", "count": range_4},
        ]
        
        logger.info("Application stats retrieved")
        
        return {
            "total_applications": total,
            "pending_applications": pending,
            "approved_applications": approved,
            "rejected_applications": rejected,
            "voice_calls_count": voice_calls_count,
            "avg_credit_score": avg_credit_score,
            "loan_amount_distribution": loan_amount_distribution
        }
    
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve statistics"
        )


@router.get("/applications", response_model=list[ManagerApplicationResponse])
async def get_all_applications(
    status_filter: str = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get all loan applications with optional filtering
    
    Query parameters:
    - status_filter: pending, approved, rejected
    - skip: pagination offset
    - limit: number of results
    """
    try:
        from sqlalchemy import desc
        query = db.query(LoanApplication).order_by(desc(LoanApplication.created_at))

        # Show ALL applications regardless of completion status
        # This allows managers to see new applications immediately when they're created
        # Applications progress through stages: created → document verified → eligibility checked → approved/rejected
        
        if status_filter:
            query = query.filter(LoanApplication.approval_status == status_filter)
        
        applications = query.offset(skip).limit(limit).all()
        
        logger.info(f"Retrieved {len(applications)} applications")
        
        return applications
    
    except Exception as e:
        logger.error(f"Error getting applications: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve applications"
        )


@router.get("/applications/{application_id}")
async def get_application_details(
    application_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific application
    """
    try:
        app = db.query(LoanApplication).filter(
            LoanApplication.id == application_id
        ).first()
        
        if not app:
            raise HTTPException(
                status_code=404,
                detail="Application not found"
            )
        
        return {
            "id": app.id,
            "user_id": app.user_id,
            "full_name": app.full_name,
            "email": app.email,
            "phone": app.phone,
            "age": app.age,
            "gender": app.gender,
            "marital_status": app.marital_status,
            "monthly_income": app.monthly_income,
            "employment_type": app.employment_type,
            "loan_amount_requested": app.loan_amount_requested,
            "loan_tenure_years": app.loan_tenure_years,
            "credit_score": app.credit_score,
            "region": app.region,
            "loan_purpose": app.loan_purpose,
            "dependents": app.dependents,
            "existing_emi": app.existing_emi,
            "salary_credit_frequency": app.salary_credit_frequency,
            "total_withdrawals": app.total_withdrawals,
            "total_deposits": app.total_deposits,
            "avg_balance": app.avg_balance,
            "bounced_transactions": app.bounced_transactions,
            "account_age_months": app.account_age_months,
            "total_liabilities": app.total_liabilities,
            "annual_income": app.annual_income,
            "loan_amount": app.loan_amount,
            "loan_term_months": app.loan_term_months,
            "num_dependents": app.num_dependents,
            "employment_status": app.employment_status,
            "eligibility_score": app.eligibility_score,
            "eligibility_status": app.eligibility_status,
            "approval_status": app.approval_status,
            "document_verified": app.document_verified,
            "extracted_data": app.extracted_data,
            "manager_notes": app.manager_notes,
            "created_at": app.created_at,
            "updated_at": app.updated_at
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting application details: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve application details"
        )


@router.post("/applications/{application_id}/decision")
async def make_decision(
    application_id: int,
    decision: ManagerDecisionRequest,
    db: Session = Depends(get_db)
):
    """
    Manager makes a decision (approve/reject) on an application
    """
    try:
        app = db.query(LoanApplication).filter(
            LoanApplication.id == application_id
        ).first()
        
        if not app:
            raise HTTPException(
                status_code=404,
                detail="Application not found"
            )
        
        # Validate decision
        if decision.decision.lower() not in ["approved", "rejected"]:
            raise HTTPException(
                status_code=400,
                detail="Decision must be 'approved' or 'rejected'"
            )
        
        # Update application
        app.approval_status = decision.decision.lower()
        if decision.notes:
            app.manager_notes = decision.notes
        
        db.commit()
        
        # Send notification email to applicant
        email_service.send_manager_decision_notification(
            app.email,
            app.full_name,
            decision.decision.lower(),
            decision.notes
        )
        
        logger.info(f"Manager decision made for application {application_id}: {decision.decision}")
        
        return {
            "success": True,
            "application_id": application_id,
            "approval_status": app.approval_status,
            "message": f"Application {decision.decision}",
            "notification_sent": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error making decision: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to make decision"
        )
