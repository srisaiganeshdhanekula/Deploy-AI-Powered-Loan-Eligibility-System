import React from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/auth";
import { motion } from "framer-motion";
import {
  Bot,
  FileText,
  TrendingUp,
  ArrowRight,
  Shield,
  PhoneCall,
} from "lucide-react";
import MiniChatbot from "../components/MiniChatbot";

/*
  Redesigned Home Page
  - Clean, modern hero section
  - Subtle gradients & motion
  - Professional enterprise UI (dash-style)
  - Fully matches redesigned Navbar + App Layout
  - Reduced clutter + improved readability
*/

export default function Home() {
  const navigate = useNavigate();
  const [showMiniChatbot, setShowMiniChatbot] = React.useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-100">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 flex flex-col lg:flex-row items-center gap-12">
        {/* Left: Text */}
        <div className="flex-1 space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight"
          >
            Welcome to the
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              AI Loan System
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-lg text-slate-600 max-w-lg"
          >
            Experience fast, intelligent and automated loan processing with
            AI-powered verification, smart assistance and instant eligibility
            scoring.
          </motion.p>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <button
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium shadow hover:bg-indigo-700 transition flex items-center gap-2"
              onClick={() => {
                if (!auth.isAuthenticated()) {
                  navigate("/auth");
                } else {
                  navigate("/apply");
                }
              }}
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium shadow hover:bg-slate-50 transition flex items-center gap-2"
              onClick={() => {
                if (!auth.isAuthenticated()) {
                  navigate("/auth");
                } else {
                  setShowMiniChatbot(true);
                }
              }}
            >
              Try AI Assistant <Bot className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
        {/* MiniChatbot popup, shown when button is clicked */}
        {showMiniChatbot && (
          <MiniChatbot
            isMinimized={false}
            onToggleMinimize={() => setShowMiniChatbot(false)}
          />
        )}

        {/* Right: Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="flex-1 flex justify-center"
        >
          <div className="relative w-72 h-72 md:w-80 md:h-80 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-500 p-1 shadow-xl">
            <div className="w-full h-full rounded-3xl bg-white flex items-center justify-center">
              <Shield className="w-24 h-24 text-indigo-600" />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
          Powerful Features
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Card */}
          <FeatureCard
            icon={Bot}
            title="AI Assistance"
            description="Chat with our AI assistant to guide your application, verify documents and answer questions instantly."
            color="text-indigo-600"
          />

          <FeatureCard
            icon={FileText}
            title="Smart Verification"
            description="Upload documents for automatic OCR scanning, fraud detection and instant validation."
            color="text-purple-600"
          />

          <FeatureCard
            icon={TrendingUp}
            title="Instant Eligibility"
            description="Get fast eligibility scoring powered by ML models and contextual financial analysis."
            color="text-blue-600"
          />

          <FeatureCard
            icon={PhoneCall}
            title="Voice Agent"
            description="Speak with our AI voice agent to complete your loan journey hands-free, from data capture to eligibility."
            color="text-emerald-600"
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-indigo-600 text-white text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-3xl font-bold mb-4"
        >
          Ready to Apply?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-lg mb-8 opacity-90"
        >
          Start your application and let AI assist you every step of the way.
        </motion.p>

        <button
          className="inline-flex items-center gap-2 px-8 py-3 bg-white text-indigo-700 rounded-xl shadow font-medium hover:bg-indigo-50 transition"
          onClick={() => {
            if (!auth.isAuthenticated()) {
              navigate("/auth");
            } else {
              navigate("/apply?view=form");
            }
          }}
        >
          Begin Application <ArrowRight className="w-5 h-5" />
        </button>
      </section>
    </div>
  );
}

/* Small Reusable Component */
function FeatureCard({ icon: Icon, title, description, color }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="p-8 bg-white rounded-2xl shadow border border-slate-100 text-center"
    >
      <div
        className={`mx-auto mb-4 p-4 rounded-xl bg-slate-100 inline-block ${color}`}
      >
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </motion.div>
  );
}
