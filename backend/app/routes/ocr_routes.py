"""
OCR Routes for document verification (FIXED & STABLE VERSION)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from app.models.database import get_db, LoanApplication
from app.services.ocr_service import OCRService
from app.utils.logger import get_logger
from pathlib import Path

logger = get_logger(__name__)
router = APIRouter()

ocr_service = OCRService()

# Helper: normalize uploaded document item
def normalize_doc_item(item):
    """Return string doc id for both dict and string formats."""
    if isinstance(item, dict):
        return item.get("id")
    if isinstance(item, str):
        return item
    return None


@router.post("/document")
async def upload_document_no_app(
    file: UploadFile = File(...),
):
    """
    Upload and verify a document WITHOUT linking to an application.
    """
    try:
        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")

        # Validate file format
        ext = Path(file.filename).suffix.lower()
        if ext not in ocr_service.supported_formats:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Allowed formats: {sorted(ocr_service.supported_formats)}"
            )

        uploads_dir = Path(__file__).parent.parent / "static" / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        file_path = uploads_dir / f"unlinked_{file.filename}"

        with open(file_path, "wb") as f:
            f.write(await file.read())

        # OCR quality check
        is_valid, quality_metrics = ocr_service.verify_document_quality(str(file_path))

        # Extract data
        extracted_data = ocr_service.extract_document_data(str(file_path)) or {}

        status = "success" if is_valid else "quality_warning"
        flat = {
            "document_type": extracted_data.get("document_type"),
            "fields": extracted_data.get("fields", {}),
            "full_text": extracted_data.get("full_text", ""),
        }

        return {
            **flat,
            "extracted_data": extracted_data,
            "confidence_scores": {"overall": 0.85, "text_extraction": 0.90},
            "verification_status": status,
            "quality_metrics": quality_metrics,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document verification (no app) error: {e}")
        raise HTTPException(status_code=500, detail=f"Document verification failed: {str(e)}")


@router.post("/document/{application_id}")
async def verify_document(
    application_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload and verify a document WITH an application.
    """
    try:
        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")

        # Validate application
        app = db.query(LoanApplication).filter(LoanApplication.id == application_id).first()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")

        # Validate file type
        ext = Path(file.filename).suffix.lower()
        if ext not in ocr_service.supported_formats:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Allowed formats: {sorted(ocr_service.supported_formats)}"
            )

        # Save file
        uploads_dir = Path(__file__).parent.parent / "static" / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        file_path = uploads_dir / f"app_{application_id}_{file.filename}"

        with open(file_path, "wb") as f:
            f.write(await file.read())

        # OCR quality check
        is_valid, quality_metrics = ocr_service.verify_document_quality(str(file_path))

        # Extract structured data
        extracted_data = ocr_service.extract_document_data(str(file_path)) or {}

        # ---------- FIX START: Prevent "unhashable type: dict" ----------
        prev_data = app.extracted_data if isinstance(app.extracted_data, dict) else {}
        uploaded_docs = prev_data.get("uploaded_documents", [])
        if not isinstance(uploaded_docs, list):
            uploaded_docs = []
        # ---------------------------------------------------------------

        # Document type normalization
        doc_type_raw = (extracted_data.get("document_type") or "").strip()
        doc_type_map = {
            "Aadhaar": "aadhaar",
            "Aadhaar Card": "aadhaar",
            "PAN": "pan",
            "PAN Card": "pan",
            "KYC": "kyc",
            "Bank Statement": "bank_statement",
            "Salary Slip": "salary_slip",
        }
        doc_type = doc_type_map.get(doc_type_raw, doc_type_raw.lower().replace(" ", "_"))

        # Add uploaded file metadata
        if doc_type:
            from datetime import datetime
            meta_obj = {
                "id": doc_type,
                "filename": file.filename,
                "path": str(file_path),
                "uploaded_at": datetime.utcnow().isoformat() + "Z",
            }

            # Avoid duplicates
            if not any(
                (isinstance(x, dict) and x.get("id") == doc_type)
                or (isinstance(x, str) and x == doc_type)
                for x in uploaded_docs
            ):
                uploaded_docs.append(meta_obj)

        # Merge extraction + metadata
        merged_extracted = dict(prev_data)
        merged_extracted.update(extracted_data)
        merged_extracted["uploaded_documents"] = uploaded_docs

        # Store in DB
        app.document_path = str(file_path)
        app.extracted_data = merged_extracted

        # ---------- FIX: Normalize IDs before checking verification ----------
        normalized_ids = {normalize_doc_item(x) for x in uploaded_docs if normalize_doc_item(x)}
        identity_group = {"aadhaar", "pan", "kyc"}
        financial_group = {"bank_statement", "salary_slip"}

        has_identity = bool(normalized_ids & identity_group)
        has_financial = bool(normalized_ids & financial_group)

        app.document_verified = has_identity and has_financial
        # --------------------------------------------------------------------

        db.commit()

        status = "success" if is_valid else "quality_warning"
        flat = {
            "document_type": merged_extracted.get("document_type"),
            "fields": merged_extracted.get("fields", {}),
            "full_text": merged_extracted.get("full_text", ""),
        }

        return {
            **flat,
            "extracted_data": merged_extracted,
            "verification_status": status,
            "quality_metrics": quality_metrics,
            "confidence_scores": {"overall": 0.85, "text_extraction": 0.90},
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document verification error: {e}")
        raise HTTPException(status_code=500, detail=f"Document verification failed: {str(e)}")


@router.get("/status")
async def ocr_status():
    """Check OCR service availability."""
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return {
            "ocr_enabled": True,
            "service": "tesseract",
            "message": "Tesseract OCR is available",
        }
    except Exception:
        return {
            "ocr_enabled": False,
            "service": "tesseract",
            "message": "Tesseract not installed",
        }
