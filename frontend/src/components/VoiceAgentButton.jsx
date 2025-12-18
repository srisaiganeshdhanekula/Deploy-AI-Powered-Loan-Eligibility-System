import React, { useEffect, useRef, useState } from "react";
import { voiceAPI } from "../utils/api";
import { Mic, Square, Volume2 } from "lucide-react";

/**
 * VoiceAgentButton
 *
 * Minimal voice capture button using browser mic and backend /api/voice/voice_agent.
 *
 * Props:
 * - applicationId?: number | null - if provided, backend updates this loan application
 * - onBackendTurn?: (userText: string, assistantText: string) => void - optional hook for UI sync
 */
export default function VoiceAgentButton({
  applicationId = null,
  onBackendTurn,
  onApplicationLinked,
  onReadyForPrediction,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [voiceReady, setVoiceReady] = useState(true);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);

  const startRecording = async () => {
    try {
      // Preflight voice stack
      try {
        const vs = await voiceAPI.checkStatus();
        const svc = vs?.data?.services || {};
        const ready = !!(svc.whisper && svc.ffmpeg);
        setVoiceReady(ready);
        if (!ready) {
          const missing = [
            !svc.whisper ? "Whisper" : null,
            !svc.ffmpeg ? "FFmpeg" : null,
          ]
            .filter(Boolean)
            .join(", ");
          setStatus("Missing dependencies");
          alert(
            `Voice setup is missing: ${missing}.\n\nInstall on macOS:\n- brew install ffmpeg\n- pip install openai-whisper gTTS\n\nThen restart the backend and try again.`
          );
          return;
        }
      } catch (preErr) {
        // Non-blocking; proceed but note status
        console.warn("Voice status check failed", preErr);
      }
      setStatus("Requesting mic…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick best supported container/codec combination
      const candidates = [
        { type: "audio/webm;codecs=opus", ext: "webm" },
        { type: "audio/ogg;codecs=opus", ext: "ogg" },
        { type: "audio/webm", ext: "webm" },
        { type: "audio/mp4", ext: "m4a" },
      ];
      let chosen = candidates.find((c) =>
        MediaRecorder.isTypeSupported(c.type)
      );
      if (!chosen) chosen = { type: "audio/webm", ext: "webm" };
      const mimeType = chosen.type;
      const fileExt = chosen.ext;
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        setStatus("Processing…");
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (!blob || blob.size < 1024) {
          setStatus("No audio captured");
          alert("No audio captured. Please try again and speak near the mic.");
        } else {
          await sendToBackend(blob, fileExt);
        }
        // Stop tracks
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      // Provide timeslice so data gets flushed on some browsers
      mr.start(1000);
      setIsRecording(true);
      setStatus("Listening…");
    } catch (err) {
      console.error("Mic error", err);
      setStatus("Mic error");
      alert(
        "Microphone access is required for voice capture. Please allow mic access and try again."
      );
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
      setIsRecording(false);
    }
  };

  const sendToBackend = async (blob, ext = "webm") => {
    try {
      const safeExt = typeof ext === "string" && ext ? ext : "webm";
      const file = new File([blob], `voice_input.${safeExt}`, {
        type: blob.type,
      });
      const res = await voiceAPI.voiceAgent(file, applicationId);
      const data = res?.data;
      const transcript = data?.transcript || "";
      const reply = data?.ai_reply || "";
      const audioUrl = data?.audio_url;
      const newAppId = data?.application_id;
      const ready =
        !!data?.ready_for_prediction ||
        typeof data?.eligibility_score === "number";
      // If backend created/updated an application, you can capture it here if needed
      // const newAppId = data?.application_id;

      // Play AI reply audio if provided
      if (audioUrl) {
        try {
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = audioUrl.startsWith("http")
            ? audioUrl
            : `${
                process.env.REACT_APP_API_URL?.replace(/\/api$/, "") ||
                "http://localhost:8000"
              }${audioUrl}`;
          await audioRef.current.play();
        } catch (playErr) {
          console.warn("Autoplay blocked or audio error", playErr);
        }
      }

      if (typeof onApplicationLinked === "function" && newAppId) {
        onApplicationLinked(newAppId);
      }
      if (typeof onReadyForPrediction === "function") {
        onReadyForPrediction(
          ready,
          newAppId || applicationId || null,
          data?.missing_fields || []
        );
      }
      if (onBackendTurn) onBackendTurn(transcript, reply);
      setStatus("Idle");
    } catch (e) {
      console.error("voiceAgent call failed", e);
      setStatus("Backend error");
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 503 && detail?.missing) {
        const missing = Array.isArray(detail.missing)
          ? detail.missing.join(", ")
          : String(detail.missing);
        alert(
          `Voice setup is missing: ${missing}.\n\nInstall on macOS:\n- brew install ffmpeg\n- pip install openai-whisper gTTS\n\nThen restart the backend and try again.`
        );
      } else if (
        status === 400 &&
        typeof detail === "string" &&
        detail.includes("Audio too short")
      ) {
        alert("No/low audio detected. Please speak clearly and try again.");
      } else {
        alert("Voice agent failed to process audio. Please try again.");
      }
    }
  };

  useEffect(() => {
    // Initial status check for helpful UI
    (async () => {
      try {
        const vs = await voiceAPI.checkStatus();
        const svc = vs?.data?.services || {};
        setVoiceReady(!!(svc.whisper && svc.ffmpeg));
        if (!(svc.whisper && svc.ffmpeg)) {
          setStatus("Missing dependencies");
        }
      } catch (err) {
        console.warn("Voice status pre-check failed", err);
      }
    })();
    return () => {
      try {
        mediaRecorderRef.current?.stream
          ?.getTracks?.()
          .forEach((t) => t.stop());
      } catch {}
    };
  }, []);

  const btnClass = isRecording
    ? "bg-red-500 hover:bg-red-600 text-white"
    : "bg-secondary-500 hover:bg-secondary-600 text-white";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        className={`px-3 py-2 rounded-xl font-medium shadow-sm ${btnClass}`}
        disabled={!voiceReady && !isRecording}
      >
        <span className="flex items-center gap-2">
          {isRecording ? (
            <Square className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          {isRecording ? "Stop" : "Speak"}
        </span>
      </button>

      <span className="text-xs text-gray-500 flex items-center gap-1">
        <Volume2 className="w-3 h-3" /> {status}
      </span>
    </div>
  );
}
