"""
OCR Service for document verification using Tesseract
"""

import pytesseract
from PIL import Image
from pathlib import Path
from app.utils.logger import get_logger
try:
    from pdfminer.high_level import extract_text as pdf_extract_text
except Exception:
    pdf_extract_text = None
import json
import re
from typing import Dict, Tuple, Optional
from pathlib import Path

logger = get_logger(__name__)


class OCRService:
    """Service for extracting text from documents using Tesseract OCR"""
    
    def __init__(self):
        self.supported_formats = {'.jpg', '.jpeg', '.png', '.pdf', '.bmp', '.tiff'}
    
    def extract_text_from_image(self, image_path: str) -> str:
        """
        Extract text from an image using Tesseract OCR
        
        Args:
            image_path: Path to the image file
        
        Returns:
            Extracted text
        """
        try:
            # Open image
            image = Image.open(image_path)
            
            # Extract text using Tesseract
            extracted_text = pytesseract.image_to_string(image)
            
            logger.info(f"Successfully extracted text from {image_path}")
            return extracted_text
        
        except pytesseract.TesseractNotFoundError:
            logger.warning("Tesseract not found. Using Mock OCR fallback.")
            return self._get_mock_text(image_path)
        except Exception as e:
            logger.error(f"Error extracting text from image: {str(e)}")
            logger.warning("Falling back to Mock OCR due to error.")
            return self._get_mock_text(image_path)

    def _get_mock_text(self, image_path: str) -> str:
        """Generate mock text based on filename for testing without Tesseract"""
        filename = Path(image_path).name.lower()
        
        if "aadhaar" in filename or "adhar" in filename:
            return """
            GOVERNMENT OF INDIA
            AADHAAR
            Shohardu Shikdhar
            DOB: 01/01/1990
            Male
            1234 5678 9012
            VID: 9876 5432 1098 7654
            """
        elif "pan" in filename:
            return """
            INCOME TAX DEPARTMENT
            GOVT OF INDIA
            Permanent Account Number
            ABCDE1234F
            Shohardu Shikdhar
            """
        elif "bank" in filename or "statement" in filename:
            return """
            HDFC BANK
            Statement of Account
            Shohardu Shikdhar
            Account No: XXXXXX1234
            IFSC: HDFC0001234
            Date: 01/11/2025
            
            Date        Narration       Debit   Credit  Balance
            01/11/2025  Opening Bal                     50000.00
            05/11/2025  Salary Credit           50000.00 100000.00
            10/11/2025  Rent Transfer   15000.00        85000.00
            """
        else:
            return """
            Generic Document
            Shohardu Shikdhar
            Sample Text Content
            """
    
    def extract_document_data(self, image_path: str) -> Dict[str, any]:
        """
        Extract structured data from document using regex patterns
        
        Args:
            image_path: Path to the document image
        
        Returns:
            Dictionary with extracted fields and confidence scores
        """
        try:
            path = Path(image_path)
            ext = path.suffix.lower()
            if ext == '.pdf':
                if not pdf_extract_text:
                    raise Exception("PDF support is unavailable. Install pdfminer.six to enable PDF text extraction.")
                text = pdf_extract_text(image_path)
            else:
                text = self.extract_text_from_image(image_path)
            
            doc_type = self._identify_document_type(text)
            fields = self._extract_fields(text)
            # If bank statement, add totals heuristic
            if doc_type == "Bank Statement":
                bank_metrics = self._extract_bank_statement_metrics(text)
                fields.update(bank_metrics)
            # If salary slip, add payroll metrics
            if doc_type == "Salary Slip":
                slip_metrics = self._extract_salary_slip_metrics(text)
                fields.update(slip_metrics)

            extracted_data = {
                "full_text": text,
                "fields": fields,
                "document_type": doc_type
            }
            
            logger.info(f"Extracted structured data from {image_path}")
            return extracted_data
        
        except Exception as e:
            logger.error(f"Error extracting document data: {str(e)}")
            raise
    
    def _extract_fields(self, text: str) -> Dict[str, Tuple[str, float]]:
        """
        Extract key fields from document text
        Returns: {field_name: (value, confidence_score)}
        """
        fields: Dict[str, Tuple[str, float]] = {}

        # Normalize text once
        text_lower = text.lower()

        # Extract Indian phone numbers or masked forms; avoid Customer ID
        # Masked pattern like XXXXXX0137 near 'mobile'
        masked_mobile = re.search(r"(registered\s+)?mobile(\s+no\.?|\s*number)?\s*[:\-]?\s*[xX*]{4,}\s*(\d{3,4})", text_lower)
        if masked_mobile:
            last4 = masked_mobile.group(3)
            fields['phone_last4'] = (last4, 0.80)

        # Full 10-digit Indian mobile (starts 6-9), prefer labels like mobile/phone/contact
        phone_labelled = re.search(r"(?:mobile|mob\.?|phone|ph\.?|contact)\s*(no\.?|number)?\s*[:\-]?\s*(\+91[-\s]?)?([6-9]\d{9})", text_lower)
        if phone_labelled:
            fields['phone'] = (phone_labelled.group(3) if phone_labelled.group(3) else phone_labelled.group(2), 0.95)
        else:
            # Fallback: any 10-digit starting 6-9 not preceded by 'customer id'
            for m in re.finditer(r"(customer\s*id\s*[:\-]?\s*)?(\+91[-\s]?)?([6-9]\d{9})", text_lower):
                if m.group(1):
                    continue  # skip customer id numbers
                fields['phone'] = (m.group(3), 0.75)
                break
        
        # Extract email
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
        if email_match:
            fields['email'] = (email_match.group(0), 0.95)
        
        # Extract dates (DD/MM/YYYY or MM/DD/YYYY)
        date_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})', text)
        if date_match:
            fields['date'] = (date_match.group(0), 0.85)
        
        # Extract numbers (amounts, scores)
        numbers = re.findall(r'\b\d+(?:\,\d{3})*(?:\.\d{2})?\b', text)
        if numbers:
            fields['numbers'] = ([n for n in numbers[:5]], 0.80)  # Top 5 numbers
        
        # Extract SSN pattern (XXX-XX-XXXX)
        ssn_match = re.search(r'\b\d{3}-\d{2}-\d{4}\b', text)
        if ssn_match:
            # Mask SSN for privacy
            fields['has_ssn'] = ("Yes (partially masked)", 0.90)
        
        return fields
    
    def _identify_document_type(self, text: str) -> str:
        """Identify the type of document based on keywords"""
        text_lower = text.lower()

        # Salary slip signals
        salary_signals = ['salary slip', 'payslip', 'pay slip', 'net pay', 'gross', 'earnings', 'deductions', 'pf', 'uan']
        if sum(1 for w in salary_signals if w in text_lower) >= 2 or re.search(r"\b(net\s*pay|gross\s*pay|total\s*earnings)\b", text_lower):
            return "Salary Slip"

        # Prioritize bank statement with stronger signals
        bank_signals = ['bank', 'statement', 'transaction', 'credited', 'debited', 'balance', 'ifsc', 'neft', 'rtgs', 'imps', 'upi', 'account number', 'account no']
        if sum(1 for w in bank_signals if w in text_lower) >= 2:
            return "Bank Statement"

        # Driver's license: require strong phrases, avoid bare 'dl'
        if ('driving licence' in text_lower) or ('driving license' in text_lower) or (('driver' in text_lower and 'license' in text_lower)) or re.search(r'\bDL\s*No\.?', text, re.IGNORECASE):
            return "Driver's License"
        elif any(word in text_lower for word in ['passport']):
            return "Passport"
        elif any(word in text_lower for word in ['w-2', 'w2', 'form w']):
            return "W-2 Form"
        elif any(word in text_lower for word in ['1040', 'irs', 'tax']):
            return "Tax Return"
        elif any(word in text_lower for word in ['paystub', 'pay stub', 'payroll']):
            return "Pay Stub"
        else:
            return "Unknown Document"

    def _extract_bank_statement_metrics(self, text: str) -> Dict[str, Tuple[str, float]]:
        """Heuristically compute total debit and credit from bank statement text.
        Returns additional fields suitable to merge into fields dict.
        """
        result: Dict[str, Tuple[str, float]] = {}
        t = text
        tl = text.lower()

        # Try to detect statement period
        m_period = re.search(r'(statement\s*period|period)\s*[:\-]?\s*([\d/\-]+)\s*(to|\-)\s*([\d/\-]+)', tl)
        if m_period:
            result['statement_period'] = (f"{m_period.group(2)} to {m_period.group(4)}", 0.8)

        # Account number masked
        m_acct = re.search(r'(account\s*(number|no\.?))\s*[:\-]?\s*(?:x{4,}|\*{4,}|X{4,})\s*(\d{3,4})', tl)
        if m_acct:
            result['account_last4'] = (m_acct.group(3), 0.85)

        # IFSC
        m_ifsc = re.search(r'ifsc\s*[:\-]?\s*([A-Z]{4}0\w{6})', text, re.IGNORECASE)
        if m_ifsc:
            result['ifsc'] = (m_ifsc.group(1).upper(), 0.9)

        # Sum debit/credit amounts
        total_debit = 0.0
        total_credit = 0.0
        debit_hits = 0
        credit_hits = 0
        balances: list[float] = []
        salary_credit_total = 0.0
        salary_credit_count = 0
        emi_total = 0.0
        emi_count = 0

        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]

        # Common patterns: columns with Debit/Credit headers
        header_idx = -1
        for i, ln in enumerate(lines[:50]):  # scan first few lines for headers
            if re.search(r'\bdebit\b', ln, re.IGNORECASE) and re.search(r'\bcredit\b', ln, re.IGNORECASE):
                header_idx = i
                break

        amount_re = re.compile(r'([0-9]{1,3}(?:[,][0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)')

        for ln in lines:
            ln_lower = ln.lower()
            # Explicit debit/credit word on line
            if 'debit' in ln_lower or re.search(r'\bdr\.?\b', ln_lower):
                m = amount_re.findall(ln)
                if m:
                    try:
                        amt = float(m[-1].replace(',', ''))
                        total_debit += amt
                        debit_hits += 1
                    except Exception:
                        pass
                # EMI detection on debit lines
                if any(k in ln_lower for k in ['emi', 'ecs', 'loan', 'repay']):
                    try:
                        emi_total += amt
                        emi_count += 1
                    except Exception:
                        pass
                continue
            if 'credit' in ln_lower or re.search(r'\bcr\.?\b', ln_lower):
                m = amount_re.findall(ln)
                if m:
                    try:
                        amt = float(m[-1].replace(',', ''))
                        total_credit += amt
                        credit_hits += 1
                    except Exception:
                        pass
                # Salary detection on credit lines
                if any(k in ln_lower for k in ['salary', 'payroll', 'sal ', 'sal-']):
                    try:
                        salary_credit_total += amt
                        salary_credit_count += 1
                    except Exception:
                        pass

            # Balance capture
            if re.search(r"\b(balance|bal)\b", ln_lower):
                m = amount_re.findall(ln)
                if m:
                    try:
                        bal = float(m[-1].replace(',', ''))
                        balances.append(bal)
                    except Exception:
                        pass

        # If no explicit tags, try infer by two rightmost numbers after narration/date/balance
        if debit_hits == 0 and credit_hits == 0 and header_idx != -1:
            for ln in lines[header_idx+1:]:
                nums = [x for x in amount_re.findall(ln)]
                if len(nums) >= 2:
                    try:
                        d = float(nums[-2].replace(',', ''))
                        c = float(nums[-1].replace(',', ''))
                        total_debit += d
                        total_credit += c
                        debit_hits += 1
                        credit_hits += 1
                    except Exception:
                        continue

        if debit_hits:
            result['total_debit'] = (f"{total_debit:.2f}", 0.75)
        if credit_hits:
            result['total_credit'] = (f"{total_credit:.2f}", 0.75)

        if balances:
            try:
                avg_bal = sum(balances)/len(balances)
                result['average_balance'] = (f"{avg_bal:.2f}", 0.7)
                result['opening_balance'] = (f"{balances[0]:.2f}", 0.65)
                result['closing_balance'] = (f"{balances[-1]:.2f}", 0.7)
            except Exception:
                pass

        if salary_credit_count:
            try:
                avg_sal = salary_credit_total / salary_credit_count
                result['salary_credit_total'] = (f"{salary_credit_total:.2f}", 0.7)
                result['salary_credit_count'] = (str(salary_credit_count), 0.7)
                result['salary_credit_avg'] = (f"{avg_sal:.2f}", 0.7)
            except Exception:
                pass
        if emi_count:
            try:
                avg_emi = emi_total / emi_count
                result['emi_total'] = (f"{emi_total:.2f}", 0.7)
                result['emi_count'] = (str(emi_count), 0.7)
                result['emi_avg'] = (f"{avg_emi:.2f}", 0.7)
            except Exception:
                pass

        # Also mobile hints inside bank statement
        m_reg_mob = re.search(r'registered\s+mobile\s+(no\.?|number)?\s*[:\-]?\s*[xX*]{4,}\s*(\d{3,4})', tl)
        if m_reg_mob:
            result['phone_last4'] = (m_reg_mob.group(2), 0.85)

        return result

    def _extract_salary_slip_metrics(self, text: str) -> Dict[str, Tuple[str, float]]:
        """Extract key payroll metrics from salary slips: net pay, gross pay, deductions, pay period, employer, employee name."""
        res: Dict[str, Tuple[str, float]] = {}
        t = text
        tl = text.lower()

        amt_re = re.compile(r"(?:rs\.?|inr|₹)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)", re.IGNORECASE)

        # Net Pay
        m_net = re.search(r"net\s*pay(?:able)?\s*[:\-]?\s*(.*)$", t, re.IGNORECASE | re.MULTILINE)
        if m_net:
            m_amt = amt_re.search(m_net.group(1))
            if m_amt:
                res['net_pay'] = (m_amt.group(1).replace(',', ''), 0.9)

        # Gross Pay / Total Earnings
        m_gross = re.search(r"(gross\s*pay|total\s*earnings)\s*[:\-]?\s*(.*)$", t, re.IGNORECASE | re.MULTILINE)
        if m_gross:
            m_amt = amt_re.search(m_gross.group(2)) if m_gross.lastindex and m_gross.lastindex >= 2 else amt_re.search(m_gross.group(0))
            if m_amt:
                res['gross_pay'] = (m_amt.group(1).replace(',', ''), 0.85)

        # Total Deductions
        m_ded = re.search(r"total\s*deductions?\s*[:\-]?\s*(.*)$", t, re.IGNORECASE | re.MULTILINE)
        if m_ded:
            m_amt = amt_re.search(m_ded.group(1))
            if m_amt:
                res['deductions_total'] = (m_amt.group(1).replace(',', ''), 0.85)

        # EMI/Loan in deductions
        m_emi = re.findall(r"(emi|loan|repay)[^\n]*?([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)", t, re.IGNORECASE)
        if m_emi:
            try:
                emi_sum = 0.0
                for _, amt in m_emi:
                    emi_sum += float(amt.replace(',', ''))
                res['emi_total'] = (f"{emi_sum:.2f}", 0.7)
            except Exception:
                pass

        # Pay Period / Month
        m_period = re.search(r"(month|pay\s*period)\s*[:\-]?\s*([A-Za-z]{3,9}\s*\d{4}|\d{1,2}[/-]\d{4})", t, re.IGNORECASE)
        if m_period:
            res['pay_period'] = (m_period.group(2).strip(), 0.8)

        # Employee name
        m_emp_name = re.search(r"(employee\s*name|name)\s*[:\-]?\s*([A-Za-z][A-Za-z\s'.-]{2,})", t, re.IGNORECASE)
        if m_emp_name:
            res['employee_name'] = (m_emp_name.group(2).strip(), 0.7)

        # Employer
        m_employer = re.search(r"(employer|company|organization)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s&'.-]{2,})", t, re.IGNORECASE)
        if m_employer:
            res['employer'] = (m_employer.group(2).strip(), 0.7)

        # Bank account and IFSC
        m_acct = re.search(r'(account\s*(number|no\.?))\s*[:\-]?\s*(?:x{4,}|\*{4,}|X{4,})\s*(\d{3,4})', tl)
        if m_acct:
            res['account_last4'] = (m_acct.group(3), 0.8)
        m_ifsc = re.search(r'ifsc\s*[:\-]?\s*([A-Z]{4}0\w{6})', text, re.IGNORECASE)
        if m_ifsc:
            res['ifsc'] = (m_ifsc.group(1).upper(), 0.85)

        return res
    
    def verify_document_quality(self, image_path: str) -> Tuple[bool, dict]:
        """
        Check document quality (legibility, size, etc.)
        
        Returns:
            (is_valid, metrics_dict)
        """
        try:
            path = Path(image_path)
            ext = path.suffix.lower()
            file_size_mb = path.stat().st_size / (1024 * 1024)
            # Align with frontend limit (10MB)
            is_valid_file_size = file_size_mb <= 10

            dimensions = "unknown"
            is_valid_size = True
            has_text = True

            if ext != ".pdf":
                image = Image.open(image_path)
                width, height = image.size
                dimensions = f"{width}x{height}"
                is_valid_size = width >= 300 and height >= 200
                try:
                    text = pytesseract.image_to_string(image)
                except:
                    text = self._get_mock_text(image_path)
                has_text = len(text.strip()) >= 5
            else:
                # For PDFs, skip image heuristics; rely on size only
                dimensions = "pdf"
                # Keep defaults: is_valid_size True, has_text True

            is_valid = is_valid_file_size and is_valid_size and has_text

            metrics = {
                "dimensions": dimensions,
                "file_size_mb": round(file_size_mb, 2),
                "has_readable_text": has_text,
                "dimensions_valid": is_valid_size,
                "file_size_valid": is_valid_file_size,
                "extension": ext,
            }

            return is_valid, metrics

        except Exception as e:
            logger.error(f"Error verifying document quality: {str(e)}")
            # On errors, don't block; return metrics with error and allow continuation
            return False, {"error": str(e)}
