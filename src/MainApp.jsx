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

  async function checkAdminStatus() {
    try {
      const user = await auth.getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('Checking admin status for user:', user.id);
        const admin = await rbac.isAdmin(user.id);
        console.log('Admin status result:', admin);
        setIsAdmin(admin);
        
        if (!admin) {
          console.log('User is not an admin. To become admin:');
          console.log('1. Go to Supabase Dashboard → Authentication → Users');
          console.log('2. Copy your User ID');
          console.log('3. Run this SQL in Supabase SQL Editor:');
          console.log(`   INSERT INTO user_roles (user_id, role) VALUES ('${user.id}', 'admin');`);
        }
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
              {!isAdmin && currentUserId && (
                <button
                  onClick={refreshAdminStatus}
                  className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                  title="Refresh admin status"
                >
                  🔄
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Admin Access Helper (only show if not admin) */}
      {!isAdmin && currentUserId && currentView !== "admin" && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="text-yellow-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-yellow-800 mb-1">Admin Panel Not Available</p>
                <p className="text-yellow-700 mb-2">
                  To access the Admin Panel, you need to be assigned the admin role. 
                </p>
                <details className="text-xs text-yellow-700">
                  <summary className="cursor-pointer font-medium mb-1">How to get admin access</summary>
                  <ol className="list-decimal list-inside space-y-1 mt-2 pl-2">
                    <li>Go to Supabase Dashboard → Authentication → Users</li>
                    <li>Find your account and copy the User ID (UUID)</li>
                    <li>Go to SQL Editor and run:</li>
                  </ol>
                  <div className="bg-yellow-100 p-2 rounded mt-2 font-mono text-xs overflow-x-auto">
                    INSERT INTO user_roles (user_id, role) VALUES ('{currentUserId}', 'admin');
                  </div>
                  <p className="mt-2 text-xs">After running the SQL, click the refresh button (🔄) above to reload your permissions.</p>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

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
