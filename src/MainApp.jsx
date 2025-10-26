import React, { useState } from "react";
import { motion } from "framer-motion";
import App from "./App";
import RowColumnCalculator from "./RowColumnCalculator";

function MainApp() {
  const [currentView, setCurrentView] = useState("ah-balancer");

  const navigationItems = [
    { id: "ah-balancer", label: "AH Balancer", description: "Interactive 13SxP Optimizer" },
    { id: "row-column", label: "Row & Column Calculator", description: "Simple grid with row sums" }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-800">Calculation Tools</h1>
            <div className="flex space-x-1">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === item.id
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <motion.div
        key={currentView}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {currentView === "ah-balancer" && <App />}
        {currentView === "row-column" && <RowColumnCalculator />}
      </motion.div>
    </div>
  );
}

export default MainApp;
