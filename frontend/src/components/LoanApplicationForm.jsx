import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { loanAPI } from "../utils/api";
import { auth } from "../utils/auth";
import { toast } from "react-toastify";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  DollarSign,
  Calendar,
  CreditCard,
  Building,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

const LoanApplicationForm = ({ setEligibilityResult, setApplicationData, setApplicationId }) => {
  const [formData, setFormData] = useState({
    // Personal Information
    full_name: "",
    email: "",
    phone: "",
    age: "",
    gender: "",
    marital_status: "",
    dependents: "",

    // Employment & Income
    employment_type: "",
    monthly_income: "",
    existing_emi: "",
    salary_credit_frequency: "",

    // Loan Details
    loan_amount_requested: "",
    loan_tenure_years: "",
    loan_purpose: "",

    // Financial Information
    credit_score: "",
    total_deposits: "",
    total_withdrawals: "",
    avg_balance: "",
    bounced_transactions: "",
    account_age_months: "",
    total_liabilities: "",

    // Location & Bank
    region: "",
    bank_name: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateStep = (step) => {
    switch (step) {
      case 1: // Personal Info
        return (
          formData.full_name &&
          formData.email &&
          formData.phone &&
          formData.age &&
          formData.gender &&
          formData.marital_status
        );
      case 2: // Employment & Income
        return (
          formData.employment_type &&
          formData.monthly_income &&
          formData.salary_credit_frequency
        );
      case 3: // Loan Details
        return (
          formData.loan_amount_requested &&
          formData.loan_tenure_years &&
          formData.loan_purpose
        );
      case 4: // Financial & Location
        return formData.region && formData.bank_name;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    } else {
      toast.error("Please fill in all required fields");
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Prefill from applicationId in URL or last application for this user
  const location = useLocation();
  useEffect(() => {
    const prefill = async () => {
      try {
        let app = {};
        const params = new URLSearchParams(location.search);
        const applicationId = params.get("applicationId");
        if (applicationId) {
          // Fetch application by ID
          const res = await loanAPI.getApplicationById(applicationId);
          app = res.data || {};
        } else if (auth.isAuthenticated()) {
          // Fallback: fetch last application
          const res = await loanAPI.getLastApplication();
          app = res.data || {};
        }
        if (Object.keys(app).length > 0) {
          setFormData((prev) => ({
            ...prev,
            // Personal
            full_name: app.full_name || prev.full_name,
            email: app.email || prev.email,
            phone: app.phone || prev.phone,
            age: app.age ?? prev.age,
            gender: app.gender || prev.gender,
            marital_status: app.marital_status || prev.marital_status,
            dependents: app.dependents ?? prev.dependents,
            // Employment & Income
            employment_type:
              app.employment_type ||
              app.employment_status ||
              prev.employment_type,
            monthly_income:
              app.monthly_income ??
              (app.annual_income
                ? Math.round(app.annual_income / 12)
                : prev.monthly_income),
            existing_emi: app.existing_emi ?? prev.existing_emi,
            salary_credit_frequency:
              app.salary_credit_frequency || prev.salary_credit_frequency,
            // Loan Details
            loan_amount_requested:
              app.loan_amount_requested ??
              app.loan_amount ??
              prev.loan_amount_requested,
            loan_tenure_years:
              app.loan_tenure_years ??
              (app.loan_term_months
                ? Math.round(app.loan_term_months / 12)
                : prev.loan_tenure_years),
            loan_purpose: app.loan_purpose || prev.loan_purpose,
            // Financial & Location
            credit_score: app.credit_score ?? prev.credit_score,
            total_deposits: app.total_deposits ?? prev.total_deposits,
            total_withdrawals: app.total_withdrawals ?? prev.total_withdrawals,
            avg_balance: app.avg_balance ?? prev.avg_balance,
            bounced_transactions:
              app.bounced_transactions ?? prev.bounced_transactions,
            account_age_months:
              app.account_age_months ?? prev.account_age_months,
            total_liabilities: app.total_liabilities ?? prev.total_liabilities,
            region: app.region || prev.region,
            bank_name: app.bank_name || prev.bank_name,
          }));
          toast.info(
            applicationId
              ? `Loaded application #${applicationId}. You can modify and submit.`
              : "Loaded your last application details. You can modify and submit.",
            { toastId: applicationId ? `app-${applicationId}` : "last-app-load" }
          );
        }
      } catch (e) {
        // No previous application or error; ignore silently
      }
    };
    prefill();
    // Only run when location.search changes
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all steps, not just the current one
    const requiredByStep = {
      1: [
        { key: "full_name", label: "Full Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "age", label: "Age" },
        { key: "gender", label: "Gender" },
        { key: "marital_status", label: "Marital Status" },
      ],
      2: [
        { key: "employment_type", label: "Employment Type" },
        { key: "monthly_income", label: "Monthly Income" },
        { key: "salary_credit_frequency", label: "Salary Credit Frequency" },
      ],
      3: [
        { key: "loan_amount_requested", label: "Loan Amount Requested" },
        { key: "loan_tenure_years", label: "Loan Tenure (Years)" },
        { key: "loan_purpose", label: "Loan Purpose" },
      ],
      4: [
        { key: "region", label: "Region" },
        { key: "bank_name", label: "Bank Name" },
      ],
    };
    const missing = [];
    let firstMissingStep = null;
    for (const step of [1, 2, 3, 4]) {
      for (const field of requiredByStep[step]) {
        if (!String(formData[field.key] || "").trim()) {
          missing.push(field.label);
          if (firstMissingStep == null) firstMissingStep = step;
        }
      }
    }
    if (missing.length > 0) {
      toast.error(
        `Please complete the following: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""
        }`
      );
      if (firstMissingStep) setCurrentStep(firstMissingStep);
      return;
    }

    setIsSubmitting(true);
    try {
      // First create the loan application
      const monthlyIncomeNum = Number(formData.monthly_income);
      const creditScoreNum = Number(formData.credit_score);
      const loanAmountNum = Number(formData.loan_amount_requested);
      const tenureYearsNum = Number(formData.loan_tenure_years);
      const dependentsNum = Number(formData.dependents || 0);

      if (!Number.isFinite(monthlyIncomeNum) || monthlyIncomeNum <= 0) {
        throw new Error("Invalid monthly income");
      }
      if (!Number.isFinite(loanAmountNum) || loanAmountNum <= 0) {
        throw new Error("Invalid loan amount requested");
      }
      if (!Number.isFinite(tenureYearsNum) || tenureYearsNum <= 0) {
        throw new Error("Invalid loan tenure");
      }

      const user = auth.getUser();
      const applicationData = {
        user_id: user?.id || 1, // Default user if not available
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        annual_income: monthlyIncomeNum * 12,
        credit_score: Number.isFinite(creditScoreNum) ? creditScoreNum : 650,
        loan_amount: loanAmountNum,
        loan_term_months: tenureYearsNum * 12,
        num_dependents: Number.isFinite(dependentsNum) ? dependentsNum : 0,
        employment_status: formData.employment_type,
      };

      // Create application first
      const appResponse = await loanAPI.createApplication(applicationData);
      const applicationId = appResponse.data.id;
      if (setApplicationId) setApplicationId(applicationId);
      if (setApplicationData) setApplicationData(applicationData);

      // Get eligibility result
      const eligibilityResponse = await loanAPI.predictForApplication(applicationId);
      const eligibilityResult = eligibilityResponse.data;
      if (setEligibilityResult) setEligibilityResult(eligibilityResult);

      toast.success("Application created. Please upload your documents.");
      // Optionally, navigate to document upload after showing result
      // navigate(`/verify?applicationId=${applicationId}`);
    } catch (error) {
      const serverMsg = error?.response?.data?.detail;
      const msg =
        serverMsg || error?.message || "Failed to submit application.";
      toast.error(msg);
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step indicator removed (unused) to satisfy eslint `no-unused-vars`.

  const renderPersonalInfo = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Personal Information
        </h3>
        <p className="text-gray-600">Let's start with your basic details</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name *
          </label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="Enter your full name"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address *
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="your@email.com"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number *
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="+1 (555) 123-4567"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Age *
          </label>
          <input
            type="number"
            name="age"
            value={formData.age}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            placeholder="25"
            min="18"
            max="100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Gender *
          </label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100"
            required
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Marital Status *
          </label>
          <select
            name="marital_status"
            value={formData.marital_status}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            required
          >
            <option value="">Select Status</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Divorced">Divorced</option>
            <option value="Widowed">Widowed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Dependents
          </label>
          <input
            type="number"
            name="dependents"
            value={formData.dependents}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            placeholder="0"
            min="0"
          />
        </div>
      </div>
    </motion.div>
  );

  const renderEmploymentInfo = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Employment & Income
        </h3>
        <p className="text-gray-600">Tell us about your work and earnings</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Employment Type *
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <select
              name="employment_type"
              value={formData.employment_type}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              required
            >
              <option value="">Select Employment Type</option>
              <option value="Salaried">Salaried</option>
              <option value="Self-Employed">Self-Employed</option>
              <option value="Business Owner">Business Owner</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Student">Student</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Monthly Income (₹) *
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="number"
              name="monthly_income"
              value={formData.monthly_income}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="50000"
              min="0"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Existing EMI (₹)
          </label>
          <div className="relative">
            <TrendingUp className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="number"
              name="existing_emi"
              value={formData.existing_emi}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="0"
              min="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Salary Credit Frequency *
          </label>
          <select
            name="salary_credit_frequency"
            value={formData.salary_credit_frequency}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            required
          >
            <option value="">Select Frequency</option>
            <option value="Monthly">Monthly</option>
            <option value="Weekly">Weekly</option>
            <option value="Bi-weekly">Bi-weekly</option>
            <option value="Daily">Daily</option>
          </select>
        </div>
      </div>
    </motion.div>
  );

  const renderLoanDetails = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Loan Details</h3>
        <p className="text-gray-600">What type of loan are you looking for?</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Loan Amount Requested (₹) *
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="number"
              name="loan_amount_requested"
              value={formData.loan_amount_requested}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="500000"
              min="10000"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Loan Tenure (Years) *
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="number"
              name="loan_tenure_years"
              value={formData.loan_tenure_years}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="5"
              min="1"
              max="30"
              required
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Loan Purpose *
          </label>
          <select
            name="loan_purpose"
            value={formData.loan_purpose}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            required
          >
            <option value="">Select Loan Purpose</option>
            <option value="Personal">Personal Loan</option>
            <option value="Home">Home Loan</option>
            <option value="Car">Car Loan</option>
            <option value="Education">Education Loan</option>
            <option value="Business">Business Loan</option>
            <option value="Medical">Medical Loan</option>
            <option value="Travel">Travel Loan</option>
            <option value="Wedding">Wedding Loan</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
    </motion.div>
  );

  const renderFinancialInfo = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Financial & Location Details
        </h3>
        <p className="text-gray-600">Almost done! Just a few more details</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Credit Score
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="number"
              name="credit_score"
              value={formData.credit_score}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="650"
              min="300"
              max="900"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Region *
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <select
              name="region"
              value={formData.region}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              required
            >
              <option value="">Select Region</option>
              <option value="Urban">Urban</option>
              <option value="Semi-Urban">Semi-Urban</option>
              <option value="Rural">Rural</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bank Name *
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              name="bank_name"
              value={formData.bank_name}
              onChange={handleInputChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
              placeholder="e.g., HDFC Bank, SBI"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Account Age (Months)
          </label>
          <input
            type="number"
            name="account_age_months"
            value={formData.account_age_months}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            placeholder="12"
            min="1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Average Balance (₹)
          </label>
          <input
            type="number"
            name="avg_balance"
            value={formData.avg_balance}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            placeholder="50000"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Total Liabilities (₹)
          </label>
          <input
            type="number"
            name="total_liabilities"
            value={formData.total_liabilities}
            onChange={handleInputChange}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-gray-100 placeholder-gray-500"
            placeholder="0"
            min="0"
          />
        </div>
      </div>
    </motion.div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderPersonalInfo();
      case 2:
        return renderEmploymentInfo();
      case 3:
        return renderLoanDetails();
      case 4:
        return renderFinancialInfo();
      default:
        return renderPersonalInfo();
    }
  };

  return (
    <div className="max-w-4xl mx-auto glass shadow-2xl p-10 mt-10 mb-10 animate-fade-in">
      {/* Stepper */}
      <div className="flex justify-between items-center mb-10">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex-1 flex flex-col items-center">
            <div
              className={`w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg border-4 transition-all duration-300 ${currentStep === step
                  ? "bg-primary-600 text-white border-primary-400 scale-110 shadow-lg"
                  : "bg-white text-primary-600 border-gray-200 dark:bg-gray-800 dark:text-primary-300"
                }`}
            >
              {step}
            </div>
            <span
              className={`mt-2 text-xs font-semibold ${currentStep === step
                  ? "text-primary-600"
                  : "text-gray-400 dark:text-gray-500"
                }`}
            >
              {["Personal", "Employment", "Loan", "Financial"][step - 1]}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {renderCurrentStep()}

        <div className="flex justify-between mt-8">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              className="btn-primary flex items-center"
            >
              Next
              <ArrowRight className="ml-2 w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-all duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Application"}
              <ArrowRight className="ml-2 w-4 h-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default LoanApplicationForm;
