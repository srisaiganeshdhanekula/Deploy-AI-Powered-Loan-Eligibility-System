import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, MessageCircle, Minimize2, Send } from "lucide-react";

export default function MiniChatbot({
  applicationId = null,
  isMinimized = true,
  onToggleMinimize,
}) {
  const [selectedSection, setSelectedSection] = useState(null);
  const navigate = useNavigate();

  // Detect user role
  const user = auth.getUser();
  const isManager = user && user.role === "manager";

  const initialMessages = [
    {
      id: `mini-${Date.now()}`,
      role: "assistant",
      content: isManager
        ? "Hi Manager! Ask me about reviewing applications, analytics, or team support."
        : "Hi! I'm here to help with quick questions about your loan application. Ask me about eligibility, required documents, or how to apply!",
      timestamp: new Date(),
    },
  ];

  const [isExpanded, setIsExpanded] = useState(!isMinimized);
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, isExpanded]);

  const toggleExpanded = () => {
    if (!auth.isAuthenticated()) {
      navigate("/auth");
      return;
    }
    const next = !isExpanded;
    setIsExpanded(next);
    if (typeof onToggleMinimize === "function") onToggleMinimize(!next);
  };

  const startNewChat = () => {
    setMessages([
      {
        id: `mini-${Date.now()}`,
        role: "assistant",
        content:
          "Hi again! If you need more help, just ask your question here.",
        timestamp: new Date(),
      },
    ]);
    setInputValue("");
  };

  const handleLocalSend = () => {
    const trimmed = (inputValue || "").trim();
    if (!trimmed) return;
    setIsLoading(true);

    const userMsg = {
      id: `mini-user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    setTimeout(() => {
      const reply = {
        id: `mini-assistant-${Date.now()}`,
        role: "assistant",
        content:
          "Thanks for your question! To predict your eligibility, please provide your basic details or ask about the process. I can also guide you on required documents and next steps.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, reply]);
      setIsLoading(false);
    }, 600);
  };

  // Section and question structure for step-by-step flow
  const SUGGESTION_SECTIONS = isManager
    ? [
        {
          id: "manager-apps",
          label: "Applications & Review",
          questions: [
            { id: "review-apps", label: "How do I review applications?" },
            { id: "approve-reject", label: "How do I approve or reject?" },
            { id: "view-analytics", label: "How do I view analytics?" },
            { id: "team-support", label: "How do I support my team?" },
            { id: "manager-faqs", label: "Manager FAQs" },
          ],
        },
        {
          id: "manager-account",
          label: "Account & Support",
          questions: [
            { id: "reset-password", label: "How do I reset my password?" },
            { id: "data-security", label: "Is my data safe and secure?" },
            {
              id: "update-contact",
              label: "How do I update my contact details?",
            },
            { id: "customer-support", label: "How do I contact support?" },
            {
              id: "technical-issue",
              label: "What should I do if I face a technical issue?",
            },
          ],
        },
      ]
    : [
        {
          id: "application-docs",
          label: "Application & Documents",
          questions: [
            { id: "how-to-apply", label: "How to apply?" },
            { id: "required-docs", label: "What are the required documents?" },
            { id: "open-form", label: "Open application form" },
            { id: "upload-help", label: "How do I upload my documents?" },
            { id: "upload-fail", label: "What if my document upload fails?" },
            { id: "kyc-docs", label: "What documents are accepted for KYC?" },
            {
              id: "edit-application",
              label: "Can I edit my application after submitting?",
            },
          ],
        },
        {
          id: "loan-process",
          label: "Loan Process",
          questions: [
            {
              id: "eligibility-criteria",
              label: "What is the eligibility criteria?",
            },
            { id: "approval-time", label: "How long does approval take?" },
            { id: "interest-rate", label: "What is the interest rate?" },
            { id: "loan-status", label: "How do I check my loan status?" },
            {
              id: "multiple-loans",
              label: "Can I apply for more than one loan?",
            },
            {
              id: "application-summary",
              label: "Can I get a summary of my application?",
            },
          ],
        },
        {
          id: "account-support",
          label: "Account & Support",
          questions: [
            { id: "reset-password", label: "How do I reset my password?" },
            { id: "data-security", label: "Is my data safe and secure?" },
            {
              id: "update-contact",
              label: "How do I update my contact details?",
            },
            {
              id: "customer-support",
              label: "How do I contact customer support?",
            },
            { id: "faqs", label: "Where can I find FAQs?" },
            {
              id: "technical-issue",
              label: "What should I do if I face a technical issue?",
            },
          ],
        },
        {
          id: "ai-voice-help",
          label: "AI & Voice Help",
          questions: [
            { id: "voice-agent", label: "How do I use the voice agent?" },
            { id: "ai-help", label: "What can the AI assistant help me with?" },
          ],
        },
      ];

  const onQuickSuggestion = (id) => {
    if (id === "open-form") {
      navigate("/apply?view=form");
      return;
    }

    const mapping = isManager
      ? {
          "review-apps":
            "To review applications, go to the Manager Dashboard and select an application to view details.",
          "approve-reject":
            "You can approve or reject applications from the details view. Use the action buttons provided.",
          "view-analytics":
            "Analytics are available in your dashboard. You can view stats on approvals, rejections, and more.",
          "team-support":
            "Support your team by assigning applications, sharing feedback, and using the team chat features.",
          "manager-faqs":
            "Manager FAQs cover review process, analytics, and team management. See the Help section for more.",
          "reset-password":
            "Click 'Forgot Password' on the login page and follow the instructions.",
          "data-security":
            "Yes, your data is encrypted and protected according to industry standards.",
          "update-contact":
            "Go to your profile settings and update your contact information.",
          "customer-support":
            "Use the 'Contact Us' page or chat with our support team via the AI assistant.",
          "technical-issue":
            "Try refreshing the page or clearing your browser cache. If the issue persists, contact support.",
        }
      : {
          "how-to-apply":
            "You can start by opening the application form and filling in your details. If you need help, just ask!",
          "required-docs":
            "You must upload ALL of the following mandatory documents: Aadhaar, PAN, and KYC for ID verification, AND Bank Statement and Salary Slip for financial proof. Use the Upload section to submit them.",
          "eligibility-criteria":
            "Eligibility is based on your age, income, credit score, and submitted documents. You must be 18+, have a valid ID, and provide financial proof.",
          "approval-time":
            "Loan approval usually takes 1-3 business days after you submit all required documents.",
          "interest-rate":
            "Interest rates vary by loan type and applicant profile. Please check the loan details page or ask for a specific loan product.",
          "loan-status":
            "You can check your loan status in your dashboard or by contacting support.",
          "multiple-loans":
            "Yes, you can apply for multiple loans if you meet the eligibility criteria for each.",
          "upload-help":
            "Go to the Upload section, select your files, and click 'Submit'. Accepted formats: PDF, JPG, PNG.",
          "upload-fail":
            "Check your file size and format. If the issue persists, try again or contact support.",
          "kyc-docs":
            "Aadhaar, PAN, and KYC documents are required for verification.",
          "edit-application":
            "You can edit your application before final submission. After submission, contact support for changes.",
          "reset-password":
            "Click 'Forgot Password' on the login page and follow the instructions.",
          "data-security":
            "Yes, your data is encrypted and protected according to industry standards.",
          "update-contact":
            "Go to your profile settings and update your contact information.",
          "customer-support":
            "Use the 'Contact Us' page or chat with our support team via the AI assistant.",
          faqs: "FAQs are available in the Help section of the website.",
          "technical-issue":
            "Try refreshing the page or clearing your browser cache. If the issue persists, contact support.",
          "voice-agent":
            "Click the Voice Agent button and follow the prompts to interact using your voice.",
          "ai-help":
            "The AI assistant can answer questions about loans, guide you through the application, and help with document uploads.",
          "application-summary":
            "Yes, you can request a summary in your dashboard or ask the AI assistant for details.",
        };

    setInputValue(mapping[id] || "");
    setIsLoading(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `mini-assistant-${Date.now()}`,
          role: "assistant",
          content: mapping[id] || "Here's some help.",
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    }, 450);
  };

  if (!isExpanded) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <button
          onClick={toggleExpanded}
          aria-label="Open assistant"
          className="bg-primary-600 hover:bg-primary-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="hidden md:inline font-medium">AI Assistant</span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 12 }}
      className="fixed bottom-6 right-6 z-50 w-96 max-w-sm"
      style={{ height: 520 }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-white/20 p-1.5 rounded-lg">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-white text-sm font-semibold">AI Assistant</h3>
              <p className="text-primary-100 text-xs">Quick help & links</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={startNewChat}
              className="text-white/90 bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-xs"
            >
              🆕 New Chat
            </button>

            <button
              onClick={toggleExpanded}
              className="text-white hover:bg-white/20 p-1 rounded-lg transition-colors"
              aria-label="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30"
          style={{ minHeight: 0 }}
        >
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex max-w-xs items-end space-x-1.5 ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      msg.role === "user"
                        ? "bg-primary-600"
                        : "bg-white border border-gray-200"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="w-3 h-3 text-white" />
                    ) : (
                      <Bot className="w-3 h-3 text-primary-600" />
                    )}
                  </div>
                  <div
                    className={`px-3 py-2 rounded-lg shadow-sm text-sm ${
                      msg.role === "user"
                        ? "bg-primary-600 text-white"
                        : "border bg-white"
                    }`}
                  >
                    <p
                      className="leading-relaxed whitespace-pre-wrap"
                      style={{ color: msg.role === "user" ? "#fff" : "#222" }}
                    >
                      {msg.content}
                    </p>
                    <div className="text-xs mt-1 text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex justify-start"
            >
              <div className="flex items-end space-x-1.5">
                <div className="flex-shrink-0 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg shadow-sm">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestions + input */}
        <div
          className="border-t border-gray-100 p-3 bg-white"
          style={{ flexShrink: 0 }}
        >
          <div className="mb-2 text-xs" style={{ color: "#222" }}>
            Quick help
          </div>
          {/* Step-by-step section/category UI */}
          {!selectedSection ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTION_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setSelectedSection(section.id)}
                  className="whitespace-nowrap text-xs px-3 py-2 rounded-xl bg-gray-100 hover:bg-primary-100 border border-gray-200 text-gray-700 transition-colors shadow-sm font-semibold"
                  style={{ flex: "0 0 auto" }}
                >
                  {section.label}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {SUGGESTION_SECTIONS.find(
                  (s) => s.id === selectedSection
                ).questions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => onQuickSuggestion(q.id)}
                    className="whitespace-nowrap text-xs px-3 py-1 rounded-full bg-gray-100 hover:bg-primary-100 border border-gray-200 text-gray-700 transition-colors shadow-sm"
                    style={{ flex: "0 0 auto" }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelectedSection(null)}
                className="mt-1 text-xs text-primary-600 underline hover:text-primary-800"
              >
                ← Back to sections
              </button>
            </div>
          )}

          {/* Input + Send + Voice */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a quick question..."
              className="flex-grow min-w-0 text-sm border rounded px-3 py-2"
              style={{ color: "#222" }}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !isLoading) {
                  e.preventDefault();
                  handleLocalSend();
                }
              }}
            />

            {/* Send button immediately next to input */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleLocalSend}
              className="flex-shrink-0 bg-primary-600 text-white p-2 rounded"
              disabled={isLoading || !inputValue.trim()}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
