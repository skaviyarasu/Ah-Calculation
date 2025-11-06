import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import App from "./App";
import RowColumnCalculator from "./RowColumnCalculator";
import AdminPanel from "./components/AdminPanel";
import { rbac, auth } from "./lib/supabase";

function MainApp() {
  const [currentView, setCurrentView] = useState("ah-balancer");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const user = await auth.getCurrentUser();
      if (user) {
        const admin = await rbac.isAdmin(user.id);
        setIsAdmin(admin);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    } finally {
      setLoading(false);
    }
  }

  const navigationItems = [
    { id: "ah-balancer", label: "AH Balancer", description: "Interactive 13SxP Optimizer" },
    { id: "row-column", label: "Row & Column Calculator", description: "Simple grid with row sums" },
    ...(isAdmin ? [{ id: "admin", label: "Admin Panel", description: "Role & Access Management" }] : [])
  ];

  return (
    <div>
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-800">AH Balancer - Calculation Tools</h1>
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
        className="max-w-7xl mx-auto"
      >
        {currentView === "ah-balancer" && <App />}
        {currentView === "row-column" && <RowColumnCalculator />}
        {currentView === "admin" && isAdmin && <AdminPanel />}
      </motion.div>
    </div>
  );
}

export default MainApp;
