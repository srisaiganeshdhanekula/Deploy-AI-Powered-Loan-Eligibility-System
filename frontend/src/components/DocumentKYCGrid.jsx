import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, CheckCircle, Loader } from "lucide-react";
import { ocrAPI } from "../utils/api";
import { toast } from "react-toastify";

const DocumentCard = ({ title, subtitle, docType, uploadedFile, onUpload, onRemove }) => {
    const [uploading, setUploading] = useState(false);

    const onDrop = async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setUploading(true);
        try {
            // Simulate API call or use actual one
            const response = await ocrAPI.uploadDocument(file);

            onUpload(file, response.data, docType);
            toast.success(`${title} uploaded successfully!`);

        } catch (error) {
            console.error("Upload failed", error);
            toast.error(`Failed to upload ${title}`);
        } finally {
            setUploading(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [".jpeg", ".jpg", ".png"], "application/pdf": [".pdf"] },
        multiple: false,
        disabled: !!uploadedFile
    });

    return (
        <div className="flex flex-col h-full">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 h-full flex flex-col relative overflow-hidden group">
                <div className="mb-4">
                    <h4 className="text-white font-bold text-lg">{title}</h4>
                    <p className="text-slate-400 text-xs">{subtitle}</p>
                </div>

                {uploadedFile ? (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-green-500/30 bg-green-500/10 border-dashed rounded-lg p-4 relative">
                        <CheckCircle className="w-10 h-10 text-green-500 mb-2" />
                        <p className="text-green-400 font-medium text-sm text-center truncate w-full px-2">
                            {uploadedFile.name}
                        </p>
                        <button
                            onClick={() => onRemove(uploadedFile)}
                            className="absolute top-2 right-2 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <div className="bg-slate-800 p-1 rounded-full">
                                {/* X Icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </div>
                        </button>
                    </div>
                ) : (
                    <div
                        {...getRootProps()}
                        className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all
              ${isDragActive ? "border-blue-500 bg-blue-500/10" : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/50"}
            `}
                    >
                        <input {...getInputProps()} />
                        {uploading ? (
                            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-slate-500 mb-2" />
                                <p className="text-slate-300 text-sm font-semibold text-center">
                                    Drop or click to upload
                                </p>
                                <p className="text-slate-500 text-[10px] mt-1 text-center">
                                    JPG, PNG, or PDF
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const DocumentKYCGrid = ({ uploadedFiles = [], onUploadSuccess, onRemove }) => {

    // Helper to find file by type (using a simple fuzzy match or exact tracking)
    // Since the previous implementation didn't store "docType", we might just map them 
    // sequentially or simply check if *any* file exists for now, 
    // BUT the user wants specific slots.
    // To keep it compatible with existing state (which is just a list of files),
    // we will match by *name* if possible, OR we will implement a local state mapping to the grid.
    // Ideally, 'docType' should be added to the file object in the parent state.

    const getFileForType = (type) => {
        return uploadedFiles.find(f => f.docType === type);
    };

    const handleUpload = (file, data, type) => {
        // Attach docType to the file object before passing up
        // We pass the raw file object + data + docType
        // The parent expects (data, file) signature
        // We'll augment the file object
        file.docType = type;
        onUploadSuccess(data, file);
    };

    const docTypes = [
        { id: "aadhaar", title: "Aadhaar Card", subtitle: "National ID proof" },
        { id: "pan", title: "PAN Card", subtitle: "Tax ID" },
        { id: "kyc", title: "KYC Document", subtitle: "Know Your Customer proof" },
        { id: "bank", title: "Bank Statement", subtitle: "Last 6 months statement" },
        { id: "salary", title: "Salary Slip", subtitle: "Recent salary slip" },
    ];

    return (
        <div className="bg-slate-950 p-6 rounded-xl w-full max-w-4xl mx-auto border border-slate-800">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-slate-800 p-2 rounded-lg">
                        <FileText className="text-white w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Document Verification & KYC</h2>
                </div>
                <p className="text-slate-400 text-sm">
                    Upload all 5 required documents. All uploads are mandatory to proceed with eligibility check.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {docTypes.map((doc) => (
                    <DocumentCard
                        key={doc.id}
                        title={doc.title}
                        subtitle={doc.subtitle}
                        docType={doc.id}
                        uploadedFile={getFileForType(doc.id)}
                        onUpload={handleUpload}
                        onRemove={onRemove}
                    />
                ))}
            </div>
        </div>
    );
};

export default DocumentKYCGrid;
