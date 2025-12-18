import React from "react";
import { useLocation } from "react-router-dom";
import DocumentVerification from "../components/DocumentVerification";

// Beautiful, glassy, and interactive Verification page
export default function Verification() {
  // Get applicationId from query string
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const applicationId = params.get("applicationId");

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-100/80 via-white to-secondary-100/80 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-6 px-4 sm:px-6 lg:px-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-2">
            Document Verification & KYC
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-200">
            Upload all required documents to proceed with loan eligibility
          </p>
          {/* ...existing voice agent info... */}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="glass rounded-3xl shadow-2xl p-10 w-full max-w-2xl border border-white/30 backdrop-blur-xl">
            <DocumentVerification applicationId={applicationId} />
          </div>
        </div>
      </div>
    </div>
  );
}
