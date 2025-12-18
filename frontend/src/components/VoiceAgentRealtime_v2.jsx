/**
 * Real-Time Streaming Voice Agent Component
 * ==========================================
 *
 * This component implements a fully real-time voice assistant that:
 * - Captures microphone audio and streams to backend via WebSocket
 * - Displays live transcription (partial and final)
 * - Shows AI responses with typing animation
 * - Plays AI-generated speech audio in real-time
 * - Tracks extracted structured data (name, income, credit score, loan amount)
 * - Displays loan eligibility results
 *
 * Tech Stack:
 * - AudioContext + GainNode -> MediaRecorder (WebM/Opus)
 * - **5x Digital Gain Boost**
 * - Standard WebM Container (Robust)
 * - WebSocket for bi-directional streaming
 * - Web Audio API for playing TTS audio chunks
 * - React hooks for state management
 *
 * @author AI Development Assistant
 * @date December 2025
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneOff, X } from "lucide-react";
import DocumentKYCGrid from "./DocumentKYCGrid";
import LoanResultCard from "./LoanResultCard";
import { toast } from "react-toastify";
import { auth } from "../utils/auth";

// Helper Component for Smooth Typing Effect
const Typewriter = ({ text }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    // If text was reset (empty), reset display immediately
    if (!text) {
      setDisplayedText("");
      return;
    }

    // If we're already fully displayed, check if text grew (streaming)
    // If text shrunk (shouldn't happen usually unless reset), reset.
    if (displayedText.length > text.length) {
      setDisplayedText(text); // snap to new text if it's completely different
      return;
    }

    // Interval to "type" catch up
    const intervalId = setInterval(() => {
      setDisplayedText((prev) => {
        if (prev.length < text.length) {
          return text.slice(0, prev.length + 1); // Reveal one more char
        }
        clearInterval(intervalId);
        return prev;
      });
    }, 15); // 15ms per char = ~66 chars/sec (Smooth & Fast)

    return () => clearInterval(intervalId);
  }, [text, displayedText]); // Re-run when target text changes

  return <p className="whitespace-pre-wrap text-sm">{displayedText}</p>;
};

const VoiceAgentRealtime = () => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isMuted, setIsMuted] = useState(false);

  // Conversation state
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState([]);
  const [currentAiToken, setCurrentAiToken] = useState("");

  // Structured data extracted by AI
  const [extractedData, setExtractedData] = useState({});
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [readyForVerification, setReadyForVerification] = useState(null); // New state for manual redirect

  // Volume state for visualizer
  const [volume, setVolume] = useState(0);

  // Refs for persistent connections
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isRecordingRef = useRef(false); // Ref for event handlers
  const currentSourceRef = useRef(null); // Track current audio source
  const currentAiTokenRef = useRef("");
  const messagesEndRef = useRef(null);
  const extractedDataRef = useRef({}); // Ref to access latest data in callbacks

  const navigate = useNavigate();

  // Sync ref with state
  useEffect(() => {
    extractedDataRef.current = extractedData;
  }, [extractedData]);


  /**
   * Play next audio chunk from queue
   */
  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
        await audioContextRef.current.resume();
      }

      const audioContext = audioContextRef.current;
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        setTimeout(() => playNextAudioChunk(), 0);
      };

      source.start(0);
      currentSourceRef.current = source;
    } catch (err) {
      console.error("Failed to play audio chunk:", err);
      setTimeout(() => playNextAudioChunk(), 0); // Continue with next chunk
    }
  }, []);

  /**
   * Queue and play audio chunks sequentially
   */
  const queueAudioChunk = useCallback(
    (base64Audio) => {
      audioQueueRef.current.push(base64Audio);
      if (!isPlayingRef.current) {
        playNextAudioChunk();
      }
    },
    [playNextAudioChunk]
  );

  /**
   * Stop current audio playback and clear queue
   */
  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }
  }, []);

  /**
   * Auto-scroll to bottom of conversation
   */
  useEffect(() => {
    if (finalTranscripts.length > 0 || currentAiToken) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [finalTranscripts, currentAiToken]);

  /**
   * Handle incoming WebSocket messages
   */
  const handleWebSocketMessage = useCallback(
    (message) => {
      const { type, data } = message;

      switch (type) {
        case "partial_transcript":
          stopAudioPlayback();
          if (currentAiTokenRef.current) {
            const cleanText = currentAiTokenRef.current.split("|||")[0];
            if (cleanText.trim()) {
              setFinalTranscripts((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text: cleanText,
                },
              ]);
            }
            currentAiTokenRef.current = "";
            setCurrentAiToken("");
          }
          setPartialTranscript(data);
          break;

        case "final_transcript":
          stopAudioPlayback();
          if (currentAiTokenRef.current) {
            const cleanText = currentAiTokenRef.current.split("|||")[0];
            if (cleanText.trim()) {
              setFinalTranscripts((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text: cleanText,
                },
              ]);
            }
            currentAiTokenRef.current = "";
            setCurrentAiToken("");
          }
          setFinalTranscripts((prev) => [
            ...prev,
            { role: "user", text: data },
          ]);
          setPartialTranscript("");
          break;

        case "assistant_transcript":
          setFinalTranscripts((prev) => [
            ...prev,
            { role: "assistant", text: data },
          ]);
          break;

        case "ai_token":
          currentAiTokenRef.current += data;
          setCurrentAiToken(currentAiTokenRef.current.split("|||")[0]);
          break;

        case "audio_chunk":
          queueAudioChunk(data);
          break;

        case "structured_update":
          setExtractedData((prev) => ({ ...prev, ...data }));
          break;

        case "interrupt":
          // NEW: Stop playback immediately
          stopAudioPlayback();
          currentAiTokenRef.current = "";
          setCurrentAiToken("");
          break;

        case "eligibility_result":
          setEligibilityResult(data);
          // Ensure applicationId is always set
          const appId = data.application_id || readyForVerification?.appId || null;
          navigate("/eligibility-result", {
            state: {
              result: data,
              applicationId: appId,
              extractedData: extractedDataRef.current
            }
          });
          break;

        case "document_verification_required":
          // NEW: Stop mic immediately
          stopRecording();

          // NEW: Flush pending text to transcript
          if (currentAiTokenRef.current) {
            const cleanText = currentAiTokenRef.current.split("|||")[0];
            if (cleanText.trim()) {
              setFinalTranscripts((prev) => [
                ...prev,
                { role: "assistant", text: cleanText },
              ]);
            }
          }
          currentAiTokenRef.current = "";
          setCurrentAiToken("");

          // Manual Redirect Logic
          if (data.application_id) {
            setReadyForVerification({
              appId: data.application_id,
              message: "Please click Proceed to verify documents."
            });
            toast.success("Details captured! Click 'Proceed to Verification' to continue.");
            // No auto-redirect
          } else {
            setShowDocumentUpload(true);
            setExtractedData(data.structured_data);
          }

          if (data.message) {
            setFinalTranscripts((prev) => [
              ...prev,
              { role: "assistant", text: data.message },
            ]);
          }
          break;

        case "error":
          toast.error(data);
          break;

        default:
          console.warn("Unknown message type:", type);
      }
    },
    [queueAudioChunk, stopAudioPlayback, navigate, readyForVerification?.appId]
  );

  /**
   * Initialize WebSocket connection to backend
   */
  const connectWebSocket = useCallback(
    (onOpenCallback = null) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const baseUrl = `${protocol}//${window.location.hostname}:8000`;

      // Attach JWT token as query param so backend can resolve user/email
      const token = auth.getToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const wsUrl = `${baseUrl}/api/voice/stream${query}`;

      try {
        if (wsRef.current) {
          wsRef.current.close();
        }

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          if (onOpenCallback) onOpenCallback();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          console.error("Connection error. Please check backend is running.");
        };

        ws.onclose = () => {
          console.log("WebSocket closed");
          // Only update state if this is still the active socket
          if (wsRef.current === ws) {
            setIsConnected(false);
          }
        };

        wsRef.current = ws;
      } catch (err) {
        console.error("Failed to create WebSocket:", err);
        toast.error("Failed to connect to voice agent");
      }
    },
    [handleWebSocketMessage]
  );

  /**
   * START RECORDING (WebM + Gain Boost)
   * Pipeline: Mic -> AudioContext -> GainNode(5x) -> Dest -> MediaRecorder -> WebSocket
   */
  const startRecording = async () => {
    try {
      // 1. Capture Mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // 2. Setup Audio Context & Gain
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 10.0; // 10x Digital Gain Boost to catch soft voices

      const destination = audioContext.createMediaStreamDestination();

      // Connect Graph
      source.connect(gainNode);
      gainNode.connect(destination);

      // 3. Setup Media Recorder on Destination Stream
      const outputStream = destination.stream;
      const recorder = new MediaRecorder(outputStream, {
        mimeType: "audio/webm", // Browser Default (usually Opus)
      });
      mediaRecorderRef.current = recorder;

      // 4. Data Handling (Direct Binary Send)
      // We purposefully simplify this to reduce latency and complex processing loop
      recorder.ondataavailable = (event) => {
        // Trace log: confirm event firing and size
        if (event.data.size > 0) {
          console.log(`🎤 Audio Chunk: ${event.data.size} bytes`);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(event.data);
            // console.log("Sent chunk to WS");
          } else {
            console.warn("⚠️ WS not ready, dropping chunk");
          }
        }
      };

      // 5. Start Recording
      recorder.start(250); // 250ms chunks
      console.log("✅ MediaRecorder start(250) called");

      setIsRecording(true);
      isRecordingRef.current = true;

      // 6. Visualizer (Analyzer attached to Gain Output)
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      gainNode.connect(analyzer); // Monitor the BOOSTED signal

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const updateVolume = () => {
        if (!isRecordingRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];

        // Log Volume Occasionally
        if (
          Math.random() < 0.05 &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          const rms = sum / bufferLength; // 0-255
          wsRef.current.send(
            JSON.stringify({
              type: "debug_log",
              message: `Mic Gain RMS: ${rms}`,
            })
          );
        }

        setVolume(sum / bufferLength);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // FIX: Send "Flush" signal to backend to force immediate processing of buffer
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interaction_end" }));
    }

    // FIX: Do NOT close AudioContext here, as it is used for Playback too.
    // It will be closed on component unmount (useEffect cleanup).
    /* 
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    */

    setIsRecording(false);
    isRecordingRef.current = false;
    setVolume(0);
  };

  /**
   * Connect on mount, disconnect on unmount
   */
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopRecording();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle start/stop call button
   */
  const handleCallToggle = () => {
    if (isRecording) {
      stopRecording();

    } else {
      // Reuse existing connection if valid
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        startRecording();
      } else {
        // Force close existing if it's not OPEN (e.g. CLOSING or CLOSED)
        if (wsRef.current) wsRef.current.close();
        // Start fresh connection -> Then record
        setIsConnected(false); // UI feedback
        connectWebSocket(() => {
          startRecording();
        });
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden relative">
      {/* Header - Minimal */}
      <div className="bg-white/80 backdrop-blur-sm shadow-sm p-4 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🎙️ LoanVoice</h1>
          <p className="text-xs text-gray-500">AI Loan Assistant</p>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-xs font-medium ${isConnected
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
            }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* Main Content Area - Conversation History */}
      <div className="flex-1 overflow-y-auto p-4 pb-48 space-y-4 scroll-smooth">
        {/* Welcome Message */}
        {finalTranscripts.length === 0 &&
          !partialTranscript &&
          !currentAiToken && (
            <div className="text-center text-gray-500 mt-10">
              <p className="mb-2">👋 Hi! I'm your AI Loan Assistant.</p>
            </div>
          )}

        {/* Chat Messages */}
        {finalTranscripts.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"
              }`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl shadow-sm ${msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-none"
                : "bg-white text-gray-800 rounded-bl-none border border-gray-100"
                }`}
            >
              <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Typing Animation */}
        {currentAiToken && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-none bg-white text-gray-800 border border-gray-100 shadow-sm">
              <Typewriter text={currentAiToken} />
            </div>
          </div>
        )}

        {/* Partial Transcript */}
        {partialTranscript && (
          <div className="flex justify-end">
            <div className="max-w-[80%] px-4 py-2 rounded-2xl rounded-br-none bg-blue-400/20 text-blue-900 italic border border-blue-200">
              <p className="text-sm">{partialTranscript}...</p>
            </div>
          </div>
        )}
        {/* Result Card (Inline) */}
        {eligibilityResult && (
          <div className="mt-4 mb-4 w-full">
            <LoanResultCard
              result={{
                eligibility_status:
                  eligibilityResult.eligibility_status || "ineligible",
                eligibility_score: eligibilityResult.eligibility_score || 0,
                risk_level: eligibilityResult.risk_level || "medium_risk",
                credit_tier: eligibilityResult.credit_tier || "Good",
                confidence: eligibilityResult.confidence || 0.9,
                debt_to_income_ratio:
                  eligibilityResult.debt_to_income_ratio || 0,
              }}
              applicationId={eligibilityResult.application_id}
              extractedData={extractedData}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-6 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {/* Manual Verification Button */}
          {readyForVerification && (
            <button
              onClick={() => navigate(`/verify?applicationId=${readyForVerification.appId}`)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold shadow-lg animate-pulse"
            >
              Proceed to Verification →
            </button>
          )}
          {/* Text Input Bar */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder={isRecording ? "Listening..." : "Type a message..."}
              className={`w-full pl-4 pr-10 py-3 rounded-full border-none focus:ring-2 transition-all shadow-sm text-base text-gray-900 ${isRecording
                ? "bg-red-50 ring-2 ring-red-100 placeholder-red-400"
                : "bg-gray-100 focus:bg-white focus:ring-blue-500"
                }`}
              value={isRecording ? partialTranscript : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  const text = e.target.value.trim();
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({ type: "text_input", data: text })
                    );
                    e.target.value = "";
                  } else {
                    toast.error("Not connected");
                  }
                }
              }}
            />
            {/* Send Icon (only visible when typing) */}
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600">
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
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

          {/* Mic Button with Volume Visualizer */}
          <button
            onClick={handleCallToggle}
            style={{
              boxShadow: isRecording
                ? `0 0 ${10 + volume}px ${Math.max(
                  2,
                  volume / 4
                )}px rgba(239, 68, 68, 0.6)`
                : undefined,
              transform: isRecording ? `scale(${1 + volume / 200})` : undefined,
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-75 shadow-md flex-shrink-0 relative z-10 ${isRecording
              ? "bg-red-500 text-white"
              : isConnected
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30"
                : "bg-gray-400 text-white hover:bg-gray-500 cursor-pointer"
              }`}
          >
            {isRecording ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
        </div>
      </div>

      {/* Document Upload Modal */}
      {showDocumentUpload && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-slate-950 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-800 overflow-hidden">

            {/* Close Button (Absolute Top Right) */}
            <button
              onClick={() => setShowDocumentUpload(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white z-10 p-2 bg-slate-900/50 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X size={24} />
            </button>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <DocumentKYCGrid
                uploadedFiles={uploadedFiles}
                onUploadSuccess={(data, file) => {
                  toast.success(`${file.name} Verified!`);
                  setUploadedFiles((prev) => [
                    ...prev,
                    {
                      name: file.name,
                      size: file.size,
                      type: file.type,
                      data: data,
                      docType: file.docType // store the docType
                    },
                  ]);

                  // Send to backend
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({ type: "document_uploaded", data: data, docType: file.docType })
                    );
                  }
                }}
                onRemove={(fileToRemove) => {
                  setUploadedFiles((prev) =>
                    prev.filter((f) => f.name !== fileToRemove.name)
                  );
                }}
              />
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
              <p className="text-slate-400 text-sm">
                Ensure all documents are clear and legible before finishing.
              </p>
              <button
                onClick={() => {
                  if (uploadedFiles.length < 5) {
                    toast.warning("Please upload all 5 documents (Aadhaar, PAN, KYC, Bank Statement, Salary Slip) to proceed.");
                    return;
                  }
                  setShowDocumentUpload(false);
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({ type: "verification_completed" })
                    );
                  }
                }}
                className={`w-full md:w-auto px-8 py-3 rounded-xl font-semibold shadow-lg transition-all transform active:scale-95 ${uploadedFiles.length < 5
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                  }`}
              >
                Done / Finish Verification
              </button>
            </div>
          </div >
        </div >
      )}
    </div >
  );
};

export default VoiceAgentRealtime;
