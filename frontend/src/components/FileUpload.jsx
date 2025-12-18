import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { ocrAPI, loanAPI } from "../utils/api";
import { toast } from "react-toastify";
import {
  Upload,
  FileText,
  CheckCircle,
  X,
  AlertCircle,
  Loader,
} from "lucide-react";

const FileUpload = ({ onUploadSuccess, applicationId, footer, previousUploads = [], onRemove }) => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = useCallback(
    async (file) => {
      setUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return prev;
            }
            return prev + 10;
          });
        }, 200);

        const response = applicationId
          ? await ocrAPI.verifyDocument(applicationId, file)
          : await ocrAPI.uploadDocument(file);

        clearInterval(progressInterval);
        setUploadProgress(100);
        setExtractedData(response.data.extracted_data);

        // Verify document in database if applicationId is provided
        if (applicationId) {
          try {
            await loanAPI.verifyDocument(
              applicationId,
              response.data.extracted_data
            );
            console.log("Document verified in database");
          } catch (verifyError) {
            console.error("Document verification failed:", verifyError);
            // Don't fail the whole process if verification fails
          }
        }

        setTimeout(() => {
          toast.success("Document uploaded and verified successfully!");
          if (onUploadSuccess) {
            onUploadSuccess(response.data, file);
          }
        }, 500);
      } catch (error) {
        const status = error?.response?.status;
        const detail = error?.response?.data?.detail;
        let message = "Failed to upload document. Please try again.";
        if (status === 404) {
          message = "Application not found. Open the form first to create one.";
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
        console.error("Upload error:", error);
      } finally {
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
        }, 1000);
      }
    },
    [applicationId, onUploadSuccess]
  );

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        setError("Please upload a valid file (JPG, PNG, or PDF, max 10MB)");
        return;
      }

      const file = acceptedFiles[0];
      if (file) {
        setError(null);
        setUploadedFile(file);
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: {
        "image/*": [".jpeg", ".jpg", ".png"],
        "application/pdf": [".pdf"],
      },
      multiple: false,
      maxSize: 10 * 1024 * 1024, // 10MB
    });

  const removeFile = () => {
    setUploadedFile(null);
    setExtractedData(null);
    setError(null);
  };

  const getFileIcon = (file) => {
    if (file.type.startsWith("image/")) {
      return <Upload className="w-8 h-8 text-primary-600" />;
    }
    return <FileText className="w-8 h-8 text-secondary-600" />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="w-full flex flex-col min-h-0">
      {applicationId && (
        <div className="mb-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Uploads will be linked to application #{applicationId}.
        </div>
      )}

      {/* Previous Uploads List */}

      {/* Upload Zone */}
      <motion.div
        {...getRootProps()}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${isDragActive && !isDragReject
          ? "border-primary-400 bg-primary-50 shadow-lg"
          : isDragReject
            ? "border-red-400 bg-red-50"
            : "border-gray-300 hover:border-primary-400 hover:bg-gray-50"
          }`}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {uploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center"
            >
              <div className="relative mb-4">
                <Loader className="w-12 h-12 text-primary-600 animate-spin" />
                <div className="absolute inset-0 rounded-full border-4 border-primary-200"></div>
              </div>
              <p className="text-gray-600 font-medium mb-2">
                Processing document...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div
                  className="bg-primary-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {uploadProgress}% complete
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="upload-zone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={
                  isDragActive
                    ? { scale: 1.1, rotate: 5 }
                    : { scale: 1, rotate: 0 }
                }
                className="mb-4"
              >
                <Upload
                  className={`w-16 h-16 ${isDragActive ? "text-primary-600" : "text-gray-400"
                    }`}
                />
              </motion.div>

              <AnimatePresence mode="wait">
                {isDragActive && !isDragReject ? (
                  <motion.div
                    key="drag-active"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <p className="text-primary-600 font-semibold text-lg">
                      Drop your document here
                    </p>
                  </motion.div>
                ) : isDragReject ? (
                  <motion.div
                    key="drag-reject"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <p className="text-red-600 font-semibold text-lg">
                      File type not supported
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="default"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <p className="text-gray-700 font-medium text-lg mb-2">
                      Drag & drop your document here
                    </p>
                    <p className="text-gray-500 text-sm">
                      or{" "}
                      <span className="text-primary-600 font-medium">
                        browse files
                      </span>{" "}
                      to upload
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-4 text-xs text-gray-500">
                Supports: JPG, PNG, PDF • Max size: 10MB
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded File */}
      <AnimatePresence>
        {uploadedFile && !uploading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getFileIcon(uploadedFile)}
                <div>
                  <p className="font-medium text-gray-900 truncate max-w-xs">
                    {uploadedFile.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(uploadedFile.size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <button
                  onClick={removeFile}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted Data */}
      <AnimatePresence>
        {extractedData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl min-h-0"
          >
            <div className="flex items-center space-x-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-green-800">
                Document Verified Successfully
              </h4>
            </div>
            <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-2">
              {Object.entries(extractedData).map(([key, value], index) => {
                const label = key.replace(/_/g, " ");
                const isObject = value && typeof value === "object";

                if (key === "fields" && isObject) {
                  const fields = value || {};
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="py-2 border-b border-green-100 last:border-b-0"
                    >
                      <div className="text-sm text-green-700 capitalize font-semibold mb-2">
                        {label}:
                      </div>
                      <div className="space-y-1">
                        {Object.entries(fields).map(([fKey, fVal]) => {
                          let display = "";
                          let confidence = undefined;
                          if (Array.isArray(fVal)) {
                            if (fVal.length === 2) {
                              const [v, conf] = fVal;
                              confidence = conf;
                              display = Array.isArray(v)
                                ? v.join(", ")
                                : String(v ?? "Not found");
                            } else {
                              display = fVal.map((x) => String(x)).join(", ");
                            }
                          } else if (fVal && typeof fVal === "object") {
                            display = JSON.stringify(fVal);
                          } else {
                            display = String(fVal ?? "Not found");
                          }

                          return (
                            <div
                              key={fKey}
                              className="flex justify-between items-center"
                            >
                              <span className="text-xs text-green-700 capitalize">
                                {fKey.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs text-green-900 font-medium bg-white px-2 py-0.5 rounded">
                                {display}
                                {typeof confidence === "number" && (
                                  <span className="ml-2 text-[10px] text-green-600">
                                    ({Math.round(confidence * 100)}%)
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                }

                if (isObject) {
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="py-2 border-b border-green-100 last:border-b-0"
                    >
                      <div className="text-sm text-green-700 capitalize font-medium">
                        {label}:
                      </div>
                      <pre className="mt-1 text-xs text-green-900 bg-white p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex justify-between items-center py-2 border-b border-green-100 last:border-b-0"
                  >
                    <span className="text-sm text-green-700 capitalize font-medium">
                      {label}:
                    </span>
                    <span className="text-sm text-green-900 font-semibold bg-white px-2 py-1 rounded">
                      {String(value ?? "Not found")}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Previous Uploads List - Moved to bottom for stability */}
      {previousUploads.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upload History</p>
          <div className="space-y-2">
            {previousUploads.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg group">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="bg-white p-1 rounded-md border border-gray-100">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-blue-600">Verified</p>
                  </div>
                </div>
                {onRemove && (
                  <button
                    onClick={() => onRemove(file)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer (e.g., action button) rendered below extracted data */}
      {extractedData && footer && <div className="mt-4">{footer}</div>}
    </div>
  );
};

export default FileUpload;
