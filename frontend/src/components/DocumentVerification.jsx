import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { ocrAPI, loanAPI } from "../utils/api";
import { toast } from "react-toastify";
import { Upload, CheckCircle, X, AlertCircle, Loader } from "lucide-react";

const DOCUMENT_TYPES = [
  { id: "aadhaar", label: "Aadhaar Card", description: "National ID proof" },
  { id: "pan", label: "PAN Card", description: "Tax ID" },
  { id: "kyc", label: "KYC Document", description: "Know Your Customer proof" },
  {
    id: "bank_statement",
    label: "Bank Statement",
    description: "Last 6 months statement",
  },
  {
    id: "salary_slip",
    label: "Salary Slip",
    description: "Recent salary slip",
  },
];

export default function DocumentVerification({ applicationId, onVerified }) {
  const [uploadedDocuments, setUploadedDocuments] = useState({});
  const [uploading, setUploading] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [extractedData, setExtractedData] = useState({});
  const [error, setError] = useState(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const navigate = useNavigate();

  const handleUpload = useCallback(
    async (file, docType) => {
      if (!applicationId) {
        toast.error("Application ID is required to upload documents.");
        return;
      }

      setUploading((prev) => ({ ...prev, [docType]: true }));
      setUploadProgress((prev) => ({ ...prev, [docType]: 0 }));
      setError(null);

      try {
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => {
            const current = prev[docType] || 0;
            if (current >= 90) {
              clearInterval(progressInterval);
              return prev;
            }
            return { ...prev, [docType]: current + 10 };
          });
        }, 200);

        const response = await ocrAPI.verifyDocument(applicationId, file);

        clearInterval(progressInterval);
        setUploadProgress((prev) => ({ ...prev, [docType]: 100 }));

        setUploadedDocuments((prev) => ({
          ...prev,
          [docType]: { file, response },
        }));

        setExtractedData((prev) => ({
          ...prev,
          [docType]: response.data.extracted_data,
        }));

        try {
          await loanAPI.verifyDocument(
            applicationId,
            response.data.extracted_data
          );
        } catch (verifyError) {
          console.error("Document verification failed:", verifyError);
        }

        const docLabel = DOCUMENT_TYPES.find((d) => d.id === docType)?.label;
        toast.success(`${docLabel} uploaded successfully!`);
      } catch (error) {
        const status = error?.response?.status;
        const detail = error?.response?.data?.detail;
        let message = "Failed to upload document. Please try again.";
        if (status === 404) {
          message = "Application not found.";
        } else if (
          status === 400 &&
          typeof detail === "string" &&
          detail.includes("Unsupported file type")
        ) {
          message = `${detail}. Please upload JPG, PNG, or PDF (max 10MB).`;
        } else if (status === 400 && typeof detail === "string") {
          message = detail;
        }
        setError(message);
        toast.error(message);
      } finally {
        setTimeout(() => {
          setUploading((prev) => ({ ...prev, [docType]: false }));
          setUploadProgress((prev) => ({ ...prev, [docType]: 0 }));
        }, 1000);
      }
    },
    [applicationId]
  );

  const handleDropZone = useCallback(
    (docType) => (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        setError("Please upload a valid file (JPG, PNG, or PDF, max 10MB)");
        return;
      }

      const file = acceptedFiles[0];
      if (file) {
        setError(null);
        handleUpload(file, docType);
      }
    },
    [handleUpload]
  );

  const removeDocument = (docType) => {
    setUploadedDocuments((prev) => {
      const updated = { ...prev };
      delete updated[docType];
      return updated;
    });
    setExtractedData((prev) => {
      const updated = { ...prev };
      delete updated[docType];
      return updated;
    });
  };

  // Requirements:
  // - At least one of: Aadhaar, PAN, KYC
  // - At least one of: Bank Statement, Salary Slip
  const GROUP_IDENTITY = ["aadhaar", "pan", "kyc"];
  const GROUP_FINANCIAL = ["bank_statement", "salary_slip"];

  const satisfiesGroup = (group) =>
    group.some((id) =>
      Object.prototype.hasOwnProperty.call(uploadedDocuments, id)
    );

  const requiredGroupsSatisfied =
    satisfiesGroup(GROUP_IDENTITY) && satisfiesGroup(GROUP_FINANCIAL);

  const handlePredictEligibility = async () => {
    if (!requiredGroupsSatisfied) {
     toast.error("Please upload all required documents first.");
     return;
    }


    setCheckingEligibility(true);
    try {
      const response = await loanAPI.predictForApplication(applicationId);
      toast.success("Eligibility check completed!");
      // Redirect to eligibility result page with result and applicationId
      navigate("/eligibility-result", {
        state: {
          result: response.data,
          applicationId,
          applicationData: null, // You can pass more if available
          extractedData,
        },
      });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to predict eligibility");
      toast.error(
        err.response?.data?.detail || "Failed to predict eligibility"
      );
    } finally {
      setCheckingEligibility(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col glass bg-white/70 dark:bg-gray-900/80 rounded-3xl shadow-2xl p-0 md:p-4">
      <div className="bg-gradient-to-r from-blue-100/80 to-indigo-100/80 dark:from-gray-800 dark:to-gray-900 text-gray-900 dark:text-white p-6 rounded-t-3xl border-b border-white/30">
        <h2 className="text-3xl font-bold mb-2">📄 Document Verification & KYC</h2>
        <p className="text-gray-700 dark:text-blue-100">
          Upload all 5 required documents. All uploads are mandatory to proceed with eligibility check.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-white/60 dark:bg-gray-900/60 rounded-b-3xl">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-red-50 border border-red-300 text-red-700 rounded-lg flex items-center space-x-3"
          >
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p className="text-base font-medium">{error}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {DOCUMENT_TYPES.map((docType) => (
            <DocumentUploadCard
              key={docType.id}
              docType={docType}
              isUploading={uploading[docType.id] || false}
              progress={uploadProgress[docType.id] || 0}
              uploadedFile={uploadedDocuments[docType.id]?.file}
              extractedData={extractedData[docType.id]}
              onUpload={(file) => handleUpload(file, docType.id)}
              onRemove={() => removeDocument(docType.id)}
              onDropZone={handleDropZone(docType.id)}
            />
          ))}
        </div>
      </div>

      {/* Upload Status Summary & Action Button */}
      <div className="border-t bg-white/80 dark:bg-gray-800/80 p-6 rounded-b-3xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                Upload Progress: {Object.keys(uploadedDocuments).length}/{DOCUMENT_TYPES.length} Documents
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                {requiredGroupsSatisfied
                  ? "✓ Required documents uploaded! Ready for eligibility check."
                  : `Please upload at least one ID (Aadhaar, PAN or KYC) and one financial proof (Bank statement or Salary slip).`}
              </p>
            </div>
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round((Object.keys(uploadedDocuments).length / DOCUMENT_TYPES.length) * 100)}%
            </div>
          </div>
          <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-3">
            <motion.div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(Object.keys(uploadedDocuments).length / DOCUMENT_TYPES.length) * 100}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        {/* Eligibility Check Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePredictEligibility}
          disabled={!requiredGroupsSatisfied || checkingEligibility}
          className={`w-full py-4 px-6 rounded-lg font-bold text-lg transition-all ${
            requiredGroupsSatisfied
              ? "bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg disabled:opacity-50"
              : "bg-gray-300 text-gray-600 cursor-not-allowed"
          }`}
        >
          {checkingEligibility ? (
            <span className="flex items-center justify-center space-x-3">
              <Loader className="w-6 h-6 animate-spin" />
              <span>Checking Eligibility...</span>
            </span>
          ) : (
            "Proceed to Eligibility Check"
          )}
        </motion.button>
        {/* Eligibility Result Display removed: now handled by redirect */}
      </div>
    </div>
  );
}

