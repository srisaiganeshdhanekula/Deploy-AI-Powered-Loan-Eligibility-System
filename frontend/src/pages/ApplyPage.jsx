import React, { useEffect, useRef, useState } from "react";
import { auth } from "../utils/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import MiniChatbot from "../components/MiniChatbot";
import LoanApplicationForm from "../components/LoanApplicationForm";
import LoanResultCard from "../components/LoanResultCard";
import CallingAgentPanel from "../components/CallingAgentPanel";

/*
  Redesigned Apply Page
  - Cleaner split layout
  - Modern card styles matching Home + Navbar redesign
  - Smooth transitions between chatbot, voice panel, and form
  - Professional dashboard-like layout
  - Reusable motion presets
*/

export default function ApplyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Require authentication before showing page
  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate("/auth");
    }
  }, [navigate]);
  // ...existing code...
  const formRef = useRef(null);
  const resultRef = useRef(null);

  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [applicationData, setApplicationData] = useState(null);
  const [applicationId, setApplicationId] = useState(null);

  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "voice"; // voice | form

  useEffect(() => {
    if (view === "form" && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [view]);

  useEffect(() => {
    const state = location.state || {};
    if (state.eligibilityResult) {
      setEligibilityResult(state.eligibilityResult);
      if (state.applicationId) setApplicationId(state.applicationId);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  }, [location.state]);

  return (
    <div className="min-h-screen bg-slate-50 py-14 px-6 relative">
      <div className="max-w-7xl mx-auto w-full space-y-10">
        {/* Intro Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white border shadow-lg rounded-3xl p-8 mb-4"
        >
          <div className="flex flex-col items-center justify-center text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Apply for a Loan
            </h1>
            <p className="text-slate-600 max-w-3xl text-lg mb-6">
              Use the voice agent for instant eligibility, or fill out the form directly. You can get help from the AI assistant anytime.
            </p>
          </div>
        </motion.div>

        {/* Split Layout: Voice Agent Left, Form Right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Voice Agent */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="bg-white border shadow-md rounded-2xl p-6 flex flex-col justify-between"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-4">
              Voice-Based Calling Agent
            </h2>
            <CallingAgentPanel />
            {/* You can add tips or status here if needed */}
          </motion.div>

          {/* Right: Application Form + Banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="bg-white border shadow-md rounded-2xl p-6"
          >
            <div className="mb-4 p-4 bg-indigo-50 rounded-xl text-indigo-800 text-sm font-medium">
              Need help? Use the AI Assistant (bottom right) or ask the voice agent for guidance.
            </div>
            {!eligibilityResult ? (
              <div ref={formRef}>
                <h2 className="text-xl font-semibold text-slate-800 mb-4">
                  Loan Application Form
                </h2>
                <LoanApplicationForm
                  setEligibilityResult={setEligibilityResult}
                  setApplicationData={setApplicationData}
                  setApplicationId={(id) => {
                    setApplicationId(id);
                    // Redirect to verification page after application submit
                    if (id) navigate(`/verify?applicationId=${id}`);
                  }}
                />
              </div>
            ) : (
              <div ref={resultRef}>
                <LoanResultCard
                  result={eligibilityResult}
                  applicationData={applicationData}
                  applicationId={
                    applicationId || applicationData?.application_id
                  }
                />
              </div>
            )}
          </motion.div>
        </div>
      </div>
      {/* MiniChatbot fixed at bottom-right for all pages */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50 }}>
        <MiniChatbot applicationId={applicationId} />
      </div>
    </div>
  );
}