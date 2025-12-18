// src/pages/SystemSettings.jsx
import React from "react";
import AdminLayout from "../components/AdminLayout";

function SystemSettings() {
  const systemData = {
    modelVersion: "v1.3.2 – Updated Jan 2025",
    apiStatus: "Online",
    dbStatus: "Connected",
    uptime: "12 days 5 hours",
    lastTrained: "2025-01-05",
    environment: "Production",
    activeUsers: 49,
    lastUpdated: "2025-01-14 09:45 AM",
  };

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">System Settings & Status</h1>

      {/* System Status Card */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-slate-200">
          System Overview
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Model Version</p>
            <p className="text-lg font-bold text-white">{systemData.modelVersion}</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">API Status</p>
            <p
              className={`text-lg font-bold ${
                systemData.apiStatus === "Online" ? "text-green-400" : "text-red-400"
              }`}
            >
              {systemData.apiStatus}
            </p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Database Status</p>
            <p
              className={`text-lg font-bold ${
                systemData.dbStatus === "Connected" ? "text-green-400" : "text-red-400"
              }`}
            >
              {systemData.dbStatus}
            </p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">System Uptime</p>
            <p className="text-lg font-bold text-blue-400">{systemData.uptime}</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Last Model Training</p>
            <p className="text-lg font-bold text-yellow-400">{systemData.lastTrained}</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Environment</p>
            <p className="text-lg font-bold text-purple-400">{systemData.environment}</p>
          </div>

        </div>
      </div>

      {/* Additional Settings */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h2 className="text-lg font-semibold mb-4 text-slate-200">
          Additional Information
        </h2>

        <p className="text-sm text-slate-300">
          <b>Active Admin Users:</b> {systemData.activeUsers}
        </p>
        <p className="text-sm text-slate-300 mt-2">
          <b>Last System Update:</b> {systemData.lastUpdated}
        </p>

        <p className="text-xs text-slate-400 mt-4">
          *This system status is auto-generated for monitoring the AI Loan Eligibility dashboard.
        </p>
      </div>
    </AdminLayout>
  );
}

export default SystemSettings;
