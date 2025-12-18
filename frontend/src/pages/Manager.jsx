import React from "react";
import ManagerDashboard from "../components/ManagerDashboard";

const Manager = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ManagerDashboard />
      </div>
    </div>
  );
};

export default Manager;
