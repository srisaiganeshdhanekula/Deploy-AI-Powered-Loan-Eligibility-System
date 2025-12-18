

import React, { useEffect, useState } from "react";
import MiniChatbot from "../components/MiniChatbot";
import { BarChart3, CheckCircle, XCircle, TrendingUp, Shield, Award } from "lucide-react";
import { loanAPI, authAPI } from "../utils/api";
import { motion } from "framer-motion";

export default function UserDashboard() {
  // Try to get applicationId from query param
  const params = new URLSearchParams(window.location.search);
  const applicationId = params.get("applicationId");

  const [modelResults, setModelResults] = useState(null);
  const [dashboardName, setDashboardName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPrediction() {
      if (!applicationId) return;
      setLoading(true);
      setError("");
      try {
        const { data } = await loanAPI.predictForApplication(applicationId);
        if (data && data.models) {
          setModelResults(data.models);
        } else {
          setError("No prediction data returned.");
        }
        // Prefer full_name from prediction response for dashboard title
        if (data && (data.full_name || (data.app_data && data.app_data.full_name))) {
          setDashboardName(data.full_name || data.app_data.full_name);
        }
      } catch (e) {
        setError("Failed to fetch prediction results.");
        console.error("Error fetching prediction results:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchPrediction();
  }, [applicationId]);

  useEffect(() => {
    async function fetchUser() {
      try {
        const { data } = await authAPI.getCurrentUser();
        if (!dashboardName && data && (data.username || data.full_name)) {
          setDashboardName(data.username || data.full_name);
        }
      } catch (e) {
        if (!dashboardName) setDashboardName("");
      }
    }
    fetchUser();
  }, [dashboardName]);


  // Extract best model and KPIs
  let bestModel = null, bestScore = 0, bestStatus = null, bestAccuracy = null;
  if (modelResults && Object.keys(modelResults).length > 0) {
    Object.entries(modelResults).forEach(([model, res]) => {
      if (res.eligibility_score > bestScore) {
        bestModel = model;
        bestScore = res.eligibility_score;
        bestStatus = res.eligibility_status;
        bestAccuracy = res.accuracy;
      }
    });
  }

  // Optionally, you can fetch riskLevel and creditTier from API response if available
  // For now, just show placeholders

  return (
    <div className="max-w-5xl mx-auto py-8 px-2 md:px-6 space-y-8 relative" style={{ minHeight: '80vh' }}>
      {/* Header */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-200 drop-shadow">{dashboardName ? `${dashboardName}'s Dashboard` : "Your Dashboard"}</h1>
          <p className="text-gray-400 mt-1 text-base md:text-lg">See your loan status, get AI explanations, and chat for help.</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary-50 to-white shadow-lg flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary-600" />
            <span className="font-semibold text-primary-700">AI Loan Insights</span>
          </div>
          {/* Share Button */}
          {applicationId && (
            <button
              className="btn-primary mt-2 flex items-center gap-2"
              onClick={async () => {
                try {
                  const user = window.auth?.getUser ? window.auth.getUser() : (typeof auth !== 'undefined' ? auth.getUser() : null);
                  const userId = user?.id;
                  if (!userId) {
                    alert('User ID not found. Please log in again.');
                    return;
                  }
                  const res = await (window.managerAPI ? window.managerAPI.shareDashboard(userId) : (await import('../utils/api')).managerAPI.shareDashboard(userId));
                  const token = res?.data?.token;
                  if (token) {
                    const publicUrl = `${window.location.origin}/public-dashboard/${token}`;
                    await navigator.clipboard.writeText(publicUrl);
                    alert('Public dashboard link copied! You can share it with others.');
                  } else {
                    alert('Could not retrieve dashboard link.');
                  }
                } catch (err) {
                  alert('Failed to get dashboard link.');
                }
              }}
              title="Copy shareable dashboard link"
            >
              Share Dashboard
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <motion.div whileHover={{ scale: 1.04 }} className="card flex flex-col items-center justify-center text-center">
          <Shield className={`w-8 h-8 mb-2 ${bestStatus === 'eligible' ? 'text-green-500' : 'text-red-500'}`} />
          <div className="text-xs text-gray-500">Status</div>
          <div className={`text-lg font-bold ${bestStatus === 'eligible' ? 'text-green-600' : 'text-red-600'}`}>{bestStatus ? bestStatus.charAt(0).toUpperCase() + bestStatus.slice(1) : '-'}</div>
        </motion.div>
        <motion.div whileHover={{ scale: 1.04 }} className="card flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-8 h-8 mb-2 text-blue-500" />
          <div className="text-xs text-gray-500">Best Probability</div>
          <div className="text-lg font-bold text-blue-600">{bestScore ? (bestScore * 100).toFixed(1) + '%' : '-'}</div>
        </motion.div>
        <motion.div whileHover={{ scale: 1.04 }} className="card flex flex-col items-center justify-center text-center">
          <Award className="w-8 h-8 mb-2 text-yellow-500" />
          <div className="text-xs text-gray-500">Best Model</div>
          <div className="text-lg font-bold text-yellow-600">{bestModel ? bestModel.replace('_', ' ') : '-'}</div>
        </motion.div>
        <motion.div whileHover={{ scale: 1.04 }} className="card flex flex-col items-center justify-center text-center">
          <CheckCircle className="w-8 h-8 mb-2 text-purple-500" />
          <div className="text-xs text-gray-500">Best Accuracy</div>
          <div className="text-lg font-bold text-purple-600">{bestAccuracy !== null && bestAccuracy !== undefined ? (bestAccuracy * 100).toFixed(1) + '%' : '-'}</div>
        </motion.div>
      </div>

      {/* Bar Chart for Model Probabilities */}
      {modelResults && Object.keys(modelResults).length > 0 && (
        <div className="bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl p-6 mb-2">
          <div className="text-lg font-semibold text-black dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-600" />
            Model Probability Comparison
          </div>
          <div className="flex flex-col gap-4">
            {Object.entries(modelResults).map(([model, res]) => (
              <div key={model} className="flex items-center gap-4">
                <span className="w-32 font-medium capitalize text-gray-700 dark:text-gray-200">{model.replace('_', ' ')}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative overflow-hidden">
                  <div
                    className={`h-4 rounded-full ${res.eligibility_status === 'eligible' ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ width: `${(res.eligibility_score * 100).toFixed(1)}%`, transition: 'width 0.6s' }}
                  ></div>
                </div>
                <span className="w-16 text-right font-bold text-gray-800 dark:text-gray-100">{(res.eligibility_score * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Results Table */}
      <div className="bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-xl border p-6">
        <div className="text-lg font-semibold text-black dark:text-white drop-shadow mb-4">Loan Model Predictions</div>
        {loading ? (
          <div className="text-gray-600">Loading predictions...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : modelResults && Object.keys(modelResults).length > 0 ? (
          <table className="min-w-full text-sm rounded-xl overflow-hidden">
            <thead>
              <tr className="border-b bg-gray-100 dark:bg-gray-800">
                <th className="py-2 px-4 text-left">Model</th>
                <th className="py-2 px-4 text-left">Prediction</th>
                <th className="py-2 px-4 text-left">Probability</th>
                <th className="py-2 px-4 text-left">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(modelResults).map(([model, res]) => (
                <tr key={model} className="border-b">
                  <td className="py-2 px-4 font-semibold capitalize">{model.replace('_', ' ')}</td>
                  <td className="py-2 px-4">
                    {res.eligibility_status === 'eligible' ? (
                      <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Eligible</span>
                    ) : (
                      <span className="text-red-600 font-bold flex items-center gap-1"><XCircle className="w-4 h-4" /> Not Eligible</span>
                    )}
                  </td>
                  <td className="py-2 px-4">{(res.eligibility_score * 100).toFixed(1)}%</td>
                  <td className="py-2 px-4">{(res.accuracy * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-gray-600 font-semibold">No model predictions available for this application.<br/>Please ensure your application is complete and try again.</div>
        )}
      </div>

      {/* MiniChatbot */}
      <div className="fixed bottom-6 right-6 z-50">
        <MiniChatbot applicationId={applicationId} />
      </div>
    </div>
  );
}
