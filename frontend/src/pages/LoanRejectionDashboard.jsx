// src/pages/LoanRejectionDashboard.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import api from "../utils/api";

function LoanRejectionDashboard() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchRejectionDetails() {
      try {
        const res = await api.get(`/loan/rejection/${userId}`);
        setData(res.data);
      } catch (err) {
        console.error("Failed to fetch rejection details", err);
        setError("Could not load rejection details. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    if (userId) {
      fetchRejectionDetails();
    }
  }, [userId]);

  if (loading)
    return (
      <AdminLayout>
        <div className="p-8">Loading...</div>
      </AdminLayout>
    );
  if (error)
    return (
      <AdminLayout>
        <div className="p-8 text-red-500">{error}</div>
      </AdminLayout>
    );
  if (!data)
    return (
      <AdminLayout>
        <div className="p-8">No data found.</div>
      </AdminLayout>
    );

  const {
    applicantName,
    applicationId,
    loanAmount,
    loanType,
    rejectionReason,
    detailedReason,
    metrics,
    suggestions,
  } = data;

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-4">
        Loan Rejection Summary (Sharable)
      </h1>

      {/* Banner */}
      <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 mb-6">
        <p className="text-sm text-red-300 font-semibold">Loan Status</p>
        <p className="text-2xl font-bold text-red-400 mt-1">
          ❌ Loan Application Rejected
        </p>
        <p className="text-sm text-red-500 mt-2 font-semibold">
          This loan could not be approved due to eligibility criteria.
        </p>
      </div>

      {/* Basic Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-sm text-slate-400">Applicant Name</p>
          <p className="text-lg font-semibold text-white">{applicantName}</p>

          <p className="text-sm text-slate-400 mt-3">Application ID</p>
          <p className="text-lg font-semibold text-white">{applicationId}</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-sm text-slate-400">Loan Type</p>
          <p className="text-lg font-semibold text-white">{loanType}</p>

          <p className="text-sm text-slate-400 mt-3">Requested Amount</p>
          <p className="text-lg font-semibold text-white">{loanAmount}</p>
        </div>
      </div>

      {/* Rejection Reason */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <p className="text-sm text-slate-400">Rejection Reason</p>
        <p className="text-xl font-semibold text-red-400 mt-1">
          {rejectionReason}
        </p>
        <p className="text-sm text-slate-300 mt-2">{detailedReason}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex justify-between items-center"
          >
            <span className="text-slate-400">{metric.label}</span>
            <span className="text-white font-semibold">{metric.value}</span>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-white mb-3">
          Suggestions for Improvement
        </h3>
        <ul className="list-disc list-inside text-slate-300 space-y-2">
          {suggestions.map((suggestion, index) => (
            <li key={index}>{suggestion}</li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}

export default LoanRejectionDashboard;
