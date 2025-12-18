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
 * - MediaRecorder API for audio capture
 * - WebSocket for bi-directional streaming
 * - Web Audio API for playing TTS audio chunks
 * - React hooks for state management
 *
 * @author AI Development Assistant
 * @date November 2025
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";
import FileUpload from "./FileUpload";
import { toast } from "react-toastify";

const VoiceAgentRealtime = () => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);

  // Conversation state
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState([]);
  const [currentAiToken, setCurrentAiToken] = useState("");

  // Structured data extracted by AI
  const [extractedData, setExtractedData] = useState({});
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [applicationId, setApplicationId] = useState(null);

  // Refs for persistent connections
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAiTokenRef = useRef("");

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
        // Use setTimeout to avoid recursion issues
        setTimeout(() => playNextAudioChunk(), 0);
      };

      source.start(0);
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
   * Handle incoming WebSocket messages
   */
  const handleWebSocketMessage = useCallback(
    (message) => {
      const { type, data } = message;

      switch (type) {
        case "status":
          // Backend is ready for audio
          console.log("Backend status:", data);
          break;

        case "partial_transcript":
          setPartialTranscript(data);
          break;

        case "final_transcript":
          setFinalTranscripts((prev) => [
            ...prev,
            { role: "user", text: data },
          ]);
          setPartialTranscript("");
          break;

        case "ai_token":
          currentAiTokenRef.current += data;
          setCurrentAiToken((prev) => prev + data);
          break;

        case "audio_chunk":
          queueAudioChunk(data);
          if (currentAiTokenRef.current) {
            setFinalTranscripts((prev) => [
              ...prev,
              { role: "assistant", text: currentAiTokenRef.current },
            ]);
            currentAiTokenRef.current = "";
            setCurrentAiToken("");
          }
          break;

        case "structured_update":
          setExtractedData((prev) => ({ ...prev, ...data }));
          break;

        case "eligibility_result":
          setEligibilityResult(data);
          break;

        case "document_verification_required":
          // Show document upload button
          setShowDocumentUpload(true);
          setExtractedData(data.structured_data);
          // Add AI message about document verification
          if (data.message) {
            setFinalTranscripts((prev) => [
              ...prev,
              { role: "assistant", text: data.message },
            ]);
          }
          break;

        case "error":
          setError(data);
          break;

        default:
          console.warn("Unknown message type:", type);
      }
    },
    [queueAudioChunk]
  );

  /**
   * Initialize WebSocket connection to backend
   */
  const connectWebSocket = useCallback(() => {
    // Use relative URL to respect proxy configuration
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host; // Includes hostname and port if non-standard
    const wsUrl = `${protocol}//${host}/api/voice/stream`;

    console.log(`Attempting to connect to WebSocket: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        setIsConnected(true);
        setError(null);
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
        setError("Connection error. Please check backend is running.");
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        setIsConnected(false);
        // Only auto-reconnect if we didn't explicitly close it
        if (wsRef.current === ws && !wsRef.current.manualClose) {
          console.log("Auto-reconnecting in 5 seconds...");
          setTimeout(() => {
            if (wsRef.current === ws) {
              connectWebSocket();
            }
          }, 5000); // Auto-reconnect after 5 seconds
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      setError("Failed to connect to voice agent");
    }
  }, [handleWebSocketMessage]);

  /**
   * Start recording microphone audio using AudioContext for PCM16LE
   */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create AudioContext for raw PCM audio processing
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);

      // Create ScriptProcessor with smaller buffer for more frequent updates
      // 2048 samples at 16kHz = ~128ms callbacks (better than 256ms for 4096)
      const processor = audioContext.createScriptProcessor(2048, 1, 1);

      processor.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Get float32 audio data
          const inputData = e.inputBuffer.getChannelData(0);

          // Convert float32 (-1 to 1) to int16 PCM
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Clamp and convert to 16-bit integer
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          // Send raw PCM16LE audio to backend
          try {
            wsRef.current.send(int16Data.buffer);
          } catch (err) {
            console.error("Failed to send audio to backend:", err);
          }
        } else {
          if (!wsRef.current) {
            console.warn("WebSocket not initialized");
          } else if (wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn(
              `WebSocket not open (state: ${wsRef.current.readyState})`
            );
          }
        }
      };

      // Connect audio pipeline
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store references for cleanup
      mediaRecorderRef.current = { stream, audioContext, processor, source };
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError("Microphone access denied. Please allow microphone access.");
    }
  };

  /**
   * Stop recording microphone audio
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      const { stream, audioContext, processor, source } =
        mediaRecorderRef.current;

      // Disconnect audio pipeline
      if (source && processor) {
        try {
          source.disconnect();
          processor.disconnect();
        } catch (e) {
          // Already disconnected
        }
      }

      // Close audio context
      if (audioContext) {
        audioContext.close();
      }

      // Stop all tracks
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  };

  /**
   * Toggle mute/unmute
   */
  const toggleMute = () => {
    if (audioContextRef.current) {
      if (isMuted) {
        audioContextRef.current.resume();
      } else {
        audioContextRef.current.suspend();
      }
      setIsMuted(!isMuted);
    }
  };

  /**
   * Connect on mount, disconnect on unmount
   */
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.manualClose = true; // Mark as manual close to prevent reconnect
        wsRef.current.close();
      }
      stopRecording();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  /**
   * Handle start/stop call button
   */
  const handleCallToggle = () => {
    if (isRecording) {
      stopRecording();
    } else if (isConnected) {
      startRecording();
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto p-6 pb-24">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🎙️ LoanVoice Agent
          </h1>
          <p className="text-gray-600">
            Real-time AI voice assistant for loan eligibility
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div
            className={`px-4 py-2 rounded-full ${
              isConnected
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            <span className="font-medium">
              {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
            </span>
          </div>

          {isRecording && (
            <div className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full animate-pulse">
              <span className="font-medium">🎤 Listening...</span>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">⚠️ {error}</p>
          </div>
        )}

        {/* Extracted Data Display */}
        {Object.keys(extractedData).length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-bold text-gray-700 mb-3">
              📋 Collected Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {extractedData.name && (
                <div className="bg-blue-50 p-3 rounded">
                  <span className="text-sm text-gray-600">Name</span>
                  <p className="font-semibold">{extractedData.name}</p>
                </div>
              )}
              {extractedData.monthly_income && (
                <div className="bg-green-50 p-3 rounded">
                  <span className="text-sm text-gray-600">Monthly Income</span>
                  <p className="font-semibold">
                    ${extractedData.monthly_income.toLocaleString()}
                  </p>
                </div>
              )}
              {extractedData.credit_score && (
                <div className="bg-purple-50 p-3 rounded">
                  <span className="text-sm text-gray-600">Credit Score</span>
                  <p className="font-semibold">{extractedData.credit_score}</p>
                </div>
              )}
              {extractedData.loan_amount && (
                <div className="bg-yellow-50 p-3 rounded">
                  <span className="text-sm text-gray-600">Loan Amount</span>
                  <p className="font-semibold">
                    ${extractedData.loan_amount.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Document Upload Section */}
        {showDocumentUpload && !eligibilityResult && (
          <div className="bg-white border-2 border-blue-400 rounded-lg shadow-lg p-6 mb-4">
            <div className="text-center mb-4">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                📄 Document Verification Required
              </h3>
              <p className="text-gray-700 mb-4">
                Thank you! I have collected all your details. Now please upload
                your identity document for verification before we process your
                loan eligibility.
              </p>

              {/* Display collected information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  📋 Your Application Details:
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs text-blue-700">
                  <div>
                    <span className="font-semibold">Name:</span>{" "}
                    {extractedData.name}
                  </div>
                  <div>
                    <span className="font-semibold">Monthly Income:</span> $
                    {extractedData.monthly_income?.toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold">Credit Score:</span>{" "}
                    {extractedData.credit_score}
                  </div>
                  <div>
                    <span className="font-semibold">Loan Amount:</span> $
                    {extractedData.loan_amount?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Embedded File Upload Component */}
            <FileUpload
              onUploadSuccess={(data) => {
                toast.success("Document uploaded successfully!");

                // Generate application ID
                const tempAppId = applicationId || Date.now();
                setApplicationId(tempAppId);

                // Send document verified message to backend
                if (
                  wsRef.current &&
                  wsRef.current.readyState === WebSocket.OPEN
                ) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: "document_verified",
                      application_id: tempAppId,
                      extracted_data: data.extracted_data,
                    })
                  );
                }
              }}
              applicationId={applicationId || Date.now().toString()}
              autoCheck={false}
            />
          </div>
        )}

        {/* Eligibility Result */}
        {eligibilityResult && (
          <div
            className={`rounded-lg shadow-lg p-6 mb-4 ${
              eligibilityResult.approved
                ? "bg-green-100 border-2 border-green-500"
                : "bg-red-100 border-2 border-red-500"
            }`}
          >
            <h3 className="text-2xl font-bold mb-2">
              {eligibilityResult.approved
                ? "✅ Loan Approved!"
                : "❌ Loan Denied"}
            </h3>
            <p className="text-lg mb-2">
              Approval Probability:{" "}
              <span className="font-bold">
                {(eligibilityResult.probability * 100).toFixed(1)}%
              </span>
            </p>
            <p className="text-sm text-gray-700">
              Confidence: {(eligibilityResult.confidence * 100).toFixed(1)}%
            </p>
          </div>
        )}

        {/* Conversation Display */}
        <div
          className="bg-white rounded-lg shadow-md p-4 mb-4 overflow-y-auto"
          style={{ minHeight: "300px", maxHeight: "500px" }}
        >
          <div className="space-y-3">
            {finalTranscripts.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-md px-4 py-2 rounded-lg break-words ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}

            {/* Current AI Response (typing effect) */}
            {currentAiToken && (
              <div className="flex justify-start">
                <div className="max-w-md px-4 py-2 rounded-lg bg-gray-200 text-gray-800 break-words">
                  <p className="animate-pulse whitespace-pre-wrap">
                    {currentAiToken}
                  </p>
                </div>
              </div>
            )}

            {/* Partial Transcript (user still speaking) */}
            {partialTranscript && (
              <div className="flex justify-end">
                <div className="max-w-md px-4 py-2 rounded-lg bg-blue-300 text-blue-900 opacity-70 break-words">
                  <p className="italic whitespace-pre-wrap">
                    {partialTranscript}...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-4 my-6">
          {/* Call Button */}
          <button
            onClick={handleCallToggle}
            disabled={!isConnected}
            className={`p-6 rounded-full shadow-lg transition-all transform hover:scale-110 ${
              isRecording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            } ${!isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isRecording ? (
              <PhoneOff className="w-8 h-8 text-white" />
            ) : (
              <Phone className="w-8 h-8 text-white" />
            )}
          </button>

          {/* Mute Button */}
          <button
            onClick={toggleMute}
            disabled={!isRecording}
            className={`p-4 rounded-full shadow-md transition-all ${
              isMuted ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
            } ${!isRecording ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isMuted ? (
              <VolumeX className="w-6 h-6 text-white" />
            ) : (
              <Volume2 className="w-6 h-6 text-white" />
            )}
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Click the green phone button to start talking with the AI assistant
          </p>
          <p className="mt-1">
            The agent will help assess your loan eligibility
          </p>
        </div>
      </div>
    </div>
  );
}; // Closes the component function

export default VoiceAgentRealtime;
