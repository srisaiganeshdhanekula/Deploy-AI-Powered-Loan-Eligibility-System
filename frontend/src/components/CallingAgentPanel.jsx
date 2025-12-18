import React from "react";
import VoiceAgentRealtime from "./VoiceAgentRealtime_v2";

/**
 * CallingAgentPanel - Real-time Streaming Voice Agent
 *
 * This component embeds the complete VoiceAgentRealtime_v2 component
 * which provides real-time streaming voice interaction with:
 * - Vosk STT (speech-to-text streaming)
 * - Ollama LLM (streaming AI responses)
 * - Piper TTS (text-to-speech streaming)
 * - Real-time data extraction and eligibility prediction
 */
export default function CallingAgentPanel() {
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Full-height voice agent with all features built-in */}
      <div className="h-full">
        <VoiceAgentRealtime />
      </div>
    </div>
  );
}
