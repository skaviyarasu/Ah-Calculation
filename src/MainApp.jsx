import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import App from "./App";
import AdminPanel from "./components/AdminPanel";
import InventoryManagement from "./components/InventoryManagement";
import AccountingDashboard from "./components/AccountingDashboard";
import { useRole } from "./hooks/useRole";
import { useBranch } from "./hooks/useBranch";

function MainApp() {
  const [currentView, setCurrentView] = useState("ah-balancer");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const { isAdmin, loading, canViewInventory } = useRole();
  const {
    branches: availableBranches,
    currentBranch,
    loading: branchLoading,
    selectBranch
  } = useBranch();

  // Redirect away from admin view if user is not admin
  useEffect(() => {
    if (currentView === "admin" && !loading && !isAdmin) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, isAdmin, loading]);

  // Redirect away from inventory/accounting views if user doesn't have permission
  useEffect(() => {
    const restrictedViews = ["inventory", "accounting"];
    if (restrictedViews.includes(currentView) && !loading && !canViewInventory) {
      setCurrentView("ah-balancer");
    }
  }, [currentView, canViewInventory, loading]);

  const navigationItems = useMemo(() => (
    [
      { id: "ah-balancer", label: "Job Optimizer", description: "Interactive 13SxP Balancer" },
      ...(canViewInventory ? [
        { id: "inventory", label: "Inventory", description: "Stock & Item Directory" },
        { id: "accounting", label: "Accounting", description: "Sales, Purchases & Financials" }
      ] : []),
      ...(isAdmin ? [{ id: "admin", label: "Admin Studio", description: "Roles & Access Governance" }] : [])
    ]
  ), [canViewInventory, isAdmin]);

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-muted backdrop-blur-md flex items-center justify-center">
            <span className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin"></span>
          </div>
          <p className="text-muted-foreground text-sm tracking-wide uppercase">Checking permissions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/20 bg-white/70 backdrop-blur-md shadow-layer-sm dark:bg-slate-900/70">
        <div className="mx-auto flex w-full max-w-7xl flex-col px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center">
                <span className="text-accent font-semibold">D</span>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Duriyam Operate</p>
                <h1 className="text-fluid-lg font-semibold">Operations Control Surface</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {availableBranches.length > 0 && (
                <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/40 bg-white/70 px-4 py-2 text-xs shadow-sm backdrop-blur-md">
                  <span className="font-medium text-muted-foreground uppercase tracking-[0.18em]">Branch</span>
                  <select
                    value={currentBranch?.id || ""}
                    onChange={(event) => selectBranch(event.target.value)}
                    className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
                  >
                    {availableBranches.map((branch) => (
                      <option key={branch.id} value={branch.branch_id}>
                        {branch.branch_name || "Unnamed"}
                        {branch.organization_name ? ` • ${branch.organization_name}` : ""}
                      </option>
                    ))}
                  </select>
                  {branchLoading && (
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden="true"></span>
                  )}
                </div>
              )}
              <button
                onClick={() => setCommandOpen(true)}
                className="hidden sm:flex items-center gap-2 rounded-full border border-white/40 bg-white/70 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-md transition hover:border-accent/50 hover:text-foreground"
              >
                <span>Quick Command</span>
                <code className="rounded-md bg-muted/40 px-2 py-1 text-xs uppercase tracking-wider">Ctrl + K</code>
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {navigationItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`group flex items-center gap-3 rounded-full px-4 py-2 text-sm transition-all duration-200 ease-out-soft ${
                    isActive
                      ? "bg-accent text-accent-foreground shadow-layer-sm"
                      : "bg-white/60 text-muted-foreground shadow-sm hover:bg-white/80"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className={`hidden sm:inline text-xs ${isActive ? "text-accent-foreground/70" : "text-muted-foreground/70"}`}>
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="mx-auto w-full max-w-7xl px-6 py-10"
          >
            {currentView === "ah-balancer" && <App />}
            {currentView === "inventory" && <InventoryManagement />}
            {currentView === "accounting" && <AccountingDashboard />}
            {currentView === "admin" && isAdmin ? (
              <AdminPanel />
            ) : currentView === "admin" && !isAdmin ? (
              <App />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

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
    </div>
  );
}

export default MainApp;
