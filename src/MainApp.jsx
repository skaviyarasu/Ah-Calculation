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
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  // Redirect away from admin view if user is not admin
  useEffect(() => {
    if (currentView === "admin" && !loading && !isAdmin) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, isAdmin, loading]);

  async function checkAdminStatus() {
    try {
      const user = await auth.getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('Checking admin status for user:', user.id);
        const admin = await rbac.isAdmin(user.id);
        console.log('Admin status result:', admin);
        setIsAdmin(admin);
        
      } else {
        console.log('No user found');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    } finally {
      setLoading(false);
    }
  }

  // Refresh admin status (useful after assigning role)
  async function refreshAdminStatus() {
    setLoading(true);
    await checkAdminStatus();
  }

  const navigationItems = [
    { id: "ah-balancer", label: "AH Balancer", description: "Interactive 13SxP Optimizer" },
    { id: "row-column", label: "Row & Column Calculator", description: "Simple grid with row sums" },
    ...(isAdmin ? [{ id: "admin", label: "Admin Panel", description: "Role & Access Management" }] : [])
  ];

  // Show loading state while checking admin status
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-800">AH Balancer - Calculation Tools</h1>
            <div className="flex items-center gap-2">
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
        {currentView === "admin" && isAdmin ? (
          <AdminPanel />
        ) : currentView === "admin" && !isAdmin ? (
          // Redirect to AH Balancer if trying to access admin without permission
          <App />
        ) : null}
      </motion.div>
    </div>
  );
}

export default MainApp;
