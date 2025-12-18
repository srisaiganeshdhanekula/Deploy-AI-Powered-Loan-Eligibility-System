"""
Machine Learning Model Service for loan prediction
"""

import os
import pickle
import numpy as np
import pandas as pd
from typing import Dict, Optional
from pathlib import Path
from sklearn.preprocessing import LabelEncoder, StandardScaler
from app.utils.logger import get_logger

logger = get_logger(__name__)


class MLModelService:
    """Service for loan eligibility prediction using XGBoost, Decision Tree, and Random Forest models"""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.models = {}
        self.model_accuracies = {}
        self.scaler = None
        self.label_encoders = {}
        self.x_columns: list[str] | None = None

        # Define expected features in the order they were trained
        self.expected_features = [
            'Age', 'Gender', 'Marital_Status', 'Employment_Type', 'Monthly_Income',
            'Loan_Amount_Requested', 'Credit_Score', 'Existing_EMI', 'Loan_Tenure_Years',
            'Dependents', 'Region', 'Loan_Purpose', 'Total_Withdrawals', 'Total_Deposits',
            'Avg_Balance', 'Bounced_Transactions', 'Account_Age_Months',
            'Salary_Credit_Frequency', 'Total_Liabilities', 'Debt_to_Income_Ratio',
            'Bank_Verified', 'Document_Verified', 'Voice_Verified'
        ]

        # Categorical features that need label encoding
        self.categorical_features = [
            'Gender', 'Marital_Status', 'Employment_Type', 'Region',
            'Loan_Purpose', 'Salary_Credit_Frequency'
        ]

        # Numerical features that need scaling
        self.numerical_features = [
            'Age', 'Monthly_Income', 'Loan_Amount_Requested', 'Credit_Score',
            'Existing_EMI', 'Loan_Tenure_Years', 'Dependents', 'Total_Withdrawals',
            'Total_Deposits', 'Avg_Balance', 'Bounced_Transactions', 'Account_Age_Months',
            'Total_Liabilities', 'Debt_to_Income_Ratio'
        ]

        self._load_models()

    def _resolve_model_dir(self) -> Path:
        """Resolve the directory where model artifacts are stored.

        Order of precedence:
        1) ML_MODEL_DIR env var (absolute or relative to backend root)
        2) Directory of provided model_path
        3) ../../ml/app/models relative to this file
        4) ./app/models relative to project root as fallback
        """
        # 1) Environment variable
        env_dir = os.getenv("ML_MODEL_DIR")
        if env_dir:
            p = Path(env_dir).expanduser().resolve()
            if p.exists():
                return p

        # 2) If model_path was provided, use its parent
        if self.model_path:
            parent = Path(self.model_path).expanduser().resolve().parent
            if parent.exists():
                return parent

        # 3) Try ../../ml/app/models relative to this file
        candidate = (Path(__file__).resolve().parents[3] / "ml" / "app" / "models")
        if candidate.exists():
            return candidate

        # 4) Fallback to ./app/models under backend
        fallback = (Path(__file__).resolve().parents[1] / "models")
        return fallback

    def _load_models(self):
        """Load all trained models and preprocessing objects from pickle files."""
        model_dir = self._resolve_model_dir()
        # Expose resolved model directory for diagnostics
        self.model_dir = model_dir

        model_files = {
            "xgboost": "loan_xgboost_model.pkl",
            "decision_tree": "loan_decision_tree_model.pkl",
            "random_forest": "loan_random_forest_model.pkl",
        }
        # Track per-file load errors for diagnostics
        self.load_errors = {}

        for key, fname in model_files.items():
            path = model_dir / fname
            if path.exists():
                try:
                    with open(path, "rb") as f:
                        self.models[key] = pickle.load(f)
                    logger.info(f"{key} model loaded from {path}")
                except Exception as e:
                    logger.warning(f"Failed to load {key} model: {e}")
                    # Record full exception string for diagnostics
                    try:
                        import traceback
                        self.load_errors[key] = traceback.format_exc()
                    except Exception:
                        self.load_errors[key] = str(e)
            else:
                logger.warning(f"Model file {fname} not found in {model_dir}")

        # Expose which files exist for debugging
        try:
            self.available_artifacts = {p.name: p.exists() for p in model_dir.iterdir()}
        except Exception:
            self.available_artifacts = {}

        # Load feature columns
        xcols_path = model_dir / "X_columns.pkl"
        if xcols_path.exists():
            try:
                with open(xcols_path, "rb") as f:
                    self.x_columns = pickle.load(f)
                if hasattr(self.x_columns, 'tolist'):
                    self.x_columns = list(self.x_columns)
                logger.info(f"X_columns loaded from {xcols_path} with {len(self.x_columns)} features")
            except Exception as e:
                logger.warning(f"Failed to load X_columns from {xcols_path}: {e}.")
                self.x_columns = None

        # Load model accuracies
        acc_path = model_dir / "model_accuracies.pkl"
        if acc_path.exists():
            try:
                with open(acc_path, "rb") as f:
                    self.model_accuracies = pickle.load(f)
                logger.info(f"Model accuracies loaded from {acc_path}")
            except Exception as e:
                logger.warning(f"Failed to load model accuracies: {e}")
        else:
            logger.warning(f"Model accuracies file not found: {acc_path}")

        # (Scaler/encoder loading unchanged)
        scaler_candidates = [
            model_dir / "scaler.pkl",
            model_dir / "feature_scaler.pkl",
            model_dir / "standard_scaler.pkl",
        ]
        encoders_path = model_dir / "label_encoders.pkl"

        scaler_path = next((p for p in scaler_candidates if p.exists()), None)
        if self.x_columns is not None:
            self.scaler = None
        else:
            if scaler_path and scaler_path.exists():
                try:
                    with open(scaler_path, "rb") as f:
                        self.scaler = pickle.load(f)
                    logger.info(f"Scaler loaded from {scaler_path}")
                except Exception as e:
                    logger.warning(f"Failed to load scaler from {scaler_path}: {e}. Using new StandardScaler.")
                    self.scaler = StandardScaler()
            else:
                logger.warning("Scaler not found, initializing new StandardScaler")
                self.scaler = StandardScaler()

        if encoders_path.exists():
            try:
                with open(encoders_path, "rb") as f:
                    self.label_encoders = pickle.load(f)
                logger.info(f"Label encoders loaded from {encoders_path}")
            except Exception as e:
                logger.warning(f"Failed to load label encoders from {encoders_path}: {e}. Initializing new encoders.")
                for feature in self.categorical_features:
                    self.label_encoders[feature] = LabelEncoder()
        else:
            logger.warning("Label encoders not found, initializing new encoders")
            for feature in self.categorical_features:
                self.label_encoders[feature] = LabelEncoder()

    def get_status(self) -> Dict:
        """Return diagnostic information about model loading for debugging."""
        return {
            "model_dir": str(getattr(self, "model_dir", "<unknown>")),
            "available_artifacts": getattr(self, "available_artifacts", {}),
            "loaded_models": list(self.models.keys()),
            "x_columns_loaded": bool(self.x_columns),
            "model_accuracies_present": bool(self.model_accuracies),
            "load_errors": getattr(self, "load_errors", {}),
        }
    
    def predict_eligibility(self, applicant_data: Dict) -> Dict:
        """
        Predict loan eligibility based on applicant data with 23 features
        Returns a dict with model results and risk info. Adds warnings if models/features are missing.
        """
        try:
            # Auto-calculate DTI if not provided or zero
            dti_in = applicant_data.get('Debt_to_Income_Ratio')
            try:
                dti_num = float(dti_in) if dti_in is not None else 0.0
            except Exception:
                dti_num = 0.0
            if dti_in is None or dti_num == 0.0:
                monthly_income = float(applicant_data.get('Monthly_Income', 0) or 0)
                existing_emi = float(applicant_data.get('Existing_EMI', 0) or 0)
                loan_amount = float(applicant_data.get('Loan_Amount_Requested', 0) or 0)
                tenure_years = float(applicant_data.get('Loan_Tenure_Years', 0) or 0)
                tenure_months = int(max(round(tenure_years * 12), 0))
                monthly_rate = 0.05 / 12 if tenure_months > 0 else 0.0
                if monthly_rate > 0 and tenure_months > 0 and loan_amount > 0:
                    factor = (1 + monthly_rate) ** tenure_months
                    new_emi = (loan_amount * monthly_rate * factor) / (factor - 1)
                else:
                    new_emi = 0.0
                total_monthly_debt = existing_emi + new_emi
                dti_ratio = (total_monthly_debt / monthly_income) if monthly_income > 0 else 0.0
                dti_ratio = float(max(0.0, min(dti_ratio, 5.0)))
                applicant_data['Debt_to_Income_Ratio'] = dti_ratio

            # Check for model/feature loading issues
            warnings = []
            if not self.models or 'xgboost' not in self.models:
                warnings.append('XGBoost model is not loaded. Prediction is not possible.')
            if not self.x_columns:
                warnings.append('Model feature columns (X_columns) are missing. Prediction may be invalid.')
            
            logger.info(f"DEBUG: Models available: {list(self.models.keys())}, X_columns loaded: {self.x_columns is not None}")

            # Prepare features with preprocessing
            if self.x_columns and 'xgboost' in self.models:
                features_df = self._prepare_features_v2(applicant_data)
                logger.info(f"DEBUG: Using v2 feature preparation with {len(self.x_columns)} columns")
            else:
                features_df = self._prepare_features(applicant_data)
                logger.info(f"DEBUG: Using legacy feature preparation")
            
            # Make prediction (use dummy if model not loaded)
            eligibility_score = 0.5  # Default score
            xgb_score = 0.5  # Default score
            model_results = {}
            
            if self.models and 'xgboost' in self.models:
                if self.x_columns is not None:
                    # Use aligned DataFrame directly
                    X = features_df[self.x_columns]
                    
                    # Check for NaN values and log them
                    nan_cols = X.columns[X.isna().any()].tolist()
                    if nan_cols:
                        logger.warning(f"DEBUG: NaN columns detected: {nan_cols}")
                        X = X.fillna(0)  # Fill NaN with 0
                    
                    # DIAGNOSTIC: Log the feature vector
                    row_dict = X.iloc[0].to_dict()
                    logger.info(f"ML PREDICTION INPUT: Income={row_dict.get('Monthly_Income')}, Score={row_dict.get('Credit_Score')}, Amount={row_dict.get('Loan_Amount_Requested')}, DTI={row_dict.get('Debt_to_Income_Ratio')}")
                    logger.info(f"DEBUG: Full feature dict: {row_dict}")

                    pred_proba = self.models['xgboost'].predict_proba(X)
                    eligibility_score = float(pred_proba[0][1])
                    # Cap at 95% for realistic scoring (no perfect 100% scores)
                    eligibility_score = min(eligibility_score, 0.95)
                    logger.info(f"DEBUG: Raw model output: {pred_proba}, Eligibility score: {eligibility_score}")
                    xgb_score = eligibility_score
                    model_results = {'xgboost': eligibility_score}
                else:
                    # Legacy path: scale numerics and concat encoded categoricals
                    numerical_data = features_df[self.numerical_features]
                    if hasattr(self.scaler, 'transform'):
                        scaled_numerical = self.scaler.transform(numerical_data)
                    else:
                        scaled_numerical = numerical_data.values
                    features_processed = np.column_stack([
                        scaled_numerical,
                        features_df[self.categorical_features].values
                    ])
                    eligibility_score = float(self.models['xgboost'].predict_proba(features_processed)[0][1])
                    # Cap at 95% for realistic scoring
                    eligibility_score = min(eligibility_score, 0.95)
                    xgb_score = eligibility_score
                    model_results = {'xgboost': eligibility_score}
            else:
                # Dummy prediction logic for testing when no model is available
                eligibility_score = self._dummy_predict(applicant_data)
                xgb_score = eligibility_score
                model_results = {'dummy': eligibility_score}
                logger.warning("Using dummy prediction - no trained model available")
            
            # Determine eligibility status and risk level
            eligibility_status = "eligible" if eligibility_score >= 0.5 else "ineligible"
            risk_level = self._assess_risk_level(applicant_data, eligibility_score)
            
            # Generate recommendations
            recommendations = self._generate_recommendations(applicant_data, eligibility_score)
            
            result = {
                "eligibility_score": eligibility_score,
                "eligibility_status": eligibility_status,
                "models": model_results,
                "risk_level": risk_level,
                "recommendations": recommendations,
                "credit_tier": self._get_credit_tier(applicant_data.get('Credit_Score', 600)),
                "debt_to_income_ratio": applicant_data.get('Debt_to_Income_Ratio', 0),
                "confidence": round(min(xgb_score * 1.2, 1.0), 2),
                "warnings": warnings
            }
            logger.info(f"Loan prediction generated: {model_results}")
            logger.info(f"DEBUG: eligibility_score={eligibility_score}, eligibility_status={eligibility_status}")
            if warnings:
                logger.warning(f"Loan prediction warnings: {warnings}")
            return result
        except Exception as e:
            logger.error(f"Error predicting eligibility: {str(e)}")
            raise

    def _prepare_features_v2(self, applicant_data: Dict) -> pd.DataFrame:
        """Prepare features to exactly match X_columns (order and names).

        - Creates a single-row DataFrame with all columns from self.x_columns in order
        - Fills missing columns with 0
        - Drops extra fields
        - Handles common one-hot groups (employment_status, region, gender, marital_status, loan_purpose, salary_credit_frequency)
        - Attempts to coerce values to numeric where appropriate
        """
        if not self.x_columns:
            # Fallback
            return self._prepare_features(applicant_data)

        # Initialize all expected columns with 0
        row = {col: 0 for col in self.x_columns}

        # Helper: normalize key names
        def norm_key(k: str) -> str:
            return str(k).strip().lower().replace(" ", "_")

        # Build a normalized view of input
        norm_input = {norm_key(k): v for k, v in applicant_data.items()}

        # Map common synonyms to canonical base names used in training
        synonyms = {
            'monthly_income': ['monthly_income', 'income', 'salary', 'net_income'],
            'annual_income': ['annual_income'],
            'credit_score': ['credit_score', 'cibil', 'cibil_score'],
            'loan_amount': ['loan_amount', 'loan_amount_requested', 'requested_amount'],
            'loan_term_months': ['loan_term_months', 'loan_tenure_years', 'tenure', 'tenure_months'],
            'employment_status': ['employment_status', 'employment_type'],
            'region': ['region'],
            'gender': ['gender'],
            'marital_status': ['marital_status'],
            'loan_purpose': ['loan_purpose', 'purpose'],
            'dependents': ['dependents'],
            'existing_emi': ['existing_emi'],
            'total_withdrawals': ['total_withdrawals'],
            'total_deposits': ['total_deposits'],
            'avg_balance': ['avg_balance', 'average_balance'],
            'bounced_transactions': ['bounced_transactions'],
            'account_age_months': ['account_age_months'],
            'total_liabilities': ['total_liabilities'],
            'debt_to_income_ratio': ['debt_to_income_ratio', 'dti'],
            'salary_credit_frequency': ['salary_credit_frequency'],
        }

        # Reverse map: find first available value per canonical key
        canon_values: dict[str, object] = {}
        for canon, keys in synonyms.items():
            for k in keys:
                if k in norm_input and norm_input[k] not in (None, ""):
                    canon_values[canon] = norm_input[k]
                    break

        # Helper to set numeric column if present
        def set_numeric(col_name: str, value):
            if col_name in row:
                try:
                    row[col_name] = float(value)
                except Exception:
                    # leave as 0 if cannot convert
                    pass

        # Directly map numeric columns when names match exactly to X_columns
        for col in self.x_columns:
            ck = norm_key(col)
            if ck in canon_values and isinstance(canon_values[ck], (int, float, str)):
                set_numeric(col, canon_values[ck])

        # Also map common numeric canonicals to frequent training names
        numeric_pairs = [
            ('monthly_income', ['Monthly_Income', 'monthly_income', 'annual_income']),
            ('annual_income', ['annual_income']),
            ('credit_score', ['Credit_Score', 'credit_score']),
            ('loan_amount', ['Loan_Amount_Requested', 'loan_amount']),
            ('loan_term_months', ['Loan_Tenure_Years', 'loan_term_months']),
            ('dependents', ['Dependents']),
            ('existing_emi', ['Existing_EMI']),
            ('total_withdrawals', ['Total_Withdrawals']),
            ('total_deposits', ['Total_Deposits']),
            ('avg_balance', ['Avg_Balance']),
            ('bounced_transactions', ['Bounced_Transactions']),
            ('account_age_months', ['Account_Age_Months']),
            ('total_liabilities', ['Total_Liabilities']),
            ('debt_to_income_ratio', ['Debt_to_Income_Ratio']),
        ]
        for canon, colnames in numeric_pairs:
            if canon in canon_values:
                for cname in colnames:
                    if cname in row:
                        set_numeric(cname, canon_values[canon])
                        break  # set the first matching training column

        # One-hot groups detected in X_columns
        oh_groups = {
            'employment_status': 'employment_status_',
            'region': 'region_',
            'gender': 'gender_',
            'marital_status': 'marital_status_',
            'loan_purpose': 'loan_purpose_',
            'salary_credit_frequency': 'salary_credit_frequency_',
        }

        def sanitize_val(val: str) -> str:
            s = str(val).strip().lower()
            s = s.replace(" ", "_").replace("-", "_")
            return s

        # Set one-hots based on canon_values
        for canon, prefix in oh_groups.items():
            if canon in canon_values and canon_values[canon] is not None:
                target_col = prefix + sanitize_val(canon_values[canon])
                # If exact target column exists, set it
                if target_col in row:
                    row[target_col] = 1

        # Build DataFrame
        df = pd.DataFrame([row])
        # Ensure column order matches X_columns
        df = df[self.x_columns]
        return df
    
    def _prepare_features(self, applicant_data: Dict) -> pd.DataFrame:
        """Prepare features for model prediction with proper preprocessing"""
        # Create feature dictionary with all 23 features
        features = {}
        
        # Direct input features
        features['Age'] = int(applicant_data.get('Age', 30))
        features['Gender'] = applicant_data.get('Gender', 'Male')
        features['Marital_Status'] = applicant_data.get('Marital_Status', 'Single')
        features['Monthly_Income'] = float(applicant_data.get('Monthly_Income', 50000))
        features['Employment_Type'] = applicant_data.get('Employment_Type', 'Salaried')
        features['Loan_Amount_Requested'] = float(applicant_data.get('Loan_Amount_Requested', 500000))
        features['Loan_Tenure_Years'] = int(applicant_data.get('Loan_Tenure_Years', 5))
        features['Credit_Score'] = int(applicant_data.get('Credit_Score', 650))
        features['Region'] = applicant_data.get('Region', 'Urban')
        features['Loan_Purpose'] = applicant_data.get('Loan_Purpose', 'Personal')
        features['Dependents'] = int(applicant_data.get('Dependents', 0))
        features['Existing_EMI'] = float(applicant_data.get('Existing_EMI', 0))
        features['Salary_Credit_Frequency'] = applicant_data.get('Salary_Credit_Frequency', 'Monthly')
        
        # OCR extracted features
        features['Total_Withdrawals'] = float(applicant_data.get('Total_Withdrawals', 0))
        features['Total_Deposits'] = float(applicant_data.get('Total_Deposits', 0))
        features['Avg_Balance'] = float(applicant_data.get('Avg_Balance', 0))
        features['Bounced_Transactions'] = int(applicant_data.get('Bounced_Transactions', 0))
        features['Account_Age_Months'] = int(applicant_data.get('Account_Age_Months', 12))
        
        # Calculated features
        features['Total_Liabilities'] = float(applicant_data.get('Total_Liabilities', 0))
        features['Debt_to_Income_Ratio'] = float(applicant_data.get('Debt_to_Income_Ratio', 0))
        features['Income_Stability_Score'] = float(applicant_data.get('Income_Stability_Score', 0.8))
        features['Credit_Utilization_Ratio'] = float(applicant_data.get('Credit_Utilization_Ratio', 0.3))
        features['Loan_to_Value_Ratio'] = float(applicant_data.get('Loan_to_Value_Ratio', 0.7))
        
        # Verification features
        features['Bank_Verified'] = int(applicant_data.get('Bank_Verified', 0))
        features['Document_Verified'] = int(applicant_data.get('Document_Verified', 0))
        features['Voice_Verified'] = int(applicant_data.get('Voice_Verified', 0))
        
        # Create DataFrame
        df = pd.DataFrame([features])
        
        # Apply label encoding to categorical features
        for feature in self.categorical_features:
            if feature in df.columns:
                try:
                    # Try to transform first (if encoder is fitted)
                    df[feature] = self.label_encoders[feature].transform(df[feature])
                except:
                    # If not fitted, fit and transform
                    df[feature] = self.label_encoders[feature].fit_transform(df[feature])
        
        return df
    
    def _dummy_predict(self, applicant_data: Dict) -> float:
        """
        Dummy prediction logic when model is not loaded
        Used for testing purposes with the 23-feature format
        """
        logger.error(f"!!! DUMMY PRED START - Input: {applicant_data} !!!")
        score = 0.0
        
        # Credit score (normalized 300-850)
        credit_score = applicant_data.get('Credit_Score', 600)
        score += (credit_score - 300) / 550 * 0.4  # 40% weight
        
        # Income to loan ratio (higher ratio = better)
        monthly_income = applicant_data.get('Monthly_Income', 50000)
        loan_amount = applicant_data.get('Loan_Amount_Requested', 200000)
        debt_to_income = loan_amount / (monthly_income * 12) if monthly_income > 0 else 10
        score += max(0, 1 - (debt_to_income / 10)) * 0.4  # 40% weight
        
        # Employment type
        employment_type = applicant_data.get('Employment_Type', 'Salaried').lower()
        if employment_type == 'salaried':
            score += 0.2
        elif employment_type == 'self-employed':
            score += 0.1
        
        # Age factor (prime working age is better)
        age = applicant_data.get('Age', 30)
        if 25 <= age <= 55:
            score += 0.1
        elif age < 25 or age > 65:
            score -= 0.1
        
        # Account age (older accounts are better)
        account_age = applicant_data.get('Account_Age_Months', 12)
        score += min(account_age / 60, 0.1)  # Max 0.1 for accounts older than 5 years
        
        final_score = min(max(score, 0.0), 1.0)
        logger.error(f"!!! DUMMY PRED END - Score: {final_score} !!!")
        return final_score
    
    def _assess_risk_level(self, applicant_data: Dict, eligibility_score: float) -> str:
        """Assess risk level based on applicant data"""
        credit_score = applicant_data.get('Credit_Score', 600)
        
        if eligibility_score < 0.3:
            return "high_risk"
        elif eligibility_score < 0.6:
            if credit_score < 650:
                return "medium_risk"
            else:
                return "low_medium_risk"
        else:
            if credit_score < 700:
                return "low_medium_risk"
            else:
                return "low_risk"
    
    def _get_credit_tier(self, credit_score: int) -> str:
        """Categorize credit score into tiers"""
        if credit_score >= 740:
            return "Excellent"
        elif credit_score >= 670:
            return "Good"
        elif credit_score >= 580:
            return "Fair"
        else:
            return "Poor"
    
    def _calculate_debt_to_income(self, applicant_data: Dict) -> Dict:
        """Calculate debt-to-income ratio"""
        annual_income = applicant_data.get('annual_income', 0)
        loan_amount = applicant_data.get('loan_amount', 0)
        loan_term = applicant_data.get('loan_term_months', 12)
        
        if annual_income == 0:
            return {"ratio": 0, "percentage": 0}
        
        # Estimate monthly payment (assuming 5% interest)
        monthly_rate = 0.05 / 12
        num_payments = loan_term
        monthly_payment = (loan_amount * monthly_rate * (1 + monthly_rate)**num_payments) / \
                         ((1 + monthly_rate)**num_payments - 1) if num_payments > 0 else 0
        
        monthly_income = annual_income / 12
        dti_ratio = monthly_payment / monthly_income if monthly_income > 0 else 0
        
        return {
            "ratio": round(dti_ratio, 2),
            "percentage": round(dti_ratio * 100, 2),
            "status": "acceptable" if dti_ratio <= 0.43 else "concerning"
        }
    
    def _generate_recommendations(self, applicant_data: Dict, eligibility_score: float) -> list:
        """Generate personalized recommendations"""
        recommendations = []
        
        credit_score = applicant_data.get('Credit_Score', 600)
        monthly_income = applicant_data.get('Monthly_Income', 0)
        loan_amount = applicant_data.get('Loan_Amount_Requested', 0)
        employment = applicant_data.get('Employment_Type', 'Unknown').lower()
        bounced_transactions = applicant_data.get('Bounced_Transactions', 0)
        debt_to_income = applicant_data.get('Debt_to_Income_Ratio', 0)
        
        # Credit score recommendations
        if credit_score < 650:
            recommendations.append("Improve credit score by paying down existing debt and ensuring on-time payments")
        elif credit_score < 700:
            recommendations.append("Consider working with a credit counselor to further improve your credit profile")
        
        # Income recommendations
        if monthly_income < 25000:
            recommendations.append("Consider increasing income or reducing loan amount requested")
        
        # Debt-to-income recommendations
        if debt_to_income > 0.43:
            recommendations.append("Consider reducing loan amount or extending term to lower debt-to-income ratio")
        
        # Employment recommendations
        if employment == 'unemployed':
            recommendations.append("Securing employment would significantly improve loan eligibility")
        elif employment == 'self-employed':
            recommendations.append("Providing 2-3 years of business tax returns would strengthen your application")
        
        # Bank account recommendations
        if bounced_transactions > 2:
            recommendations.append("Reduce bounced transactions by maintaining sufficient account balance")
        
        # General positive recommendations
        if eligibility_score >= 0.7:
            recommendations.append("Your application is strong. Proceed with document submission for verification")
        elif eligibility_score >= 0.5:
            recommendations.append("Address the areas above and reapply for better approval chances")
        
        return recommendations[:3]  # Return top 3 recommendations
