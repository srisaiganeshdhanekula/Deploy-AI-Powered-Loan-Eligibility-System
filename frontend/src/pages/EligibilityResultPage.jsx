import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoanResultCard from "../components/LoanResultCard";

export default function EligibilityResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Get result and applicationId from navigation state or query params
  const { result, applicationId, applicationData, extractedData } =
    location.state || {};

  // If no result, redirect back to verification
  React.useEffect(() => {
    if (!result || !applicationId) {
      navigate("/verify", { replace: true });
    }
  }, [result, applicationId, navigate]);

  if (!result || !applicationId) return null;

  // The result already contains all required fields from the backend
  // including eligibility_score, eligibility_status, risk_level, etc.
  // No need to extract from models object

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-100/80 via-white to-secondary-100/80 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-3xl mx-auto pt-10 px-4">
        <div className="mb-8 flex justify-center">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white text-center">
            Loan Assessment Result
          </h1>
        </div>
        <LoanResultCard
          result={result}
          applicationId={applicationId}
          applicationData={applicationData}
          extractedData={extractedData}
        />
      </div>
    </div>
  );
}
