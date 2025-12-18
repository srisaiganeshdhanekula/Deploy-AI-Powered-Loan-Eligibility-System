// src/pages/MainDashboard.jsx
import React, { useEffect, useState } from "react";
import { authAPI } from "../utils/api";
import AdminLayout from "../components/AdminLayout";
import { managerAPI } from "../utils/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

function MainDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  // Get current user (for user_id)
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    async function fetchUser() {
      try {
        const { data } = await authAPI.getCurrentUser();
        setUserId(data.id);
      } catch {
        setUserId(null);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await managerAPI.getStatistics();
        setStats(res.data);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading dashboard data...</div>
        </div>
      </AdminLayout>
    );
  }

  const incomeVsEligibility = [
    { income: "20k", score: 0.4 },
    { income: "40k", score: 0.6 },
    { income: "60k", score: 0.8 },
    { income: "80k", score: 0.9 },
  ];

  // KPI Data
  const kpis = [
    { title: "Total Applications", value: stats?.total_applications || 0 },
    {
      title: "Approved Applications",
      value: stats?.approved_applications || 0,
    },
    { title: "Voice Calls Handled", value: stats?.voice_calls_count || 0 },
    { title: "Average Credit Score", value: stats?.avg_credit_score || 0 },
  ];

  // Bar Chart – Loan Amount Ranges (dynamic if API provides)
  const loanRanges = stats?.loan_amount_distribution || [
    { range: "< 2L", count: 0 },
    { range: "2–5L", count: 0 },
    { range: "5–10L", count: 0 },
    { range: "> 10L", count: 0 },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Executive Summary</h1>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition-colors duration-150"
          onClick={async () => {
            if (!userId) {
              setShareError("User not found. Please re-login.");
              setShareModalOpen(true);
              return;
            }
            setShareLoading(true);
            setShareError("");
            try {
              const res = await managerAPI.shareDashboard(userId);
              setShareLink(res.data.link);
              setShareModalOpen(true);
            } catch (err) {
              setShareError("Failed to generate share link.");
              setShareModalOpen(true);
            } finally {
              setShareLoading(false);
            }
          }}
          disabled={shareLoading}
        >
          {shareLoading ? "Generating..." : "Share Dashboard"}
        </button>
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={() => setShareModalOpen(false)}
            >
              ×
            </button>
            <h2 className="text-lg font-bold mb-4 text-gray-800">Share Dashboard Link</h2>
            {shareError ? (
              <div className="text-red-500 mb-4">{shareError}</div>
            ) : (
              <>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mb-3 text-gray-700 bg-gray-100"
                  value={shareLink}
                  readOnly
                  onFocus={e => e.target.select()}
                />
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow mr-2"
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                  }}
                  disabled={!shareLink}
                >
                  Copy Link
                </button>
                {shareLink && (
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-700 underline"
                  >
                    Open Public Dashboard
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((item, index) => (
          <div
            key={index}
            className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow"
          >
            <p className="text-sm text-slate-400">{item.title}</p>
            <p className="text-3xl font-bold mt-2 text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Eligibility Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm mb-2 font-semibold">
            Income vs Eligibility Score
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={incomeVsEligibility}>
                <XAxis dataKey="income" />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#38bdf8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Loan Amount Distribution */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm mb-2 font-semibold">
            Loan Applications by Amount Range
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loanRanges}>
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default MainDashboard;