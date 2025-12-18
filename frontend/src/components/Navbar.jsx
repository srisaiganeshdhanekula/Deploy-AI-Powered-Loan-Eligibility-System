import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "../utils/auth";
import {
  Menu,
  X,
  Home,
  FileText,
  BarChart3,
  LogOut,
  LogIn,
  Shield,
  User,
} from "lucide-react";
import UserNotifications from "./UserNotifications";

/*
  Redesigned NAVBAR
  - Cleaner structure
  - Modern layout
  - Left Sidebar + Top Minimal Navbar Hybrid
  - Works with MainLayout wrapper
  - Fully responsive, animated, enterprise UI
*/

export default function Navbar() {
  const userDropdownRef = React.useRef(null);
  const userIconRef = React.useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = auth.isAuthenticated();
  const isManager = auth.isManager();
  const user = auth.getUser();

  React.useEffect(() => {
    if (!showUserDropdown) return;
    function handleClickOutside(event) {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target) &&
        userIconRef.current &&
        !userIconRef.current.contains(event.target)
      ) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserDropdown]);

  const handleLogout = () => {
    auth.logout();
    navigate("/");
  };

  const routes = [
    { label: "Home", href: "/", icon: Home, show: true },
    { label: "Apply", href: "/apply", icon: FileText, show: isAuthenticated },
    {
      label: "Manager",
      href: "/manager",
      icon: BarChart3,
      show: isAuthenticated && isManager,
    },
    { label: "Help", href: "/help", icon: Shield, show: true },
    { label: "Contact Us", href: "/contact", icon: User, show: true },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Top Navbar */}
      <header className="h-16 border-b bg-white flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
        {/* Left section */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-6 h-6" />
          </button>

          <Link to="/" className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl shadow text-white">
              <Shield className="w-6 h-6" />
            </div>
            <span className="font-semibold hidden sm:block text-gray-900 text-lg">
              AI Loan System
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 ml-6">
            {routes
              .filter((r) => r.show)
              .map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "text-indigo-600"
                      : "text-gray-600 hover:text-indigo-600"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-4">
          {/* User Notifications */}
          {isAuthenticated && !isManager && user?.id && (
            <UserNotifications userId={user.id} />
          )}

          {/* User Dropdown */}
          {isAuthenticated ? (
            <div className="relative">
              <button
                ref={userIconRef}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm focus:outline-none"
                onClick={() => setShowUserDropdown((v) => !v)}
              >
                <User className="w-6 h-6 text-indigo-700" />
              </button>
              <AnimatePresence>
                {showUserDropdown && (
                  <motion.div
                    ref={userDropdownRef}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <User className="w-8 h-8 text-indigo-700" />
                      <div>
                        <div className="font-semibold text-gray-900">
                          {user?.full_name || user?.name || "User"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {user?.email || "No email"}
                        </div>
                      </div>
                    </div>
                    <Link
                      to="/help"
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold mb-1"
                    >
                      <Shield className="w-4 h-4 text-indigo-700" /> Help
                    </Link>
                    <Link
                      to="/contact"
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold mb-1"
                    >
                      <User className="w-4 h-4 text-indigo-700" /> Contact Us
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm mt-2 font-semibold"
                    >
                      <LogOut className="w-4 h-4 text-red-700" /> Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/auth"
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              <LogIn className="w-4 h-4 inline-block mr-1" /> Login
            </Link>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-40 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: -250 }}
              animate={{ x: 0 }}
              exit={{ x: -250 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="fixed left-0 top-0 h-full w-64 bg-white z-50 shadow-xl p-4 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Menu</h2>
                <button onClick={() => setIsSidebarOpen(false)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="space-y-1">
                {routes
                  .filter((r) => r.show)
                  .map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                        {
                          true: "bg-indigo-50 text-indigo-700",
                          false: "hover:bg-gray-100",
                        }[isActive(item.href)]
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  ))}
              </nav>

              <div className="mt-auto pt-4 border-t">
                {isAuthenticated ? (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                ) : (
                  <Link
                    to="/auth"
                    onClick={() => setIsSidebarOpen(false)}
                    className="w-full block px-3 py-2 rounded-lg bg-indigo-600 text-white text-center text-sm"
                  >
                    Login
                  </Link>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
