import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/auth";
import { motion, AnimatePresence } from "framer-motion";
import { chatAPI } from "../utils/api";
import { toast } from "react-toastify";
import { Send, Bot, User } from "lucide-react";

export default function Chatbot({ applicationId = null }) {
  const navigate = useNavigate();
  // Require authentication before showing chatbot
  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate("/auth");
    }
  }, [navigate]);
  const navigate = useNavigate();
  const generateId = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const [messages, setMessages] = useState([
    {
      id: generateId(),
      role: "assistant",
      content:
        "Hello! I'm your AI Loan Assistant. To get started, what's your full name?",
      timestamp: new Date(),
    },
  ]);
  const [currentAppId, setCurrentAppId] = useState(applicationId);
  const [showAppInput, setShowAppInput] = useState(false);
  const [appInputValue, setAppInputValue] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // Scroll to bottom on new messages
  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Send user message and process backend response
  const handleSendMessage = async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    if (isLoading) return;

    const userMessage = {
      id: generateId(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Fallback: reset isLoading after 10 seconds if not cleared
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    try {
      const response = await chatAPI.sendMessage(trimmed, currentAppId);

      const assistantMessages = [];
      const suggestions =
        response.data.suggestions ||
        response.data.suggested_next_steps ||
        [];

      assistantMessages.push({
        id: generateId(),
        role: "assistant",
        content: response.data.message || "Here's an update.",
        suggestions,
        timestamp: new Date(),
      });

      setMessages((prev) => [...prev, ...assistantMessages]);
      // If backend returns a new application_id, update state
      if (response.data && response.data.application_id && response.data.application_id !== currentAppId) {
        setCurrentAppId(response.data.application_id);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        },
      ]);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
      clearTimeout(loadingTimeout);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    // suggestion could be object {id, label} or string
    const text = typeof suggestion === "object" ? suggestion.label : suggestion;
    handleSendMessage(text);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen glass shadow-2xl border border-gray-100 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4 flex items-center space-x-3 justify-between rounded-t-2xl shadow-md">
        <div className="flex items-center space-x-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold">AI Loan Assistant</h3>
            <p className="text-primary-100 text-sm">Online and ready to help</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-white/30 hover:bg-white/50 text-primary-900 font-semibold px-3 py-1 rounded shadow-sm border border-white/40 transition"
            onClick={() => {
              setMessages([
                {
                  id: generateId(),
                  role: "assistant",
                  content:
                    "Hello! I'm your AI Loan Assistant. To get started, what's your full name?",
                  timestamp: new Date(),
                },
              ]);
              setCurrentAppId(null);
              setAppInputValue("");
              setShowAppInput(false);
            }}
            title="Start a new chat session"
          >
            New Chat
          </button>
          <button
            className="bg-white/30 hover:bg-white/50 text-primary-900 font-semibold px-3 py-1 rounded shadow-sm border border-white/40 transition"
            onClick={() => navigate('/apply?view=form')}
            title="Apply with Form"
          >
            Apply with Form
          </button>
          <button
            className="bg-white/30 hover:bg-white/50 text-primary-900 font-semibold px-3 py-1 rounded shadow-sm border border-white/40 transition"
            onClick={() => setShowAppInput((v) => !v)}
            title="Open an existing application by ID"
          >
            Open Application
          </button>
        </div>
      </div>
      {/* Open Application Input */}
      {showAppInput && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 flex items-center gap-2">
          <input
            type="number"
            min="1"
            placeholder="Enter Application ID"
            value={appInputValue}
            onChange={(e) => setAppInputValue(e.target.value)}
            className="border rounded px-2 py-1 w-40"
          />
          <button
            className="bg-primary-600 text-white px-3 py-1 rounded"
            onClick={() => {
              if (!appInputValue) return;
              // Redirect to application form page with applicationId
              navigate(`/apply?view=form&applicationId=${encodeURIComponent(appInputValue)}`);
            }}
          >
            Open Form
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-xs lg:max-w-md ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                } items-end space-x-2`}
              >
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                    msg.role === "user" ? "bg-primary-600" : "bg-gradient-to-br from-primary-100 to-secondary-100 border border-gray-200 dark:from-gray-700 dark:to-gray-800"
                  }`}
                >
                  {msg.role === "user" ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary-600" />}
                </div>

                <div
                  className={`px-6 py-4 rounded-3xl shadow-xl ${
                    msg.role === "user"
                      ? "bg-primary-600 text-white rounded-br-md animate-bubble-user"
                      : "bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 animate-bubble-ai"
                  } relative max-w-[80vw] lg:max-w-md backdrop-blur-xl`}
                >
                  <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</p>

                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      {msg.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(s)}
                          className="block w-full text-left text-xs bg-white/60 dark:bg-gray-900/60 hover:bg-primary-50 dark:hover:bg-primary-900 px-2 py-1 rounded transition-colors mt-1"
                        >
                          {typeof s === "object" ? s.label : s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="text-xs mt-2 text-gray-400 dark:text-gray-400 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-start"
            >
              <div className="flex items-end space-x-2">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl shadow-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 p-4 bg-white/80 dark:bg-gray-900/80 sticky bottom-0 z-20 flex items-center gap-3 backdrop-blur-xl rounded-b-2xl">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          className="input-field flex-1 pr-12 text-base"
          disabled={isLoading}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !isLoading && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(inputValue);
            }
          }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSendMessage(inputValue)}
          disabled={isLoading || !inputValue.trim()}
          className="btn-primary p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </motion.button>
      </div>

    </div>
  );
}

