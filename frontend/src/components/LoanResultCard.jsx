import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Shield,
  CreditCard,
  Target,
  Award,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { reportAPI } from "../utils/api";

const LoanResultCard = ({
  result,
  applicationData,
  extractedData,
  applicationId,
}) => {
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case "eligible":
        return {
          color: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          icon: CheckCircle,
          gradient: "from-green-500 to-emerald-500",
          statusText: "Eligible for Loan",
        };
      case "ineligible":
        return {
          color: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          icon: XCircle,
          gradient: "from-red-500 to-rose-500",
          statusText: "Not Eligible",
        };
      default:
        return {
          color: "text-yellow-600",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          icon: AlertTriangle,
          gradient: "from-yellow-500 to-orange-500",
          statusText: "Under Review",
        };
    }
  };

  const getRiskConfig = (risk) => {
    switch (risk?.toLowerCase()) {
      case "low_risk":
        return {
          color: "text-green-600",
          bgColor: "bg-green-100",
          label: "Low Risk",
        };
      case "medium_risk":
        return {
          color: "text-yellow-600",
          bgColor: "bg-yellow-100",
          label: "Medium Risk",
        };
      case "low_medium_risk":
        return {
          color: "text-blue-600",
          bgColor: "bg-blue-100",
          label: "Low-Medium Risk",
        };
      case "high_risk":
        return {
          color: "text-red-600",
          bgColor: "bg-red-100",
          label: "High Risk",
        };
      default:
        return {
          color: "text-gray-600",
          bgColor: "bg-gray-100",
          label: "Unknown",
        };
    }
  };

  const statusConfig = getStatusConfig(result.eligibility_status);
  const riskConfig = getRiskConfig(result.risk_level);
  const StatusIcon = statusConfig.icon;

  // Normalize percentage-like values from 0-1 to 0-100 display
  const toPct = (v) => {
    const n = Number(v ?? 0);
    if (Number.isNaN(n)) return 0;
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  };

  const scorePct = toPct(result.eligibility_score);
  const confPct = toPct(result.confidence);
  const dtiRatio = Number(result.debt_to_income_ratio ?? 0) || 0;
  const dtiPct = Math.round(dtiRatio * 100);
  const dtiConfig = (() => {
    if (dtiRatio <= 0.36)
      return {
        color: "text-green-600",
        bgColor: "bg-green-100",
        label: `${dtiPct}% (Good)`,
      };
    if (dtiRatio <= 0.43)
      return {
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
        label: `${dtiPct}% (Borderline)`,
      };
    return {
      color: "text-red-600",
      bgColor: "bg-red-100",
      label: `${dtiPct}% (High)`,
    };
  })();

  const metrics = [
    {
      icon: TrendingUp,
      label: "Eligibility Score",
      value: `${scorePct}%`,
      progress: scorePct,
      color: "bg-primary-500",
    },
    {
      icon: Shield,
      label: "Risk Level",
      value: riskConfig.label,
      color: riskConfig.color,
      bgColor: riskConfig.bgColor,
    },
    {
      icon: CreditCard,
      label: "Credit Tier",
      value: result.credit_tier,
      color: "text-gray-900",
    },
    {
      icon: Target,
      label: "Debt-to-Income",
      value: dtiConfig.label,
      color: dtiConfig.color,
      bgColor: dtiConfig.bgColor,
    },
    {
      icon: Award,
      label: "Confidence",
      value: `${confPct}%`,
      progress: confPct,
      color: "bg-secondary-500",
    },
  ];

  // Auto-generate analysis once when result is present

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="max-w-2xl mx-auto"
    >
      {/* Main Result Card */}
      <div
        className={`bg-white shadow-lg rounded-xl border-2 ${statusConfig.borderColor} ${statusConfig.bgColor} overflow-hidden`}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${statusConfig.gradient} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <StatusIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  Loan Assessment Result
                </h3>
                <p className="text-white/90 text-sm">
                  AI-powered eligibility analysis
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">{scorePct}%</div>
              <div className="text-white/90 text-sm">Eligibility Score</div>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              className={`px-6 py-3 rounded-full ${statusConfig.bgColor} border-2 ${statusConfig.borderColor}`}
            >
              <div className="flex items-center space-x-2">
                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                <span className={`font-bold text-lg ${statusConfig.color}`}>
                  {statusConfig.statusText}
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div
                    className={`p-2 rounded-lg ${
                      metric.bgColor || "bg-gray-100"
                    }`}
                  >
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {metric.label}
                  </span>
                </div>

                {metric.progress !== undefined ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">
                        {metric.value}
                      </span>
                      <span className="text-sm text-gray-500">
                        {metric.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <motion.div
                        className={`h-2 rounded-full ${metric.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${metric.progress}%` }}
                        transition={{ delay: 0.5 + index * 0.1, duration: 1 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-lg font-bold text-gray-900">
                    {metric.value}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              disabled={!applicationId || loadingExplain}
              onClick={async () => {
                if (!applicationId) return;
                setLoadingExplain(true);
                try {
                  const { data } = await reportAPI.generateAnalysis(
                    applicationId
                  );
                  const analysisText =
                    data?.analysis ?? JSON.stringify(data ?? {});
                  setAnalysis(analysisText);
                  setAnalysisError("");
                } catch (e) {
                  let msg =
                    "Sorry, I'm having trouble responding right now. Please try again.";
                  try {
                    msg =
                      e?.response?.data?.detail ||
                      e?.response?.data ||
                      e?.message ||
                      msg;
                  } catch (__) {}
                  setAnalysisError(String(msg));
                } finally {
                  setLoadingExplain(false);
                }
              }}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-60"
              title={
                !applicationId
                  ? "Analysis requires an application ID"
                  : "Explain the result with AI"
              }
            >
              {loadingExplain ? "Generating analysis..." : "Explain with AI"}
            </button>

            <div className="flex gap-3">
              <button
                disabled={!applicationId || reportLoading}
                onClick={async () => {
                  if (!applicationId) return;
                  setReportLoading(true);
                  try {
                    // Ensure report exists
                    await reportAPI.generateReport(applicationId);
                    // Then trigger download
                    const res = await reportAPI.downloadReport(applicationId);
                    const contentType =
                      res.headers?.["content-type"] || "application/pdf";
                    const blob = new Blob([res.data], { type: contentType });
                    const url = window.URL.createObjectURL(blob);
                    // If the server returned HTML (fallback), open in new tab so browser can render it.
                    if (contentType.includes("html")) {
                      window.open(url, "_blank");
                    } else {
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `loan_report_${applicationId}${
                        contentType.includes("pdf") ? ".pdf" : ""
                      }`;
                      a.click();
                      a.remove();
                    }
                    window.URL.revokeObjectURL(url);
                  } catch (e) {
                    // optional: toast
                  } finally {
                    setReportLoading(false);
                  }
                }}
                className="px-4 py-2 rounded-md bg-gray-800 text-white disabled:opacity-60"
                title={
                  !applicationId
                    ? "Report requires an application ID"
                    : "Download PDF report"
                }
              >
                {reportLoading ? "Preparing report..." : "Download PDF Report"}
              </button>
              <button
                onClick={() => (window.location.href = "/admin/dashboard")}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
                title="Go to Dashboard"
                style={{ marginLeft: '0.5rem' }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Application Summary */}
      {(applicationData || extractedData) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100"
        >
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center space-x-2">
              <div className="bg-secondary-100 p-2 rounded-lg">
                <CreditCard className="w-5 h-5 text-secondary-600" />
              </div>
              <h4 className="text-lg font-semibold text-primary-600">
                Application Summary
              </h4>
            </div>
            {showSummary ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showSummary && (
            <div className="px-6 pb-6 border-t border-gray-100 pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {applicationData && (
                  <div>
                    <h5 className="font-medium text-gray-900 mb-3">
                      Personal Information
                    </h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Name:</span>
                        <span className="font-medium">
                          {applicationData.full_name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Email:</span>
                        <span className="font-medium">
                          {applicationData.email}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Phone:</span>
                        <span className="font-medium">
                          {applicationData.phone}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monthly Income:</span>
                        <span className="font-medium">
                          ₹{applicationData.monthly_income}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Loan Amount:</span>
                        <span className="font-medium">
                          ₹{applicationData.loan_amount_requested}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {extractedData && (
                  <div>
                    <h5 className="font-medium text-secondary-600 mb-3">
                      Document Verification
                    </h5>
                    <div className="space-y-2 text-sm">
                      {extractedData.monthly_income && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            Verified Income:
                          </span>
                          <span className="font-medium">
                            ₹{extractedData.monthly_income}
                          </span>
                        </div>
                      )}
                      {extractedData.credit_score && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Credit Score:</span>
                          <span className="font-medium">
                            {extractedData.credit_score}
                          </span>
                        </div>
                      )}
                      {extractedData.account_age_months && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Account Age:</span>
                          <span className="font-medium">
                            {extractedData.account_age_months} months
                          </span>
                        </div>
                      )}
                      {extractedData.avg_balance && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg Balance:</span>
                          <span className="font-medium">
                            ₹{extractedData.avg_balance}
                          </span>
                        </div>
                      )}
                      <div className="mt-3 p-2 bg-green-50 rounded-lg">
                        <p className="text-green-800 text-xs font-medium">
                          ✓ Document verification completed
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-center mt-6 text-sm text-gray-500"
      >
        {(analysis || analysisError) && (
          <div className="card mb-6 text-left max-h-[35vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-lg font-semibold text-gray-900">
                <span className="text-green-300">AI Analysis</span>
              </h4>
              {analysisError && (
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900"
                  onClick={async () => {
                    if (!applicationId) return;
                    setLoadingExplain(true);
                    setAnalysisError("");
                    try {
                      const { data } = await reportAPI.generateAnalysis(
                        applicationId
                      );
                      setAnalysis(data.analysis);
                    } catch (e) {
                      setAnalysisError(
                        "Sorry, I'm having trouble responding right now. Please try again."
                      );
                    } finally {
                      setLoadingExplain(false);
                    }
                  }}
                >
                  Retry
                </button>
              )}
            </div>
            {analysis && (
              <div className="mt-4 p-4 bg-gray-100 rounded-xl border border-gray-300">
                <div className="prose prose-sm max-w-none text-gray-900 prose-headings:font-semibold prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-ul:list-disc prose-ul:pl-4 prose-li:my-1">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              </div>
            )}
            {analysisError && (
              <div className="text-red-600 text-sm">{analysisError}</div>
            )}
          </div>
        )}
        <p>
          This assessment is based on AI analysis of your provided information.
        </p>
        <p className="mt-1">
          For final approval, please consult with a loan officer.
        </p>
      </motion.div>
    </motion.div>
  );
};

export default LoanResultCard;
