import PublicDashboard from "./pages/PublicDashboard";
import React, { lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import MainLayout from "./layout/MainLayout";
import Verification from "./pages/Verification";

// Pages
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import ApplyPage from "./pages/ApplyPage";
import EligibilityResultPage from "./pages/EligibilityResultPage";

// Components
import VoiceAgentRealtimeV2 from "./components/VoiceAgentRealtime_v2";

// Dashboard pages
import Login from "./pages/Login";
import MainDashboard from "./pages/MainDashboard";
import LoanAnalytics from "./pages/LoanAnalytics";
import MLPerformance from "./pages/MLPerformance";
import VoiceAnalytics from "./pages/VoiceAnalytics";
import ApplicationsTable from "./pages/ApplicationsTable";
import Transcripts from "./pages/Transcripts";
import SystemSettings from "./pages/SystemSettings";
import ProjectOverview from "./pages/ProjectOverview";
import LoanRejectionDashboard from "./pages/LoanRejectionDashboard";
import HelpPage from "./pages/HelpPage";
import ContactPage from "./pages/ContactPage";

// Utils

import { auth } from "./utils/auth";

// Lazy import for ManagerDashboard (must be after all import statements)
const ManagerDashboard = lazy(() => import("./pages/Manager"));

// ...existing code...

// Protected Route Wrapper
function ProtectedRoute({ children, requireManager = false }) {
  const authed = auth.isAuthenticated();
  const manager = auth.isManager();

  if (!authed) return <Navigate to="/auth" replace />;
  if (requireManager && !manager) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/manager"
            element={
              <ProtectedRoute requireManager={true}>
                <React.Suspense fallback={<div>Loading...</div>}>
                  <ManagerDashboard />
                </React.Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/auth"
            element={
              auth.isAuthenticated() ? (
                <Navigate
                  to={auth.isManager() ? "/manager" : "/apply"}
                  replace
                />
              ) : (
                <AuthPage />
              )
            }
          />
          {/* Application Page */}
          <Route path="/apply" element={<ApplyPage />} />
          {/* Document Verification Page */}
          <Route path="/verify" element={<Verification />} />
          {/* Eligibility Result Page */}
          <Route
            path="/eligibility-result"
            element={<EligibilityResultPage />}
          />
          {/* Help Page */}
          <Route path="/help" element={<HelpPage />} />
          {/* Contact Page */}
          <Route path="/contact" element={<ContactPage />} />
          {/* Public Login (Applicant Login) */}
          <Route path="/auth" element={<AuthPage />} />
          {/* Admin Login */}
          <Route path="/login" element={<Login />} />
          {/* DASHBOARD ROUTES */}
          <Route path="/admin/dashboard" element={<MainDashboard />} />
          <Route path="/admin/loan-analytics" element={<LoanAnalytics />} />
          <Route path="/admin/ml-performance" element={<MLPerformance />} />
          <Route path="/admin/voice-analytics" element={<VoiceAnalytics />} />
          <Route path="/admin/applications" element={<ApplicationsTable />} />
          <Route path="/admin/transcripts" element={<Transcripts />} />
          <Route path="/admin/settings" element={<SystemSettings />} />
          <Route path="/admin/overview" element={<ProjectOverview />} />
          <Route
            path="/admin/loan-rejection/:userId"
            element={<LoanRejectionDashboard />}
          />
          {/* Voice agent */}
          <Route path="/voice-agent" element={<VoiceAgentRealtimeV2 />} />
          {/* Public Dashboard View (read-only) */}
          <Route
            path="/public-dashboard/:token"
            element={<PublicDashboard />}
          />
          {/* 404 → redirect home */}
          <Route path="*" element={<Navigate to="/" />} />
          {/* Loan Rejection Details */}
          <Route
            path="/loan-rejection/:userId"
            element={
              <ProtectedRoute>
                <LoanRejectionDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
        <ToastContainer position="top-right" autoClose={4000} />
      </MainLayout>
    </Router>
  );
}
