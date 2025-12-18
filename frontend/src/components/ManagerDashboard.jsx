import React, { useCallback, useEffect, useMemo, useState } from "react";
// import { Dialog } from '@headlessui/react';
// Use Dialog.Title as <Dialog.Panel> and <Dialog.Title> inside Dialog
import { toast } from "react-toastify";
import {
  Users,
  DollarSign,
  Target,
  Eye,
  FileText,
  XCircle,
  BarChart3,
  Search,
  CheckCircle,
  Phone,
  Mail,
} from "lucide-react";
import MiniChatbot from "./MiniChatbot";
import ManagerNotifications from "./ManagerNotifications";
import { motion, AnimatePresence } from "framer-motion";
import { managerAPI } from "../utils/api";
import { auth } from "../utils/auth";

export default function ManagerDashboard() {
  // ---- state ----
  const [applications, setApplications] = useState([]); // raw
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState(null); // null | 'pending' | 'approved' | 'rejected'
  const [stats, setStats] = useState(null);
  const [notifModal, setNotifModal] = useState(null);
  const [, setNotifCount] = useState(0);

  // ---- lifecycle: load data ----
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stats and applications (limit 50 for now to see most)
      const [appsRes, statsRes] = await Promise.all([
        managerAPI.getApplications(null, 1, 50),
        managerAPI.getStatistics(),
      ]);

      setApplications(appsRes.data || []);
      setStats(statsRes.data || {});
    } catch (err) {
      console.error(err);
      setError("Failed to load manager data.");
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- derived data ----
  const filteredApplications = useMemo(() => {
    const term = (searchTerm || "").trim().toLowerCase();
    return applications
      .filter((a) => {
        if (filter && a.approval_status !== filter) return false;
        if (!term) return true;
        return (
          String(a.full_name || "")
            .toLowerCase()
            .includes(term) ||
          String(a.email || "")
            .toLowerCase()
            .includes(term) ||
          String(a.id || "")
            .toLowerCase()
            .includes(term)
        );
      })
      .sort((x, y) => {
        // keep newest first if create_at exists, else by id
        const dx = x.created_at ? new Date(x.created_at).getTime() : 0;
        const dy = y.created_at ? new Date(y.created_at).getTime() : 0;
        return dy - dx;
      });
  }, [applications, searchTerm, filter]);

  const statsCards = useMemo(() => {
    return [
      {
        title: "Total",
        value: stats?.total_applications ?? 0,
        icon: BarChart3,
        color: "text-primary-600",
        bgColor: "bg-primary-50",
        borderColor: "border-primary-100",
      },
      {
        title: "Approved",
        value: stats?.approved_applications ?? 0,
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-100",
      },
      {
        title: "Rejected",
        value: stats?.rejected_applications ?? 0,
        icon: XCircle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-100",
      },
      {
        title: "Pending",
        value: stats?.pending_applications ?? 0,
        icon: FileText,
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-100",
      },
    ];
  }, [stats]);

  const filterOptions = [
    { key: null, label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  // ---- handlers ----
  const openDetails = useCallback(async (id) => {
    // Fetch full details for the selected app
    try {
      const res = await managerAPI.getApplicationDetails(id);
      setSelectedApp(res.data);
    } catch (e) {
      toast.error("Failed to load application details");
    }
  }, []);

  const handleDecision = useCallback(
    async (id, decision) => {
      // optimistic UI update
      const oldApps = [...applications];
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, approval_status: decision } : a))
      );

      try {
        if (decision === "approved") {
          await managerAPI.approveApplication(id, "Approved via Dashboard");
        } else {
          await managerAPI.rejectApplication(id, "Rejected via Dashboard");
        }
        toast.success(`Application ${decision}`);
        // refresh stats
        const statsRes = await managerAPI.getStatistics();
        setStats(statsRes.data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to update decision");
        // revert on failure
        setApplications(oldApps);
      }
    },
    [applications]
  );

  // ---- navigation ----
  const handleViewDashboard = async () => {
    try {
      const user = window.auth?.getUser
        ? window.auth.getUser()
        : typeof auth !== "undefined"
        ? auth.getUser()
        : null;
      const userId = user?.id;
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      const res = await managerAPI.shareDashboard(userId);
      const token = res?.data?.token;
      if (token) {
        window.open(`/public-dashboard/${token}`, "_blank");
      } else {
        toast.error("Could not retrieve dashboard link.");
      }
    } catch (err) {
      toast.error("Failed to get dashboard link.");
    }
  };

  // ---- small helpers ----
  const niceCurrency = (val) => {
    if (val == null) return "N/A";
    const number = Number(val);
    if (Number.isNaN(number)) return "N/A";
    return number.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  // ---- render ----
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Notifications Modal - Moved here for correct context */}
      <AnimatePresence>
        {notifModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              className="bg-white w-full max-w-md rounded-lg shadow-lg overflow-hidden"
            >
              <div className="px-6 py-4 bg-gradient-to-r from-primary-600 to-secondary-600 text-white">
                <h3 className="text-lg font-semibold">
                  New Application Notification
                </h3>
              </div>

              <div className="px-6 py-4">
                <div className="text-sm text-gray-500 mb-4">
                  You have received a new loan application. Review and take
                  action now.
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      openDetails(notifModal.application_id);
                      setNotifModal(null);
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    View Details
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setNotifModal(null)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-8 px-4 space-y-6 relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">
              Manager Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Monitor and manage loan applications — real-time notifications
              enabled.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-gradient-to-br from-primary-50 to-white shadow-sm">
              <BarChart3 className="w-6 h-6 text-primary-600" />
            </div>
            <button
              onClick={fetchData}
              className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
              title="Refresh Data"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
            {/* Notifications Component - Positioned beside other controls */}
            <ManagerNotifications
              onNotificationClick={setNotifModal}
              setNotifCount={setNotifCount}
              setUnreadCount={setNotifCount}
              onNewNotification={fetchData}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((s) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center justify-between p-4 rounded-lg border ${s.borderColor} ${s.bgColor}`}
              >
                <div>
                  <p className="text-sm text-gray-500">{s.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {s.value}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${s.bgColor}`}>
                  <Icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Controls: Search + Filters */}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="w-full max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              className="w-full pl-11 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none"
              placeholder="Search by name, email or id..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {filterOptions.map((opt) => (
              <button
                key={String(opt.key)}
                onClick={() => setFilter(opt.key)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  filter === opt.key
                    ? "bg-primary-600 text-white shadow"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}

            <div className="ml-2 text-sm text-gray-500">
              {filteredApplications.length} result
              {filteredApplications.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-md p-3 bg-red-50 border border-red-100 text-red-700"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <div>{error}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                    Loan
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                    Eligibility
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      Loading applications...
                    </td>
                  </tr>
                ) : filteredApplications.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      <FileText className="mx-auto mb-2 w-8 h-8 text-gray-400" />
                      No applications found
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((app, idx) => (
                    <motion.tr
                      key={app.id || idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 * idx }}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {app.full_name || "—"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {app.email || "—"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <div className="font-bold text-gray-900">
                            {niceCurrency(
                              app.loan_amount || app.loan_amount_requested
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-gray-400" />
                            <div className="text-sm font-bold text-gray-900">
                              {app.eligibility_score == null
                                ? "N/A"
                                : `${Math.round(
                                    (app.eligibility_score || 0) * 100
                                  )}%`}
                            </div>
                          </div>
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <motion.div
                              className="h-2 rounded-full bg-gradient-to-r from-primary-600 to-secondary-600"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    Math.round(
                                      (app.eligibility_score || 0) * 100
                                    )
                                  )
                                )}%`,
                              }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        {app.mode ? (
                          <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
                            {app.mode}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <StatusBadge status={app.approval_status} />
                      </td>

                      <td className="px-6 py-4 text-right text-sm">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openDetails(app.id)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:shadow-sm"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                            <span className="text-sm text-gray-700">View</span>
                          </button>

                          {app.approval_status === "pending" && (
                            <>
                              <button
                                onClick={() =>
                                  handleDecision(app.id, "approved")
                                }
                                className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  handleDecision(app.id, "rejected")
                                }
                                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          <button
                            onClick={handleViewDashboard}
                            className="px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700"
                          >
                            <BarChart3 className="w-4 h-4 inline-block mr-1" />
                            View Dashboard
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        <AnimatePresence>
          {selectedApp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.96 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.96 }}
                className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ minWidth: "320px" }}
              >
                <div className="px-6 py-4 bg-gradient-to-r from-primary-600 to-secondary-600 text-white flex items-center justify-between sticky top-0 z-10">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedApp.full_name}
                    </h3>
                    <p className="text-sm opacity-90">Application Details</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedApp(null)}
                      className="p-2 rounded-full hover:bg-white/10"
                      aria-label="Close"
                    >
                      <XCircle className="w-6 h-6 text-white" />
                    </button>
                  </div>
                </div>

                <div
                  className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto"
                  style={{ maxHeight: "calc(80vh - 64px)" }}
                >
                  {/* Left column: contact & financial */}
                  <div className="space-y-4">
                    <ContactField
                      icon={Users}
                      label="Name"
                      value={selectedApp.full_name}
                    />
                    <ContactField
                      icon={Mail}
                      label="Email"
                      value={selectedApp.email}
                    />
                    <ContactField
                      icon={Phone}
                      label="Phone"
                      value={selectedApp.phone}
                    />
                    {(() => {
                      const loanAmountDetail =
                        selectedApp.loan_amount ??
                        selectedApp.loan_amount_requested ??
                        null;
                      const loanValue =
                        loanAmountDetail != null
                          ? `$${niceCurrency(loanAmountDetail)}`
                          : "N/A";
                      return (
                        <ContactField
                          icon={DollarSign}
                          label="Loan Amount"
                          value={loanValue}
                        />
                      );
                    })()}
                    {(() => {
                      const annualIncomeDetail =
                        selectedApp.annual_income ??
                        (selectedApp.monthly_income != null
                          ? selectedApp.monthly_income * 12
                          : null);
                      const incomeValue =
                        annualIncomeDetail != null
                          ? `$${niceCurrency(annualIncomeDetail)}`
                          : "N/A";
                      return (
                        <ContactField
                          icon={BarChart3}
                          label="Annual Income"
                          value={incomeValue}
                        />
                      );
                    })()}
                    <ContactField
                      icon={Target}
                      label="Eligibility Score"
                      value={
                        selectedApp.eligibility_score == null
                          ? "N/A"
                          : `${Math.round(
                              (selectedApp.eligibility_score || 0) * 100
                            )}%`
                      }
                    />
                    <ContactField
                      icon={FileText}
                      label="Credit Score"
                      value={selectedApp.credit_score ?? "N/A"}
                    />
                    <ContactField
                      icon={CheckCircle}
                      label="Approval Status"
                      value={selectedApp.approval_status}
                    />
                    <ContactField
                      icon={BarChart3}
                      label="Application Mode"
                      value={selectedApp.mode || "—"}
                    />
                    <ContactField
                      icon={FileText}
                      label="Created At"
                      value={
                        selectedApp.created_at
                          ? new Date(selectedApp.created_at).toLocaleString()
                          : "N/A"
                      }
                    />
                  </div>

                  {/* Right column: Uploaded Documents */}
                  <div className="space-y-4 lg:col-span-2">
                    <div className="bg-white p-4 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-5 h-5 text-primary-600" />
                        <span className="font-semibold text-gray-800">
                          Uploaded Documents
                        </span>
                      </div>
                      {/* Placeholder for documents. Replace with actual document list if available in selectedApp */}
                      {selectedApp.documents &&
                      selectedApp.documents.length > 0 ? (
                        <ul className="list-disc pl-5">
                          {selectedApp.documents.map((doc, i) => (
                            <li key={i} className="mb-1">
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-600 underline"
                              >
                                {doc.name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500">
                          No documents uploaded.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MiniChatbot fixed in bottom-right */}
        <div className="fixed bottom-6 right-6 z-50">
          <MiniChatbot />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   Small helper components
   --------------------------- */

function StatusBadge({ status }) {
  const statusMap = {
    approved: { className: "bg-green-100 text-green-800", text: "Approved" },
    rejected: { className: "bg-red-100 text-red-800", text: "Rejected" },
    pending: { className: "bg-yellow-100 text-yellow-800", text: "Pending" },
    null: { className: "bg-gray-100 text-gray-700", text: "Unknown" },
    undefined: { className: "bg-gray-100 text-gray-700", text: "Unknown" },
  };
  const s = statusMap[status] || statusMap.null;
  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${s.className}`}
    >
      {s.text}
    </span>
  );
}

