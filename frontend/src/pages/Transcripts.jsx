// src/pages/Transcripts.jsx
import React, { useState, useEffect } from "react";
import AdminLayout from "../components/AdminLayout";

function Transcripts() {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTranscripts() {
      try {
        // Use backend port for API call
        const res = await fetch("http://localhost:8000/api/transcripts");
        const data = await res.json();
        setTranscripts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching transcripts:", err);
        setTranscripts([]); // fallback to empty array on error
      } finally {
        setLoading(false);
      }
    }
    fetchTranscripts();
  }, []);

  if (loading)
    return (
      <AdminLayout>
        <p className="text-slate-300">Loading transcripts...</p>
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-6">
        Voice Conversation Transcripts
      </h1>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-3 px-2">Call ID</th>
              <th className="py-3 px-2">User Message</th>
              <th className="py-3 px-2">AI Response</th>
              <th className="py-3 px-2">Extracted Fields</th>
              <th className="py-3 px-2">Timestamp</th>
            </tr>
          </thead>

          <tbody>
            {(Array.isArray(transcripts) ? transcripts : []).map((t, index) => (
              <tr
                key={index}
                className="border-b border-slate-700 hover:bg-slate-700/40"
              >
                <td className="py-3 px-2">{t.id}</td>
                <td className="py-3 px-2 text-slate-200">{t.user}</td>
                <td className="py-3 px-2 text-blue-300">{t.ai}</td>
                <td className="py-3 px-2 text-yellow-300">{t.extracted}</td>
                <td className="py-3 px-2">{t.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export default Transcripts;
