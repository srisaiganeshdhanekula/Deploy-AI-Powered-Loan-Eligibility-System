"""
ML Model Training Template
Train XGBoost model on your own loan applicants dataset

INSTRUCTIONS:
1. Replace the dataset loading section with your own data
2. Adjust feature engineering as needed
3. Modify the model parameters if required
4. Run this script to train your model
5. The trained model will be saved to app/models/loan_model.pkl
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
import xgboost as xgb
import pickle
from pathlib import Path

def load_your_dataset():
    """
    Load your own dataset here
    Expected columns: annual_income, credit_score, loan_amount, loan_term_months,
                     num_dependents, employment_status, eligible (target)
    """
    # TODO: Replace this with your actual dataset loading
    # Example:
    # df = pd.read_csv("your_dataset.csv")
    # or
    # df = pd.read_excel("your_dataset.xlsx")
    # or load from database, etc.

    print("⚠️  Please implement your own dataset loading in load_your_dataset()")
    print("    Expected columns: annual_income, credit_score, loan_amount, loan_term_months, num_dependents, employment_status, eligible")

    # Placeholder - remove this when you implement your own data loading
    return None


def preprocess_data(df):
    """
    Preprocess the data for training
    """
    if df is None:
        raise ValueError("No dataset provided. Please implement load_your_dataset()")

    print(f"Dataset shape: {df.shape}")
    print(f"Columns: {list(df.columns)}")

    # Check required columns
    required_cols = ['annual_income', 'credit_score', 'loan_amount', 'loan_term_months',
                    'num_dependents', 'employment_status', 'eligible']

    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")

    # Prepare features
    X = df.drop('eligible', axis=1).copy()
    y = df['eligible'].copy()

    # Handle categorical variables
    if 'employment_status' in X.columns:
        # One-hot encode employment status
        employment_dummies = pd.get_dummies(X['employment_status'], prefix='employment_status')
        X = X.drop('employment_status', axis=1)
        X = pd.concat([X, employment_dummies], axis=1)

    # Handle any missing values
    X = X.fillna(X.mean())

    print(f"Features after preprocessing: {list(X.columns)}")
    print(f"Target distribution: {y.value_counts().to_dict()}")

    return X, y


def train_model(X, y, output_path="app/models/loan_model.pkl"):
    """Train XGBoost model"""

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nTraining set: {X_train.shape}, Test set: {X_test.shape}")

    # Train XGBoost model
    print("\nTraining XGBoost model...")
    model = xgb.XGBClassifier(
        n_estimators=100,      # TODO: Adjust as needed
        max_depth=6,           # TODO: Adjust as needed
        learning_rate=0.1,     # TODO: Adjust as needed
        random_state=42,
        eval_metric='logloss',
        scale_pos_weight=len(y[y==0])/len(y[y==1])  # Handle class imbalance
    )

    model.fit(X_train, y_train)

    # Evaluate
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)

    print(f"\nModel Performance:")
    print(f"Training Accuracy: {train_score:.4f}")
    print(f"Testing Accuracy: {test_score:.4f}")

    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    print(f"\nTop 5 Important Features:")
    print(feature_importance.head())

    # Save model
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'wb') as f:
        pickle.dump(model, f)

    print(f"\n✅ Model saved to {output_path}")

    return model


if __name__ == "__main__":
    print("🏦 AI Loan System - ML Model Training")
    print("=" * 40)

    try:
        # Load your dataset
        print("\n📊 Loading dataset...")
        df = load_your_dataset()

        if df is not None:
            # Preprocess data
            print("\n🔧 Preprocessing data...")
            X, y = preprocess_data(df)

            # Train model
            model = train_model(X, y, "app/models/loan_model.pkl")

            print("\n✅ Training completed successfully!")
            print("   Your model is ready for use in the AI Loan System.")
        else:
            print("\n❌ No dataset loaded. Please implement load_your_dataset() first.")

    except Exception as e:
        print(f"\n❌ Error during training: {str(e)}")
        print("   Please check your dataset and try again.")
