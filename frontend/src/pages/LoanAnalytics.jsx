// src/pages/LoanAnalytics.jsx
import React from "react";
import AdminLayout from "../components/AdminLayout";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function LoanAnalytics() {
  // Eligibility Breakdown
  const eligibilityData = [
    { name: "Eligible", value: 276 },
    { name: "Not Eligible", value: 152 },
  ];

  const COLORS = ["#34d399", "#ef4444"];

  // Loan Range Distribution
  const loanRanges = [
    { range: "< 2L", count: 95 },
    { range: "2–5L", count: 162 },
    { range: "5–10L", count: 112 },
    { range: "> 10L", count: 59 },
  ];

  // Credit Score Distribution
  const creditScoreData = [
    { score: "300-500", count: 35 },
    { score: "500-650", count: 96 },
    { score: "650-750", count: 145 },
    { score: "750+", count: 152 },
  ];

  // Income vs Loan Approval
  const incomeApproval = [
    { income: "20K", approval: 42 },
    { income: "40K", approval: 55 },
    { income: "60K", approval: 68 },
    { income: "80K", approval: 77 },
    { income: "100K", approval: 84 },
  ];

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">Loan Eligibility Analytics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pie Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">
            Eligibility Breakdown
          </p>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={eligibilityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {eligibilityData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Loan Amount Distribution Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">
            Loan Amount Distribution
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loanRanges}>
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Credit Score Graph */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">
            Credit Score Distribution
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={creditScoreData}>
                <XAxis dataKey="score" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Line Chart Row */}
      <div className="mt-8 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <p className="text-sm font-semibold mb-3">
          Income Level vs Loan Approval %
        </p>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={incomeApproval}>
              <XAxis dataKey="income" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="approval"
                stroke="#facc15"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AdminLayout>
  );
}

export default LoanAnalytics;
