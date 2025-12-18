// src/pages/MLPerformance.jsx
import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { managerAPI } from "../utils/api";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const MODEL_TABS = [
  { key: "xgboost", label: "XGBoost" },
  { key: "decision_tree", label: "Decision Tree" },
  { key: "random_forest", label: "Random Forest" },
];

function MLPerformance() {
  if (process.env.NODE_ENV !== "production") {
    try {
      // Module-load debug for HMR circular import tracing
      // eslint-disable-next-line no-console
      console.debug("[DEV] MLPerformance module initialized");
    } catch (e) {}
  }
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState("xgboost");
  const [live, setLive] = useState(false);
  const POLL_INTERVAL_MS = 30000; // 30 seconds

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await managerAPI.getModelMetrics();
        setMetrics(res.data);
      } catch (err) {
        console.error("Failed to fetch ML metrics", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
    if (process.env.NODE_ENV !== "production") {
      // log a render/refresh for debugging HMR issues
      // eslint-disable-next-line no-console
      console.debug(
        "[DEV] MLPerformance useEffect(fetch) executed, live=",
        live
      );
    }

    let timer = null;
    if (live) {
      timer = setInterval(() => {
        managerAPI
          .getModelMetrics()
          .then((r) => setMetrics(r.data))
          .catch(() => {});
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [live]);

  if (loading)
    return (
      <AdminLayout>
        <div className="p-8">Loading metrics...</div>
      </AdminLayout>
    );
  if (!metrics)
    return (
      <AdminLayout>
        <div className="p-8">No metrics available.</div>
      </AdminLayout>
    );

  // Choose active model metrics, fall back to empty structure
  const serverModel = metrics[activeModel] || {
    loaded: false,
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1: 0,
    feature_importance: [],
    confidence_distribution: [],
    confusionMatrix: [],
    outliers: [],
    validation_samples: 0,
  };

  // Sample fallback data to display when a model is not loaded.
  // This ensures the UI is informative during dev or when artifacts are missing.
  const SAMPLE_METRICS = {
    default: {
      loaded: false,
      accuracy: 0.78,
      precision: 0.75,
      recall: 0.72,
      f1: 0.735,
      validation_samples: 500,
      feature_importance: [
        { feature: "Monthly_Income", value: 0.22 },
        { feature: "Credit_Score", value: 0.19 },
        { feature: "Loan_Amount_Requested", value: 0.15 },
        { feature: "Existing_EMI", value: 0.1 },
        { feature: "Employment_Type", value: 0.08 },
      ],
      confidence_distribution: [
        { label: "0-20%", value: 0.05 },
        { label: "20-40%", value: 0.1 },
        { label: "40-60%", value: 0.3 },
        { label: "60-80%", value: 0.35 },
        { label: "80-100%", value: 0.2 },
      ],
      confusionMatrix: [
        { label: "True Positive", value: 120 },
        { label: "False Positive", value: 30 },
        { label: "True Negative", value: 200 },
        { label: "False Negative", value: 50 },
      ],
      outliers: [
        {
          id: 101,
          income: 120000,
          credit: 280,
          loan: 500000,
          result: "Rejected",
        },
        {
          id: 102,
          income: 10000,
          credit: 780,
          loan: 1000000,
          result: "Approved",
        },
      ],
    },
    xgboost: {
      accuracy: 0.95,
      precision: 0.94,
      recall: 0.93,
      f1: 0.935,
    },
    decision_tree: { accuracy: 0.89, precision: 0.88, recall: 0.87, f1: 0.875 },
    random_forest: { accuracy: 0.86, precision: 0.85, recall: 0.84, f1: 0.845 },
  };

  // If serverModel is not loaded, use a sample fallback for display.
  const isSample = !serverModel.loaded;
  const model = isSample
    ? { ...SAMPLE_METRICS.default, ...(SAMPLE_METRICS[activeModel] || {}) }
    : serverModel;

  const formatPct = (v) => {
    if (v === null || v === undefined) return "N/A";
    const n = Number(v);
    if (Number.isNaN(n)) return "N/A";
    return `${(n * 100).toFixed(2)}%`;
  };

  const featureImportance = model.feature_importance || [];
  const confidenceData = model.confidence_distribution || [];
  const outliers = model.outliers || [];

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">ML Model Performance</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {MODEL_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveModel(t.key)}
            className={`px-3 py-2 rounded-md font-medium transition-colors border-b-2 ${
              activeModel === t.key
                ? "bg-slate-800 text-blue-400 border-blue-400"
                : "bg-slate-700 text-white border-transparent hover:bg-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          <span className="text-sm text-slate-300">
            Live refresh (every 30s)
          </span>
        </label>
      </div>

      {/* Accuracy Section */}
      <div className="bg-slate-800 p-5 rounded-xl mb-6 border border-slate-700">
        <p className="text-sm font-semibold text-slate-300">Model Accuracy</p>
        <p className="text-4xl font-bold text-green-400 mt-2">
          {isSample
            ? `${formatPct(model.accuracy)} (sample)`
            : formatPct(model.accuracy)}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Evaluated on {model.validation_samples || "-"} validation samples
          {isSample ? " — sample data shown" : ""}
        </p>
      </div>

      {/* Feature Importance + Confidence Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Feature Importance Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm mb-2 font-semibold">Feature Importance</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={featureImportance}>
                <XAxis dataKey="feature" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confidence Distribution */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm mb-2 font-semibold">
            Prediction Confidence Distribution
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={confidenceData}>
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Confusion Matrix and Outliers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm font-semibold mb-3">Confusion Matrix</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={model.confusionMatrix || []}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6">
                  {(model.confusionMatrix || []).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        ["#34d399", "#ef4444", "#3b82f6", "#f59e42"][index % 4]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Outliers Table */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <p className="text-sm mb-4 font-semibold">
            Outlier Predictions (Anomalies)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="py-2 px-2 text-left">ID</th>
                  <th className="py-2 px-2 text-left">Income</th>
                  <th className="py-2 px-2 text-left">Credit Score</th>
                  <th className="py-2 px-2 text-left">Loan Amount</th>
                  <th className="py-2 px-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {outliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No outliers
                    </td>
                  </tr>
                ) : (
                  outliers.map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/50">
                      <td className="py-2 px-2">#{item.id}</td>
                      <td className="py-2 px-2">
                        {item.income ? `₹${item.income}` : "-"}
                      </td>
                      <td className="py-2 px-2">
                        {item.credit || item.credit_score || "-"}
                      </td>
                      <td className="py-2 px-2">
                        {item.loan ? `₹${item.loan}` : item.loan_amount || "-"}
                      </td>
                      <td
                        className={`py-2 px-2 font-semibold ${
                          item.result === "Approved"
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {item.result || item.status || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default MLPerformance;
