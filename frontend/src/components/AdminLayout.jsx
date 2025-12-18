import React from "react";
import { Link, useLocation } from "react-router-dom";


const sidebarLinks = [
  { label: "Home", to: "/" },
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Loan Analytics", to: "/admin/loan-analytics" },
  { label: "ML Performance", to: "/admin/ml-performance" },
  { label: "Voice Analytics", to: "/admin/voice-analytics" },
  { label: "Applications", to: "/admin/applications" },
  { label: "Transcripts", to: "/admin/transcripts" },
  { label: "System Settings", to: "/admin/settings" },
  { label: "Project Overview", to: "/admin/overview" },
];

const AdminLayout = ({ children }) => {
  if (process.env.NODE_ENV !== "production") {
    try {
      // Module-load debug to help detect circular imports/HMR issues
      // eslint-disable-next-line no-console
      console.debug("[DEV] AdminLayout rendered", {
        pathname: window?.location?.pathname,
      });
    } catch (e) {}
  }
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col py-8 px-4 min-h-screen shadow-lg">
        <div className="mb-8 text-2xl font-bold tracking-wide text-center">
          Admin Panel
        </div>
        <nav className="flex-1">
          <ul className="space-y-2">
            {sidebarLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`block px-4 py-2 rounded-lg transition-colors font-medium ${
                    location.pathname === link.to
                      ? "bg-slate-700 text-blue-400"
                      : "hover:bg-slate-800 hover:text-blue-300"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      {/* Main Content */}
      <main className="flex-1 p-8">{children}</main>
      {/* Manager notifications overlay removed */}
    </div>
  );
};

export default AdminLayout;