function ContactField({ icon: Icon, label, value }) {
  // Highlight Loan Amount and Eligibility Score with darker colors
  let valueColor = "text-gray-900";
  if (label === "Loan Amount")
    valueColor = "text-red-900 bg-red-50 px-2 py-1 rounded font-extrabold";
  if (label === "Eligibility Score")
    valueColor = "text-blue-900 bg-blue-50 px-2 py-1 rounded font-extrabold";
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-100">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <div>{label}</div>
      </div>
      <div className={`text-lg font-extrabold ${valueColor}`}>
        {value ?? "N/A"}
      </div>
    </div>
  );
}

/* ---------------------------
   Placeholder network functions
   Replace with real API implementations
   Currently unused but kept for reference
   --------------------------- */

// async function loadApplications() {
// TODO: Replace with your API call, e.g.:
// const res = await fetch("/api/manager/applications");
// return await res.json();
// For now return mocked data so component works out-of-the-box:
// await sleep(200);
// return [...]
// }

// async function loadStats() {
// TODO: replace with real API call
// await sleep(80);
// return {...}
// }

// async function postDecision(id, decision) {
// Replace with POST/PUT request to set decision
// await sleep(150);
// Example: return await fetch(`/api/applications/${id}/decision`, {...})
// return { ok: true };
// }