// Sub-component for individual document upload
const DocumentUploadCard = ({
  docType,
  isUploading,
  progress,
  uploadedFile,
  extractedData,
  onUpload,
  onRemove,
  onDropZone,
}) => {
  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: onDropZone,
      accept: {
        "image/*": [".jpeg", ".jpg", ".png"],
        "application/pdf": [".pdf"],
      },
      multiple: false,
      maxSize: 10 * 1024 * 1024,
      disabled: isUploading,
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-400 transition-colors glass bg-white/80 dark:bg-gray-800/80 shadow-lg"
    >
      {/* Card Header */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-gray-900/80 dark:to-gray-800/80 px-4 py-3 border-b border-gray-200">
        <h4 className="font-semibold text-gray-900 dark:text-white">{docType.label}</h4>
        <p className="text-xs text-gray-700 dark:text-gray-300">{docType.description}</p>
      </div>

      {/* Upload Area or Status */}
      <div className="p-4">
        {uploadedFile ? (
          <AnimatePresence mode="wait">
            {isUploading ? (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center space-y-2"
              >
                <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-sm text-gray-600">Processing...</p>
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <motion.div
                    className="bg-blue-600 h-1 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="uploaded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {uploadedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(uploadedFile.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onRemove}
                    className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0 ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {extractedData && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 pt-3 border-t border-gray-200 space-y-1"
                  >
                    <p className="text-xs font-semibold text-green-700 mb-2">
                      ✓ Data Extracted
                    </p>
                    {Object.entries(extractedData)
                      .slice(0, 2)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="text-xs flex justify-between bg-green-50 px-2 py-1 rounded"
                        >
                          <span className="text-gray-600 truncate">
                            {key.replace(/_/g, " ")}:
                          </span>
                          <span className="text-green-700 font-medium truncate ml-2">
                            {String(value).slice(0, 15)}
                            {String(value).length > 15 ? "..." : ""}
                          </span>
                        </div>
                      ))}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <motion.div
            {...getRootProps()}
            whileHover={{ scale: 1.02 }}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all bg-white/70 dark:bg-gray-900/70 ${
              isDragActive && !isDragReject
                ? "border-blue-400 bg-blue-50/80 dark:bg-blue-900/40"
                : isDragReject
                ? "border-red-400 bg-red-50/80 dark:bg-red-900/40"
                : "border-gray-300 hover:border-blue-400"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Drop or click to upload
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">JPG, PNG, or PDF</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
