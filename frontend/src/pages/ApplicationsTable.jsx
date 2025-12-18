// src/pages/ApplicationsTable.jsx
import React from "react";
import AdminLayout from "../components/AdminLayout";

function ApplicationsTable() {
  // Sample application data (later can be connected to backend)
  const applications = [
    {
      id: 1,
      name: "Rahul Verma",
      income: 45000,
      credit: 720,
      loan: 200000,
      score: 0.82,
      result: "Eligible",
      mode: "Voice",
      date: "2025-01-12",
      confidence: "91%",
    },
    {
      id: 2,
      name: "Sneha Rao",
      income: 30000,
      credit: 650,
      loan: 150000,
      score: 0.66,
      result: "Eligible",
      mode: "Text",
      date: "2025-01-10",
      confidence: "83%",
    },
    {
      id: 3,
      name: "Amit Shah",
      income: 25000,
      credit: 580,
      loan: 180000,
      score: 0.42,
      result: "Not Eligible",
      mode: "Voice",
      date: "2025-01-09",
      confidence: "54%",
    },
    {
      id: 4,
      name: "Priya Singh",
      income: 80000,
      credit: 810,
      loan: 400000,
      score: 0.93,
      result: "Eligible",
      mode: "Text",
      date: "2025-01-06",
      confidence: "96%",
    },
  ];

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">Loan Applications</h1>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-3 px-2">ID</th>
              <th className="py-3 px-2">Name</th>
              <th className="py-3 px-2">Income</th>
              <th className="py-3 px-2">Credit Score</th>
              <th className="py-3 px-2">Loan Amount</th>
              <th className="py-3 px-2">Eligibility Score</th>
              <th className="py-3 px-2">Result</th>
              <th className="py-3 px-2">Mode</th>
              <th className="py-3 px-2">Date</th>
              <th className="py-3 px-2">Confidence</th>
            </tr>
          </thead>

          <tbody>
            {applications.map((app) => (
              <tr
                key={app.id}
                className="border-b border-slate-700 hover:bg-slate-700/40 transition"
              >
                <td className="py-3 px-2">{app.id}</td>
                <td className="py-3 px-2">{app.name}</td>
                <td className="py-3 px-2">₹{app.income.toLocaleString()}</td>
                <td className="py-3 px-2">{app.credit}</td>
                <td className="py-3 px-2">₹{app.loan.toLocaleString()}</td>
                <td className="py-3 px-2">{(app.score * 100).toFixed(1)}%</td>

                <td
                  className="py-3 px-2 font-semibold"
                  style={{
                    color: app.result === "Eligible" ? "#34d399" : "#ef4444",
                  }}
                >
                  {app.result}
                </td>

                <td className="py-3 px-2">{app.mode}</td>
                <td className="py-3 px-2">{app.date}</td>
                <td className="py-3 px-2">{app.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export default ApplicationsTable;
