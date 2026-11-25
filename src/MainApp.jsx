import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import App from "./App";
import AdminPanel from "./components/AdminPanel";
import InventoryManagement from "./components/InventoryManagement";
import AccountingDashboard from "./components/AccountingDashboard";
import CellGrouping from "./components/CellGrouping";
import GenieShell from "./components/GenieShell";
import { useRole } from "./hooks/useRole";
import { useBranch } from "./hooks/useBranch";
import { useCellGroupingAccess } from "./hooks/useCellGroupingAccess";
import { auth, cellGrouping } from "./lib/supabase";
import { ROLE_METADATA } from "./constants/rolePermissionMatrix";

// Office-network restriction for Group cells (database/20_cell_grouping_office_network.sql)
const officeNetwork = {
  getStatus: cellGrouping.getOfficeStatus,
  list: cellGrouping.listOfficeIps,
  add: cellGrouping.addOfficeIp,
  remove: cellGrouping.removeOfficeIp,
};

function MainApp() {
  const [currentView, setCurrentView] = useState("ah-balancer");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const { isAdmin, loading, canViewInventory, currentUser, userRole } = useRole();
  const {
    canManageRules,
    canProcessReports,
    loading: groupingLoading,
  } = useCellGroupingAccess(isAdmin, loading);
  const canUseCellGrouping = canManageRules || canProcessReports;
  const {
    currentBranch,
    loading: branchLoading,
  } = useBranch();

  // Redirect away from admin view if user is not admin
  useEffect(() => {
    if (currentView === "admin" && !loading && !isAdmin) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, isAdmin, loading]);

  // Redirect away from cell grouping if the user is neither admin nor operator
  useEffect(() => {
    if (currentView === "cell-grouping" && !groupingLoading && !canUseCellGrouping) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, canUseCellGrouping, groupingLoading]);

  // Redirect away from inventory/accounting views if user doesn't have permission
  useEffect(() => {
    const restrictedViews = ["inventory", "accounting"];
    if (restrictedViews.includes(currentView) && !loading && !canViewInventory) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, canViewInventory, loading]);

  // Genie sidebar groups (value stream). Each group only appears when it has an item the user may open.
  const navigationGroups = useMemo(() => (
    [
      {
        id: "pack",
        label: "Pack manufacturing",
        breadcrumb: "Pack manufacturing",
        items: [{ id: "ah-balancer", label: "Job Optimizer", description: "Interactive 13SxP Balancer" }],
      },
      {
        id: "grading",
        label: "Cell grading",
        breadcrumb: "Grading",
        items: canUseCellGrouping ? [{ id: "cell-grouping", label: "Group cells", description: "Grading report processing" }] : [],
      },
      {
        id: "stores",
        label: "Inventory & accounts",
        breadcrumb: "Inventory & accounts",
        items: canViewInventory
          ? [
              { id: "inventory", label: "Inventory", description: "Stock & Item Directory" },
              { id: "accounting", label: "Accounting", description: "Sales, Purchases & Financials" },
            ]
          : [],
      },
      {
        id: "setup",
        label: "Set-up",
        breadcrumb: "Set-up",
        items: isAdmin ? [{ id: "admin", label: "Admin Studio", description: "Roles & Access Governance" }] : [],
      },
    ].filter((group) => group.items.length > 0)
  ), [canViewInventory, isAdmin, canUseCellGrouping]);

  const navigationItems = useMemo(() => navigationGroups.flatMap((group) => group.items), [navigationGroups]);

  const shellUser = {
    name: currentUser?.user_metadata?.full_name || currentUser?.email || "",
    roleLabel: ROLE_METADATA[userRole]?.label || userRole || "User",
    place: currentBranch ? currentBranch.name : "",
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut(); // the login wrapper reacts to the auth change
    } catch (error) {
      console.error("Logout error:", error);
      alert("Logout failed. Please try again.");
    }
  };

  const filteredCommands = useMemo(() => {
    if (!commandQuery.trim()) return navigationItems;
    const normalized = commandQuery.toLowerCase();
    return navigationItems.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized)
    );
  }, [commandQuery, navigationItems]);

  const handleCommandClose = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery("");
  }, []);

  useEffect(() => {
    const keyHandler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if (event.key === "Escape") {
        handleCommandClose();
      }
    };

    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
    };
  }, [handleCommandClose]);

  // Show loading state while checking admin status
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-genie-app">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-genie-border flex items-center justify-center">
            <span className="h-6 w-6 rounded-full border-2 border-genie-primary border-t-transparent animate-spin"></span>
          </div>
          <p className="text-genie-text-secondary text-sm">Checking permissions…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <GenieShell
        groups={navigationGroups}
        currentView={currentView}
        onSelect={setCurrentView}
        user={shellUser}
        onSignOut={handleSignOut}
        topBarRight={
          <div className="flex items-center gap-3">
            {currentBranch && (
              <div className="hidden items-center gap-2 rounded-full bg-genie-muted px-4 py-2 text-sm md:flex">
                <span className="text-xs font-medium text-genie-text-secondary">Branch</span>
                <span className="font-medium text-genie-text">
                  {currentBranch.name}
                  {currentBranch.organizationName ? ` • ${currentBranch.organizationName}` : ""}
                </span>
                {branchLoading && <span className="h-2 w-2 rounded-full bg-genie-accent animate-pulse" aria-hidden="true"></span>}
              </div>
            )}
            <button
              onClick={() => setCommandOpen(true)}
              className="hidden items-center gap-2 rounded-full bg-genie-muted px-4 py-2 text-sm font-medium text-genie-text-secondary transition hover:text-genie-text sm:flex"
            >
              <span>Quick command</span>
              <code className="rounded-md bg-genie-surface px-2 py-0.5 text-xs">Ctrl + K</code>
            </button>
          </div>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="mx-auto w-full max-w-7xl"
          >
            {currentView === "ah-balancer" && <App />}
            {currentView === "cell-grouping" && canUseCellGrouping && (
              <CellGrouping
                canManageRules={canManageRules}
                canProcessReports={canProcessReports}
                loadRules={cellGrouping.getPublishedRules}
                publishRules={cellGrouping.publishRules}
                officeNetwork={officeNetwork}
              />
            )}
            {currentView === "inventory" && <InventoryManagement />}
            {currentView === "accounting" && <AccountingDashboard />}
            {currentView === "admin" && isAdmin ? (
              <AdminPanel />
            ) : currentView === "admin" && !isAdmin ? (
              <App />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </GenieShell>

      <AnimatePresence>
        {commandOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-md px-4 pt-32"
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="glass-panel w-full max-w-xl overflow-hidden"
            >
              <div className="border-b border-white/10 bg-white/65 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <input
                    autoFocus
                    value={commandQuery}
                    onChange={(event) => setCommandQuery(event.target.value)}
                    placeholder="Search destinations or actions…"
                    className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button
                    onClick={handleCommandClose}
                    className="rounded-full border border-white/30 bg-white/40 px-2.5 py-1 text-xs uppercase text-muted-foreground"
                  >
                    Esc
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto px-2 py-3">
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No matches. Try a different keyword.
                  </div>
                ) : (
                  filteredCommands.map((item) => {
                    const isActive = currentView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCurrentView(item.id);
                          handleCommandClose();
                        }}
                        className={`flex w-full flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition ${
                          isActive
                            ? "bg-accent/20 text-accent-foreground"
                            : "hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default MainApp;
