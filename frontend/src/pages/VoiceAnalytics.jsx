// src/pages/VoiceAnalytics.jsx
import React, { useState } from "react";
import AdminLayout from "../components/AdminLayout";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

function VoiceAnalytics() {
  // KPI Data
  const totalCalls = 612;
  const avgDuration = "1m 42s";
  const aiLatency = "0.8 sec";
  const successRate = "89%";

  // Success vs Failed Calls
  const callStatus = [
    { name: "Successful Calls", value: 546 },
    { name: "Failed Calls", value: 66 },
  ];
  const COLORS = ["#34d399", "#ef4444"];

  // Hourly Call Trend
  const hourlyCalls = [
    { hour: "10 AM", calls: 42 },
    { hour: "11 AM", calls: 65 },
    { hour: "12 PM", calls: 88 },
    { hour: "1 PM", calls: 73 },
    { hour: "2 PM", calls: 52 },
    { hour: "3 PM", calls: 46 },
  ];

  // Keywords
  const keywords = [
    { word: "interest rate", count: 122 },
    { word: "loan amount", count: 98 },
    { word: "documents", count: 75 },
    { word: "credit score", count: 63 },
    { word: "eligibility", count: 54 },
  ];

  // -------------------------
  // ⭐ NEW: Riya AI Call Logs + Popup
  // -------------------------
  const [showPopup, setShowPopup] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);

  const callLogs = [
    {
      callId: "C101",
      duration: "2m 20s",
      sentiment: "Positive",
      aiSummary: "Customer is interested in loan options. No issues detected.",
    },
    {
      callId: "C102",
      duration: "4m 11s",
      sentiment: "Negative",
      aiSummary:
        "Customer is confused about document requirements. Follow-up needed.",
    },
    {
      callId: "C103",
      duration: "1m 45s",
      sentiment: "Neutral",
      aiSummary:
        "Customer asked about interest rates. No negative indicators found.",
    },
  ];

  const openPopup = (call) => {
    setSelectedCall(call);
    setShowPopup(true);
  };

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">Voice Agent Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400">Total Calls</p>
          <p className="text-3xl font-bold text-white mt-1">{totalCalls}</p>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400">Success Rate</p>
          <p className="text-3xl font-bold text-green-400 mt-1">
            {successRate}
          </p>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400">Avg Call Duration</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">
            {avgDuration}
          </p>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400">AI Response Latency</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">
            {aiLatency}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Success vs Failed Calls */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">
            Successful vs Failed Calls
          </p>
          <div className="h-60 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={callStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                >
                  {callStatus.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Call Trend */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">Hourly Call Trend</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyCalls}>
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="calls" stroke="#60a5fa" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Keywords Table */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
        <p className="text-sm font-semibold mb-3">Most Common User Queries</p>
        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-2">Keyword</th>
              <th className="py-2">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((k, index) => (
              <tr key={index} className="border-b border-slate-700">
                <td className="py-2">{k.word}</td>
                <td className="py-2">{k.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------ */}
      {/* ⭐ Riya AI Insights Table */}
      {/* ------------------------ */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mt-8">
        <p className="text-sm font-semibold mb-3">Call Logs (Riya AI Insights)</p>

        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-2">Call ID</th>
              <th className="py-2">Duration</th>
              <th className="py-2">Sentiment</th>
              <th className="py-2">Riya AI</th>
            </tr>
          </thead>

          <tbody>
            {callLogs.map((call, index) => (
              <tr key={index} className="border-b border-slate-700">
                <td className="py-2">{call.callId}</td>
                <td className="py-2">{call.duration}</td>
                <td className="py-2">{call.sentiment}</td>
                <td className="py-2">
                  <button
                    onClick={() => openPopup(call)}
                    className="bg-blue-500 text-white px-3 py-1 rounded"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------ */}
      {/* ⭐ Riya AI Popup */}
      {/* ------------------------ */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-slate-800 p-6 rounded-xl w-96 border border-slate-700">
            <h2 className="text-lg font-bold mb-4">Riya AI Insights</h2>

            <p><strong>Call ID:</strong> {selectedCall.callId}</p>
            <p className="mt-2"><strong>Summary:</strong></p>
            <p className="text-slate-300 mt-1">{selectedCall.aiSummary}</p>

            <button
              className="bg-red-500 text-white px-4 py-1 mt-5 rounded"
              onClick={() => setShowPopup(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default VoiceAnalytics;
