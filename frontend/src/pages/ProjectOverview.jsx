// src/pages/ProjectOverview.jsx
import React from "react";
import AdminLayout from "../components/AdminLayout";

function ProjectOverview() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">Project Overview</h1>

      {/* About Project */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">
          AI Loan Eligibility & Voice Agent System
        </h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          This project is designed to provide an AI-powered loan eligibility prediction
          combined with a smart AI Voice Assistant capable of interacting with users,
          collecting inputs, and assisting them through loan processing queries in real-time.
        </p>
      </div>

      {/* Architecture Section */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">System Architecture</h2>

        <ul className="text-sm text-slate-300 space-y-2">
          <li>🔹 <b>Frontend:</b> React + TailwindCSS Dashboard</li>
          <li>🔹 <b>Backend:</b> Python (FastAPI / Flask)</li>
          <li>🔹 <b>Machine Learning Model:</b> Loan Eligibility Regression + Classification</li>
          <li>🔹 <b>AI Voice Agent:</b> Real-time speech-to-text + intent extraction</li>
          <li>🔹 <b>Database:</b> Firebase / Supabase / JSON API from backend</li>
          <li>🔹 <b>Deployment:</b> Localhost / Cloud-ready project</li>
        </ul>
      </div>

      {/* Tech Stack */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Tech Stack</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="font-semibold">Frontend</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>• React.js</li>
              <li>• TailwindCSS</li>
              <li>• Recharts (Charts)</li>
              <li>• React Router</li>
            </ul>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="font-semibold">Backend</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>• Python</li>
              <li>• FastAPI / Flask</li>
              <li>• REST API Endpoints</li>
            </ul>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="font-semibold">Machine Learning</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>• Feature Engineering</li>
              <li>• Model Training & Testing</li>
              <li>• Performance Metrics</li>
            </ul>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="font-semibold">Voice Agent</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>• Speech to Text</li>
              <li>• Intent Recognition</li>
              <li>• Real-time API Integration</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Team Contributions */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Team Contributions</h2>

        <ul className="text-sm text-slate-300 space-y-2">
          <li>👩‍💻 <b>You (Dashboard Lead):</b> Built full admin dashboard with charts, tables, visualizations.</li>
          <li>🤖 <b>ML Team:</b> Prepared loan model, trained & tested algorithms.</li>
          <li>🗣️ <b>Voice Agent Team:</b> Developed conversational AI backend.</li>
          <li>🛠️ <b>Backend Team:</b> API integration & routing logic.</li>
        </ul>
      </div>

      {/* Project Summary */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">
          Summary
        </h2>
        <p className="text-sm text-slate-300">
          This project integrates Machine Learning, AI Voice Systems, and a full-featured Admin Dashboard.
          It demonstrates strong understanding of AI, software development, and analytics — suitable for
          enterprise-level implementation in financial services.
        </p>
      </div>
    </AdminLayout>
  );
}

export default ProjectOverview;
