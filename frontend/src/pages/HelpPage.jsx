import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Search, BookOpen, FileText, Users, Settings } from "lucide-react";

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState(0);

  const faqCategories = [
    {
      title: "Getting Started",
      icon: BookOpen,
      faqs: [
        {
          question: "How do I create an account?",
          answer: "Click on 'Sign Up' on the home page, enter your email, create a password, and verify your email address. You'll then be able to log in and access the loan application.",
        },
        {
          question: "What are the system requirements?",
          answer: "You need a modern web browser (Chrome, Firefox, Safari, or Edge), internet connection, and a device with a camera and microphone for voice interactions.",
        },
        {
          question: "Is my data secure?",
          answer: "Yes, we use bank-grade encryption for all data. Your personal information is protected and complies with all financial privacy regulations.",
        },
      ],
    },
    {
      title: "Loan Application",
      icon: FileText,
      faqs: [
        {
          question: "What documents do I need to apply?",
          answer: "Required documents include: government-issued ID, proof of income (pay stubs or tax returns), proof of residence, and bank statements for the last 3 months.",
        },
        {
          question: "How long does the application process take?",
          answer: "The application typically takes 10-15 minutes to complete. Our AI assistant can help guide you through each step.",
        },
        {
          question: "Can I save my application and continue later?",
          answer: "Yes, your application is automatically saved as you fill it out. You can close and return to it anytime within 30 days.",
        },
        {
          question: "What is the eligibility check?",
          answer: "The eligibility check uses AI to analyze your financial profile and determine your likelihood of loan approval based on your information.",
        },
      ],
    },
    {
      title: "Document Verification",
      icon: Users,
      faqs: [
        {
          question: "How do I upload documents?",
          answer: "Click 'Upload Documents' in the application, select the file type, and upload your document. Our system uses OCR to automatically extract information.",
        },
        {
          question: "What file formats are accepted?",
          answer: "We accept PDF, JPG, PNG, and DOCX formats. File size should not exceed 10MB.",
        },
        {
          question: "How are my documents verified?",
          answer: "Our AI system analyzes your documents using optical character recognition (OCR) to extract and verify key information. A human reviewer may also check sensitive documents.",
        },
        {
          question: "How long does verification take?",
          answer: "Most documents are verified within 24 hours. Complex cases may take up to 3 business days.",
        },
      ],
    },
    {
      title: "Eligibility & Results",
      icon: Settings,
      faqs: [
        {
          question: "What factors affect my eligibility?",
          answer: "Eligibility depends on: credit score, income level, employment history, debt-to-income ratio, and requested loan amount.",
        },
        {
          question: "What does the AI analysis show?",
          answer: "The AI provides detailed analysis including your credit assessment, income verification, risk profile, and recommended loan terms.",
        },
        {
          question: "Can I appeal a rejection?",
          answer: "Yes, you can request a human review of your application. Contact our support team with your application ID for more information.",
        },
        {
          question: "How is the interest rate determined?",
          answer: "Your rate is based on your credit score, income, loan amount, and market conditions. Our AI helps estimate your rate during application.",
        },
      ],
    },
  ];

  const filteredCategories = faqCategories.map((category) => ({
    ...category,
    faqs: category.faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  }));

  const hasResults = filteredCategories.some((cat) => cat.faqs.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-100/80 via-white to-primary-100/80 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
            Help & Support
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Find answers to common questions about loan applications, documents, and eligibility.
          </p>

          {/* Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white shadow-lg"
            />
          </div>
        </motion.div>

        {/* FAQ Sections */}
        {hasResults ? (
          <div className="space-y-6">
            {filteredCategories.map((category, categoryIndex) => {
              if (category.faqs.length === 0) return null;
              const Icon = category.icon;
              return (
                <motion.div
                  key={categoryIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: categoryIndex * 0.1 }}
                  className="glass rounded-3xl shadow-lg border border-white/30 backdrop-blur-xl overflow-hidden"
                >
                  {/* Category Header */}
                  <motion.button
                    onClick={() =>
                      setExpandedCategory(
                        expandedCategory === categoryIndex ? -1 : categoryIndex
                      )
                    }
                    className="w-full px-6 py-6 flex items-center justify-between hover:bg-white/5 transition"
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white text-left">
                        {category.title}
                      </h2>
                    </div>
                    <motion.div
                      animate={{
                        rotate: expandedCategory === categoryIndex ? 180 : 0,
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </motion.div>
                  </motion.button>

                  {/* FAQ Items */}
                  <motion.div
                    initial={false}
                    animate={{
                      height: expandedCategory === categoryIndex ? "auto" : 0,
                      opacity: expandedCategory === categoryIndex ? 1 : 0,
                    }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-4 border-t border-white/10 space-y-4">
                      {category.faqs.map((faq, faqIndex) => (
                        <motion.div
                          key={faqIndex}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: faqIndex * 0.1 }}
                          className="pb-4"
                        >
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                            {faq.question}
                          </h3>
                          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                            {faq.answer}
                          </p>
                          {faqIndex < category.faqs.length - 1 && (
                            <div className="border-t border-gray-200 dark:border-gray-700 mt-4" />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
              No results found for "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="inline-block px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold hover:shadow-lg transition"
            >
              Clear Search
            </button>
          </motion.div>
        )}

        {/* Support Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 glass rounded-3xl shadow-lg p-8 border border-primary-200/50 backdrop-blur-xl bg-primary-50/50 dark:bg-primary-900/20 text-center"
        >
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Didn't find your answer?
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Our support team is here to help. Contact us for any questions not covered in this FAQ.
          </p>
          <a
            href="/contact"
            className="inline-block px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold hover:shadow-lg transition"
          >
            Contact Support
          </a>
        </motion.div>
      </div>
    </div>
  );
}
