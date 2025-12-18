// API utility for frontend communication
import axios from "axios";
import { auth } from "./auth";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = auth.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (email, password, fullName, role = "applicant") =>
    api.post("/auth/register", { email, password, full_name: fullName, role }),

  login: (email, password) => api.post("/auth/login", { email, password }),

  getCurrentUser: () => api.get("/auth/me"),
};

export const chatAPI = {
  sendMessage: (message, applicationId = null) =>
    api.post("/chat/message", { message, application_id: applicationId }),

  checkHealth: () => api.get("/chat/health"),
};

export const voiceAPI = {
  transcribeAudio: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/voice/transcribe", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  synthesizeSpeech: (text) => api.post("/voice/synthesize", { text }),

  checkStatus: () => api.get("/voice/status"),

  voiceAgent: (file, applicationId = null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (applicationId !== null && applicationId !== undefined) {
      formData.append("application_id", String(applicationId));
    }
    return api.post("/voice/voice_agent", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const ocrAPI = {
  uploadDocument: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/verify/document`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  verifyDocument: (applicationId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/verify/document/${applicationId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },


  checkStatus: () => api.get("/verify/status"),
};


export const loanAPI = {
  predictEligibility: (applicantData) =>
    api.post("/loan/predict", applicantData),

  createApplication: (applicationData) =>
    api.post("/loan/applications", applicationData),

  updateApplication: (applicationId, updateData) =>
    api.put(`/loan/applications/${applicationId}`, updateData),

  getLastApplication: () => api.get("/loan/applications/last"),

  getApplication: (applicationId) =>
    api.get(`/loan/applications/${applicationId}`),

  verifyDocument: (applicationId, extractedData) =>
    api.put(`/loan/applications/${applicationId}/verify-document`, {
      extracted_data: extractedData,
    }),

  predictForApplication: (applicationId) =>
    api.post(`/loan/predict-for-application/${applicationId}`),

  getModelInfo: () => api.get("/loan/model-info"),

  shareDashboard: (userId) => api.post(`/loan/share-dashboard/${userId}`),
};

export const reportAPI = {
  generateReport: (applicationId) =>
    api.post(`/report/generate/${applicationId}`),

  downloadReport: (applicationId) =>
    api.get(`/report/download/${applicationId}`, { responseType: "blob" }),

  generateAnalysis: (applicationId) =>
    api.post(`/report/analysis/${applicationId}`),
};

export const otpAPI = {
  sendOTP: (email, userId = null) =>
    api.post("/otp/send", { email, user_id: userId }),

  verifyOTP: (email, otpCode, userId = null) =>
    api.post("/otp/verify", { email, otp_code: otpCode, user_id: userId }),

  checkStatus: () => api.get("/otp/status"),
};

export const managerAPI = {
  getModelMetrics: () => api.get("/manager/model-metrics"),
  shareDashboard: (userId) => api.post(`/loan/share-dashboard/${userId}`),
  getApplications: (status = null, page = 1, limit = 10) => {
    const skip = Math.max(0, (page - 1) * limit);
    const params = { limit, skip };
    if (status) params.status_filter = status;
    return api.get("/manager/applications", { params });
  },

  getApplicationDetails: (applicationId) =>
    api.get(`/manager/applications/${applicationId}`),

  approveApplication: (applicationId, notes = "") =>
    api.post(`/manager/applications/${applicationId}/decision`, {
      application_id: applicationId,
      decision: "approved",
      notes,
    }),

  rejectApplication: (applicationId, notes = "") =>
    api.post(`/manager/applications/${applicationId}/decision`, {
      application_id: applicationId,
      decision: "rejected",
      notes,
    }),

  getStatistics: () => api.get("/manager/stats"),
};

export default api;


