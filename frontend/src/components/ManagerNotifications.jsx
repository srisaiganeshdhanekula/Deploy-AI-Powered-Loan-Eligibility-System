import React, { useEffect, useState, useRef, useCallback } from "react";
import { Bell, X, AlertCircle, CheckCircle, FileCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { managerAPI } from "../utils/api";

// Derive WebSocket URL from API URL (or explicit env override) so it hits the backend, not the CRA dev server
const getWsUrl = () => {
  if (process.env.REACT_APP_WS_URL) return process.env.REACT_APP_WS_URL;

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  try {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/manager/notifications";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    // Fallback: assume backend on port 8000
    const host = window.location.hostname || "localhost";
    return `ws://${host}:8000/ws/manager/notifications`;
  }
};

const WS_URL = getWsUrl();

function ManagerNotifications({
  onNotificationClick,
  setNotifCount,
  setUnreadCount,
  onNewNotification,
}) {
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setLocalUnreadCount] = useState(0);
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case "new_application":
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
      case "application_documents_verified":
        return <FileCheck className="w-5 h-5 text-green-500" />;
      case "application_approved":
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      default:
        return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  // Get notification title based on type
  const getNotificationTitle = (type) => {
    switch (type) {
      case "new_application":
        return "New Loan Application";
      case "application_documents_verified":
        return "Documents Verified";
      case "application_approved":
        return "Application Approved";
      default:
        return "Manager Notification";
    }
  };

  // Get notification color based on type
  const getNotificationColor = (type) => {
    switch (type) {
      case "new_application":
        return "border-blue-500 bg-blue-50";
      case "application_documents_verified":
        return "border-green-500 bg-green-50";
      case "application_approved":
        return "border-emerald-500 bg-emerald-50";
      default:
        return "border-blue-500 bg-blue-50";
    }
  };

  // Connect to WebSocket with auto-reconnect
  const connectWebSocket = useCallback(() => {
    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log("✓ Connected to manager notifications");
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📨 Received notification:", data);

          if (data.type) {
            setNotifications((prev) => {
              const newNotif = {
                ...data,
                id: Date.now() + Math.random(),
                read: false,
                timestamp: new Date().toISOString(),
              };

              // Keep only last 20 notifications
              const updated = [newNotif, ...prev].slice(0, 20);
              const unread = updated.filter((n) => !n.read).length;

              setLocalUnreadCount(unread);
              setUnreadCount && setUnreadCount(unread);
              setNotifCount && setNotifCount(updated.length);

              // Auto-show panel for new notifications
              setShowPanel(true);

              // Trigger callback to refresh dashboard data
              if (onNewNotification) {
                onNewNotification(newNotif);
              }

              return updated;
            });
          }
        } catch (err) {
          console.error("Failed to parse notification:", err);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("✗ Disconnected from notifications");
        // Auto-reconnect with exponential backoff
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current += 1;
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttempts.current),
            30000
          );
          console.log(
            `Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`
          );
          setTimeout(connectWebSocket, delay);
        }
      };
    } catch (err) {
      console.error("WebSocket connection failed:", err);
    }
  }, [setNotifCount, setUnreadCount, onNewNotification]);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Always seed the bell with the most recent application on mount,
  // so managers see at least the latest application even if they
  // opened the dashboard after it was created (no live WS event).
  useEffect(() => {
    const preloadLatestApplication = async () => {
      try {
        const res = await managerAPI.getApplications(null, 1, 1);
        const apps = res?.data || [];
        if (!apps.length) return;
        const app = apps[0];

        setNotifications((prev) => {
          // Don't override real-time notifications if they already exist
          if (prev.length > 0) return prev;

          const notif = {
            type: "new_application",
            full_name: app.full_name,
            email: app.email,
            loan_amount: app.loan_amount_requested || app.loan_amount,
            application_id: app.id,
            created_at: app.created_at,
            id: Date.now() + Math.random(),
            read: false,
            timestamp: new Date().toISOString(),
          };

          const updated = [notif, ...prev].slice(0, 20);
          const unread = updated.filter((n) => !n.read).length;

          setLocalUnreadCount(unread);
          setUnreadCount && setUnreadCount(unread);
          setNotifCount && setNotifCount(updated.length);

          return updated;
        });
      } catch (e) {
        console.error("Failed to preload latest application notification", e);
      }
    };

    preloadLatestApplication();
  }, [setNotifCount, setUnreadCount]);

  // Mark notification as read
  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setLocalUnreadCount((prev) => Math.max(0, prev - 1));
    setUnreadCount && setUnreadCount(Math.max(0, unreadCount - 1));
  };

  // Dismiss notification
  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Clear all notifications
  const clearAll = () => {
    setNotifications([]);
    setLocalUnreadCount(0);
    setUnreadCount && setUnreadCount(0);
  };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg hover:shadow-xl transition-shadow"
        title={`${unreadCount} unread notification${
          unreadCount !== 1 ? "s" : ""
        }`}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-none bg-red-500 text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Notification Panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-96 max-h-[calc(100vh-120px)] rounded-lg shadow-2xl bg-white border border-gray-200 overflow-hidden flex flex-col z-50"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5" />
                <div>
                  <h3 className="font-semibold text-lg">Notifications</h3>
                  <p className="text-sm opacity-90">
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : "All caught up"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPanel(false)}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1 max-h-[calc(100vh-200px)]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Bell className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`p-4 border-l-4 transition-colors ${getNotificationColor(
                        notif.type
                      )} ${notif.read ? "opacity-60" : "opacity-100"}`}
                    >
                      <div
                        className="flex items-start gap-3 cursor-pointer"
                        onClick={() => markAsRead(notif.id)}
                      >
                        <div className="mt-1">
                          {getNotificationIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900">
                            {getNotificationTitle(notif.type)}
                          </h4>
                          {notif.full_name && (
                            <p className="text-sm text-gray-700 mt-1">
                              <span className="font-medium">Applicant:</span>{" "}
                              {notif.full_name}
                            </p>
                          )}
                          {notif.email && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Email:</span>{" "}
                              {notif.email}
                            </p>
                          )}
                          {notif.loan_amount && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Loan Amount:</span>{" "}
                              ${Number(notif.loan_amount).toLocaleString()}
                            </p>
                          )}
                          {notif.application_id && (
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              ID: {notif.application_id}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(
                              notif.created_at || notif.timestamp
                            ).toLocaleString()}
                          </p>
                        </div>
                        {!notif.read && (
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notif.id);
                        }}
                        className="ml-8 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Dismiss
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
                <button
                  onClick={clearAll}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ManagerNotifications;
