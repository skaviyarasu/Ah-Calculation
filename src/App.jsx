import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { db, auth, supabase, rbac } from "./lib/supabase";
import { useRole } from "./hooks/useRole";

/**
 * Ah Balancer — Interactive 13SxP Optimizer (React)
 *
 * Bugfix release:
 * - Fixed: unterminated string constants in CSV/TSV joins (now uses "\n" and "\t").
 * - Fixed: duplicate/stray code blocks outside functions causing syntax errors.
 * - Fixed: ensured all export utilities live inside functions.
 * - Kept: export controls above the table; copy CSV/TSV helpers; Excel export via xlsx.
 */

// ---------- Utilities ----------
const CELL_SEPARATOR = /\s*\|\s*|\s*@\s*|\s*\/\s*|\s*:\s*/;

function makeEmptyCell() {
  return { ah: NaN, v: NaN };
}

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const normalized = String(value).trim().replace(/,/g, ".");
  if (!normalized) return NaN;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeCell(cell) {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return {
      ah: normalizeNumber(cell.ah),
      v: normalizeNumber(cell.v),
    };
  }
  const ah = normalizeNumber(cell);
  return { ah, v: NaN };
}

function createEmptyGrid(S, P) {
  return Array.from({ length: S }, () => Array.from({ length: P }, () => makeEmptyCell()));
}

function parseCellToken(token) {
  const raw = String(token ?? "").trim();
  if (!raw) return makeEmptyCell();
  const parts = raw.split(CELL_SEPARATOR);
  if (parts.length >= 2) {
    return {
      ah: normalizeNumber(parts[0]),
      v: normalizeNumber(parts[1]),
    };
  }
  return { ah: normalizeNumber(raw), v: NaN };
}

function parseCSV(text) {
  const rows = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter((row) => row.trim() !== "");

  return rows.map((row) =>
    row
      .split(/[\t,;]+|,\s*|\s{2,}/)
      .filter((token) => token !== "")
      .map(parseCellToken)
  );
}

function formatCellValue(cell) {
  const ah = isFiniteNumber(cell?.ah) ? cell.ah : "";
  const voltage = isFiniteNumber(cell?.v) ? cell.v : "";
  if (voltage === "") return `${ah}`;
  if (ah === "") return `|${voltage}`;
  return `${ah}|${voltage}`;
}

function generateDemoRow(length) {
  return Array.from({ length }, () => ({
    ah: Math.round(4350 + Math.random() * 200),
    v: Number((3.25 + Math.random() * 0.2).toFixed(3)),
  }));
}

function sumAH(row) {
  return row.reduce((acc, cell) => acc + (isFiniteNumber(cell?.ah) ? cell.ah : 0), 0);
}

function sumVoltage(row) {
  return row.reduce((acc, cell) => acc + (isFiniteNumber(cell?.v) ? cell.v : 0), 0);
}

function averageVoltage(row) {
  let total = 0;
  let count = 0;
  row.forEach((cell) => {
    if (isFiniteNumber(cell?.v)) {
      total += cell.v;
      count += 1;
    }
  });
  return count ? total / count : NaN;
}

function evaluateBestSingleSwap(grid) {
  const S = grid.length; if (!S) return null;
  const P = grid[0]?.length ?? 0; if (!P) return null;

  const totals = grid.map((row) => sumAH(row));
  let rMax = 0, rMin = 0;
  totals.forEach((t, i) => {
    if (t > totals[rMax]) rMax = i;
    if (t < totals[rMin]) rMin = i;
  });
  const beforeSpread = totals[rMax] - totals[rMin];
  if (!isFinite(beforeSpread)) return null;

  let best = null;
  for (let a = 0; a < P; a++) {
    for (let b = 0; b < P; b++) {
      const cellFromMax = grid[rMax][a];
      const cellFromMin = grid[rMin][b];
      const ahFromMax = isFiniteNumber(cellFromMax?.ah) ? cellFromMax.ah : NaN;
      const ahFromMin = isFiniteNumber(cellFromMin?.ah) ? cellFromMin.ah : NaN;
      const vFromMax = isFiniteNumber(cellFromMax?.v) ? cellFromMax.v : NaN;
      const vFromMin = isFiniteNumber(cellFromMin?.v) ? cellFromMin.v : NaN;

      if (!isFiniteNumber(ahFromMax) || !isFiniteNumber(ahFromMin)) continue;
      if (
        a === b &&
        Math.abs(ahFromMax - ahFromMin) < 1e-9 &&
        Math.abs((isFiniteNumber(vFromMax) ? vFromMax : 0) - (isFiniteNumber(vFromMin) ? vFromMin : 0)) < 1e-9
      ) continue;

      const newTotals = totals.slice();
      newTotals[rMax] = totals[rMax] - (isFiniteNumber(ahFromMax) ? ahFromMax : 0) + (isFiniteNumber(ahFromMin) ? ahFromMin : 0);
      newTotals[rMin] = totals[rMin] - (isFiniteNumber(ahFromMin) ? ahFromMin : 0) + (isFiniteNumber(ahFromMax) ? ahFromMax : 0);
      let maxT = -Infinity, minT = Infinity;
      for (let i = 0; i < S; i++) {
        if (newTotals[i] > maxT) maxT = newTotals[i];
        if (newTotals[i] < minT) minT = newTotals[i];
      }
      const newSpread = maxT - minT;
      const improvement = beforeSpread - newSpread;
      const candidate = {
        rMax,
        rMin,
        cFromMax: a,
        cFromMin: b,
        valueFromMax: cellFromMax,
        valueFromMin: cellFromMin,
        beforeSpread,
        afterSpread: newSpread,
        improvement,
      };
      if (!best) best = candidate; else {
        const s1 = [candidate.improvement, -candidate.afterSpread, -Math.abs(newTotals[rMax] - newTotals[rMin])];
        const baseBestMax = totals[rMax]
          - (isFiniteNumber(best.valueFromMax?.ah) ? best.valueFromMax.ah : 0)
          + (isFiniteNumber(best.valueFromMin?.ah) ? best.valueFromMin.ah : 0);
        const baseBestMin = totals[rMin]
          - (isFiniteNumber(best.valueFromMin?.ah) ? best.valueFromMin.ah : 0)
          + (isFiniteNumber(best.valueFromMax?.ah) ? best.valueFromMax.ah : 0);
        const s2 = [best.improvement, -best.afterSpread, -Math.abs(baseBestMax - baseBestMin)];
        if (s1[0] > s2[0] || (s1[0] === s2[0] && (s1[1] > s2[1] || (s1[1] === s2[1] && s1[2] > s2[2])))) best = candidate;
      }
    }
  }
  return best;
}

function applySwap(grid, swap) {
  const out = grid.map((row) => row.map((cell) => ({ ...cell })));
  const tmp = out[swap.rMax][swap.cFromMax];
  out[swap.rMax][swap.cFromMax] = out[swap.rMin][swap.cFromMin];
  out[swap.rMin][swap.cFromMin] = tmp;
  return out;
}

// Build the current visible table as an array-of-arrays
function buildTableAOA(grid, S, P, stats, metadata = null) {
  const totalsAH = stats?.totalsAH ?? [];
  const totalsVoltage = stats?.totalsVoltage ?? [];
  const averageVoltages = stats?.averageVoltages ?? [];
  const aoa = [];
  
  // Add metadata header if provided
  if (metadata) {
    aoa.push(["AH Balancer - Battery Optimization Report"]);
    aoa.push([""]);
    aoa.push(["Serial Number:", metadata.serialNumber || ""]);
    aoa.push(["Customer:", metadata.customerName || ""]);
    aoa.push(["Job Card #:", metadata.jobCard || ""]);
    aoa.push(["Date:", metadata.jobDate || ""]);
    aoa.push(["Battery Spec:", metadata.batterySpec || ""]);
    aoa.push([""]);
    aoa.push(["Capacity Matrix (mAh):"]);
    aoa.push([""]);
  }
  
  // Add table header
  const header = [
    "Series/Parallel",
    ...Array.from({ length: P }, (_, j) => `P${j + 1}`),
    "Total AH",
    "Avg V",
    "Total V",
  ];
  aoa.push(header);
  
  // Add data rows
  for (let i = 0; i < S; i++) {
    const row = [`S${i + 1}`];
    for (let j = 0; j < P; j++) {
      row.push(formatCellValue(grid[i]?.[j]));
    }
    row.push(isFiniteNumber(totalsAH[i]) ? Math.round(totalsAH[i]) : "");
    row.push(isFiniteNumber(averageVoltages[i]) ? averageVoltages[i].toFixed(3) : "");
    row.push(isFiniteNumber(totalsVoltage[i]) ? totalsVoltage[i].toFixed(3) : "");
    aoa.push(row);
  }
  return aoa;
}

// ---------- React Component ----------
export default function App() {
  const [S, setS] = useState(13);
  const [P, setP] = useState(7);
  const [tolerance, setTolerance] = useState(20); // mAh
  const [grid, setGrid] = useState(() => createEmptyGrid(13, 7));
  const tableRef = useRef(null);

  // Role-based access control
  const { userRole, isAdmin, loading: roleLoading, hasPermission, currentUserId } = useRole();

  // Job/Customer metadata
  const [customerName, setCustomerName] = useState("");
  const [jobCard, setJobCard] = useState("");
  const [jobDate, setJobDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [batterySpec, setBatterySpec] = useState("");
  const [serialNumber, setSerialNumber] = useState("");

  // Database state
  const [currentJobId, setCurrentJobId] = useState(null);
  const [savedJobs, setSavedJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Workflow state
  const [currentJobStatus, setCurrentJobStatus] = useState('draft'); // draft, pending_review, needs_modification, approved, rejected
  const [verificationNotes, setVerificationNotes] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [isVerifier, setIsVerifier] = useState(false);
  const [verificationNotesInput, setVerificationNotesInput] = useState("");

  // Ensure grid matches SxP
  useEffect(() => {
    setGrid((prev) =>
      Array.from({ length: S }, (_, i) =>
        Array.from({ length: P }, (_, j) => normalizeCell(prev[i]?.[j]))
      )
    );
  }, [S, P]);

  // Load user's saved jobs on mount and check roles
  useEffect(() => {
    loadSavedJobs();
    checkUserRoles();
  }, []);

  // Check user roles (creator/verifier)
  async function checkUserRoles() {
    if (!currentUserId) return;
    try {
      const creator = await rbac.isCreator(currentUserId);
      const verifier = await rbac.isVerifier(currentUserId);
      setIsCreator(creator);
      setIsVerifier(verifier);
    } catch (error) {
      console.error('Error checking roles:', error);
    }
  }

  // Close search results when clicking outside (industry-standard UX)
  useEffect(() => {
    const handleClickOutside = (event) => {
      const searchContainer = document.getElementById('search-container');
      if (searchContainer && !searchContainer.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearchResults]);

  async function loadSavedJobs() {
    setLoading(true);
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if user has permission to view all jobs (admin) or own jobs
      let jobs;
      if (isAdmin && await hasPermission('view_all_jobs', 'jobs')) {
        // Admin can view all jobs
        const { data, error } = await supabase
          .from('battery_optimization_jobs')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        jobs = data;
      } else {
        // Regular user can only view own jobs
        jobs = await db.getUserJobs(user.id);
      }
      
      setSavedJobs(jobs || []);
      
      if (jobs && jobs.length > 0) {
        console.log(`Retrieved ${jobs.length} saved job(s) from database`);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
      alert('Failed to retrieve saved jobs: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  async function saveJob() {
    const user = await auth.getCurrentUser();
    if (!user) {
      alert('Please login to save jobs');
      return;
    }

    // Check permission to create/edit jobs
    let canEdit = false;
    if (currentJobId) {
      // Editing existing job - check if admin can edit all or user can edit own
      if (isAdmin && await hasPermission('edit_all_jobs', 'jobs')) {
        canEdit = true;
      } else {
        // Check if user owns this job
        const job = savedJobs.find(j => j.id === currentJobId);
        if (job && job.user_id === user.id && await hasPermission('edit_own_jobs', 'jobs')) {
          canEdit = true;
        }
      }
    } else {
      // Creating new job
      canEdit = await hasPermission('create_jobs', 'jobs');
    }
    
    if (!canEdit) {
      alert('You do not have permission to save jobs. Please contact an administrator.');
      return;
    }

    if (!customerName.trim() && !jobCard.trim()) {
      alert('Please enter at least Customer Name or Job Card number before saving');
      return;
    }

    setSaving(true);
    try {
      // Generate serial number if creating new job and not provided
      let finalSerialNumber = serialNumber.trim();
      if (!currentJobId && !finalSerialNumber) {
        // Get count of existing jobs to generate next serial number
        const existingJobs = await db.getUserJobs(user.id);
        finalSerialNumber = db.generateSerialNumber(existingJobs.length + 1);
        setSerialNumber(finalSerialNumber);
      }

      const jobData = {
        user_id: user.id,
        serial_number: finalSerialNumber || null,
        customer_name: customerName || null,
        job_card: jobCard || null,
        job_date: jobDate || null,
        battery_spec: batterySpec || null,
        series_count: S,
        parallel_count: P,
        tolerance: tolerance,
        status: currentJobId ? currentJobStatus : 'draft' // Keep existing status or default to draft
      };

      let job;
      if (currentJobId) {
        // Update existing job (preserve serial number if not changed)
        if (!finalSerialNumber) {
          // Keep existing serial number if not provided
          const existingJobs = await db.getUserJobs(user.id);
          const existingJob = existingJobs.find(j => j.id === currentJobId);
          if (existingJob?.serial_number) {
            jobData.serial_number = existingJob.serial_number;
          }
        }
        await db.updateJob(currentJobId, jobData);
        job = { id: currentJobId, ...jobData };
      } else {
        // Create new job
        job = await db.createJob(jobData);
        setCurrentJobId(job.id);
        setSerialNumber(job.serial_number || finalSerialNumber); // Update UI with generated serial
      }

      // Save cell data
      await db.saveCellData(job.id, grid);

      // Refresh jobs list
      await loadSavedJobs();
      
      alert(currentJobId ? 'Job updated successfully!' : 'Job saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save job: ' + (error.message || 'Unknown error'));
    }
    setSaving(false);
  }

  async function loadJob(jobId) {
    setLoading(true);
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        alert('Please login to load jobs');
        return;
      }

      const jobs = await db.getUserJobs(user.id);
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        alert('Job not found');
        return;
      }

      // Load job metadata
      setSerialNumber(job.serial_number || "");
      setCustomerName(job.customer_name || "");
      setJobCard(job.job_card || "");
      setJobDate(job.job_date || new Date().toISOString().split('T')[0]);
      setBatterySpec(job.battery_spec || "");
      setS(job.series_count || 13);
      setP(job.parallel_count || 7);
      setTolerance(job.tolerance || 20);
      
      // Load workflow status
      setCurrentJobStatus(job.status || 'draft');
      setVerificationNotes(job.verification_notes || "");
      setVerificationNotesInput("");

      // Load cell data
      const cellData = await db.getCellData(jobId);
      
      // Reconstruct grid from cell data
      const newGrid = Array.from({ length: job.series_count || 13 }, () => 
        Array.from({ length: job.parallel_count || 7 }, () => makeEmptyCell())
      );
      
      cellData.forEach(cell => {
        if (newGrid[cell.series_index] && newGrid[cell.series_index][cell.parallel_index] !== undefined) {
          const ahValue = normalizeNumber(cell.capacity_mah);
          const voltageValue = normalizeNumber(cell.voltage);
          newGrid[cell.series_index][cell.parallel_index] = {
            ah: isFiniteNumber(ahValue) ? ahValue : NaN,
            v: isFiniteNumber(voltageValue) ? voltageValue : NaN,
          };
        }
      });

      setGrid(newGrid);
      setCurrentJobId(jobId);
      setSearchQuery(""); // Clear search after loading
      setShowSearchResults(false);
      alert('Job loaded successfully!');
    } catch (error) {
      console.error('Load error:', error);
      alert('Failed to load job: ' + (error.message || 'Unknown error'));
    }
    setLoading(false);
  }

  async function deleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      // Check permission to delete jobs
      const canDelete = isAdmin && await hasPermission('delete_all_jobs', 'jobs')
        ? true
        : await hasPermission('delete_own_jobs', 'jobs');
      
      if (!canDelete) {
        alert('You do not have permission to delete jobs. Please contact an administrator.');
        return;
      }

      await db.deleteJob(jobId);
      if (currentJobId === jobId) {
        setCurrentJobId(null);
        // Clear current form
        setCustomerName("");
        setJobCard("");
        setJobDate(new Date().toISOString().split('T')[0]);
        setBatterySpec("");
        setGrid(createEmptyGrid(S, P));
      }
      await loadSavedJobs();
      alert('Job deleted successfully!');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete job: ' + (error.message || 'Unknown error'));
    }
  }

  function newJob() {
    if (confirm('Create a new job? Current unsaved changes will be lost.')) {
      setCurrentJobId(null);
      setSerialNumber(""); // Will be auto-generated on save
      setCustomerName("");
      setJobCard("");
      setJobDate(new Date().toISOString().split('T')[0]);
      setBatterySpec("");
      setGrid(createEmptyGrid(S, P));
      setCurrentJobStatus('draft');
      setVerificationNotes("");
      setVerificationNotesInput("");
    }
  }

  // Workflow functions
  async function submitForReview() {
    if (!currentJobId) {
      alert('Please save the job first before submitting for review');
      return;
    }

    if (currentJobStatus !== 'draft' && currentJobStatus !== 'needs_modification') {
      alert('Job must be in draft or needs_modification status to submit for review');
      return;
    }

    try {
      await db.submitJobForReview(currentJobId);
      setCurrentJobStatus('pending_review');
      await loadSavedJobs();
      alert('Job submitted for review successfully!');
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to submit for review: ' + (error.message || 'Unknown error'));
    }
  }

  async function verifyJob(status) {
    if (!currentJobId) return;
    
    try {
      await db.verifyJob(currentJobId, status, verificationNotesInput);
      setCurrentJobStatus(status);
      setVerificationNotes(verificationNotesInput);
      setVerificationNotesInput("");
      await loadSavedJobs();
      alert(`Job ${status === 'approved' ? 'approved' : 'rejected'} successfully!`);
    } catch (error) {
      console.error('Verify error:', error);
      alert('Failed to verify job: ' + (error.message || 'Unknown error'));
    }
  }

  async function requestModification() {
    if (!currentJobId) return;
    
    if (!verificationNotesInput.trim()) {
      alert('Please provide notes explaining what modifications are needed');
      return;
    }

    try {
      await db.requestModification(currentJobId, verificationNotesInput);
      setCurrentJobStatus('needs_modification');
      setVerificationNotes(verificationNotesInput);
      setVerificationNotesInput("");
      await loadSavedJobs();
      alert('Modification requested successfully! The creator will be notified.');
    } catch (error) {
      console.error('Request modification error:', error);
      alert('Failed to request modification: ' + (error.message || 'Unknown error'));
    }
  }

  // Check if job is editable (only in draft or needs_modification for creators)
  const isEditable = useMemo(() => {
    if (isAdmin) return true; // Admins can always edit
    if (!currentJobId) return true; // New jobs are always editable
    if (!isCreator && !isAdmin) return false; // Non-creators can't edit
    
    // Creators can only edit in draft or needs_modification
    return currentJobStatus === 'draft' || currentJobStatus === 'needs_modification';
  }, [currentJobId, currentJobStatus, isCreator, isAdmin]);

  const totalsAH = useMemo(() => grid.map((row) => sumAH(row)), [grid]);
  const totalsVoltage = useMemo(() => grid.map((row) => sumVoltage(row)), [grid]);
  const averageVoltages = useMemo(() => grid.map((row) => averageVoltage(row)), [grid]);

  const rMax = useMemo(() => totalsAH.reduce((a, t, i) => (t > totalsAH[a] ? i : a), 0), [totalsAH]);
  const rMin = useMemo(() => totalsAH.reduce((a, t, i) => (t < totalsAH[a] ? i : a), 0), [totalsAH]);
  const spread = useMemo(() => (totalsAH[rMax] ?? 0) - (totalsAH[rMin] ?? 0), [totalsAH, rMax, rMin]);

  const rowVoltageExtremes = useMemo(() => {
    let max = { value: -Infinity, series: null };
    let min = { value: Infinity, series: null };

    averageVoltages.forEach((avg, idx) => {
      if (isFiniteNumber(avg)) {
        if (avg > max.value) max = { value: avg, series: idx };
        if (avg < min.value) min = { value: avg, series: idx };
      }
    });

    const diff =
      isFiniteNumber(max.value) && isFiniteNumber(min.value)
        ? max.value - min.value
        : NaN;

    return { max, min, diff };
  }, [averageVoltages]);

  const cellVoltageExtremes = useMemo(() => {
    let max = { value: -Infinity, series: null, parallel: null };
    let min = { value: Infinity, series: null, parallel: null };

    grid.forEach((row, i) => {
      row.forEach((cell, j) => {
        if (isFiniteNumber(cell?.v)) {
          if (cell.v > max.value) max = { value: cell.v, series: i, parallel: j };
          if (cell.v < min.value) min = { value: cell.v, series: i, parallel: j };
        }
      });
    });

    const diff =
      isFiniteNumber(max.value) && isFiniteNumber(min.value)
        ? max.value - min.value
        : NaN;

    return { max, min, diff };
  }, [grid]);

  const suggestion = useMemo(() => evaluateBestSingleSwap(grid), [grid]);

  const statusLabelMap = {
    draft: "Draft",
    pending_review: "Pending Review",
    needs_modification: "Needs Modification",
    approved: "Approved",
    rejected: "Rejected"
  };

  const statusClassMap = {
    draft: "metric-chip bg-muted text-muted-foreground",
    pending_review: "status-chip-warning",
    needs_modification: "status-chip-warning",
    approved: "status-chip-success",
    rejected: "status-chip-danger"
  };

  const statusChip = currentJobId
    ? (
        <span className={`${statusClassMap[currentJobStatus] ?? "metric-chip bg-muted text-muted-foreground"}`}>
          {statusLabelMap[currentJobStatus] ?? "Draft"}
        </span>
      )
    : (
        <span className="metric-chip bg-muted text-muted-foreground">New Draft</span>
      );

  const baseInputClass = "w-full rounded-xl border border-white/40 bg-white/70 px-4 py-2.5 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent";
  const disabledInputClass = "pointer-events-none opacity-60";
  const cellInputClass = "w-full rounded-xl border border-white/40 bg-white/85 px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-1 focus:ring-accent/30";
  const disabledCellClass = "pointer-events-none opacity-60";
  const buttonClasses = {
    primary: "rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold shadow-layer-sm transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40",
    secondary: "rounded-full border border-white/40 bg-white/70 px-5 py-2.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-accent/40 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20",
    subtle: "rounded-full bg-muted px-5 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/10",
    danger: "rounded-full bg-danger text-danger-foreground px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-danger/80 focus:outline-none focus:ring-2 focus:ring-danger/40",
    warning: "rounded-full bg-warning text-warning-foreground px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-warning/75 focus:outline-none focus:ring-2 focus:ring-warning/40"
  };
  const disabledButtonClass = "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none";

  // Filter saved jobs based on search query (industry-standard multi-field search)
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return savedJobs;
    
    const query = searchQuery.toLowerCase().trim();
    return savedJobs.filter((job) => {
      // Search across multiple fields including serial number
      const serialNumber = (job.serial_number || '').toLowerCase();
      const jobCard = (job.job_card || '').toLowerCase();
      const customerName = (job.customer_name || '').toLowerCase();
      const batterySpec = (job.battery_spec || '').toLowerCase();
      const jobId = job.id.toLowerCase();
      const dateStr = job.job_date ? new Date(job.job_date).toLocaleDateString().toLowerCase() : '';
      const createdDate = job.created_at ? new Date(job.created_at).toLocaleDateString().toLowerCase() : '';
      
      return (
        serialNumber.includes(query) ||
        jobCard.includes(query) ||
        customerName.includes(query) ||
        batterySpec.includes(query) ||
        jobId.includes(query) ||
        dateStr.includes(query) ||
        createdDate.includes(query)
      );
    });
  }, [savedJobs, searchQuery]);

  function handleCellChange(seriesIndex, parallelIndex, field, value) {
    if (!isEditable && currentJobId) {
      return; // Prevent editing if job is not editable
    }
    setGrid((prev) => {
      return prev.map((row, i) =>
        row.map((cell, j) => {
          if (i !== seriesIndex || j !== parallelIndex) {
            return normalizeCell(cell);
          }
          const nextCell = normalizeCell(cell);
          const numeric = normalizeNumber(value);
          if (field === "ah") {
            nextCell.ah = isFiniteNumber(numeric) ? numeric : NaN;
          } else if (field === "v") {
            nextCell.v = isFiniteNumber(numeric) ? numeric : NaN;
          }
          return nextCell;
        })
      );
    });
  }

  function exportCSV() {
    try {
      const metadata = { serialNumber, customerName, jobCard, jobDate, batterySpec };
      const aoa = buildTableAOA(grid, S, P, { totalsAH, totalsVoltage, averageVoltages }, metadata);
      const csv = aoa.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `AH_Balancer_${jobCard || 'Job'}_${S}Sx${P}P.csv`;
    a.href = url;
      a.download = filename;
      document.body.appendChild(a);
    a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      console.error(e);
      alert("CSV export failed. Please check browser download permissions.");
    }
  }

  function copyTableCSV() {
    const metadata = { serialNumber, customerName, jobCard, jobDate, batterySpec };
    const aoa = buildTableAOA(grid, S, P, { totalsAH, totalsVoltage, averageVoltages }, metadata);
    const text = aoa.map((row) => row.join(",")).join("\n");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => alert("Table copied as CSV."));
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); alert("Table copied as CSV.");
    }
  }

  function copyTableTSV() {
    const metadata = { serialNumber, customerName, jobCard, jobDate, batterySpec };
    const aoa = buildTableAOA(grid, S, P, { totalsAH, totalsVoltage, averageVoltages }, metadata);
    const text = aoa.map((row) => row.join("\t")).join("\n");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => alert("Table copied as TSV."));
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); alert("Table copied as TSV.");
    }
  }

  function exportXLSX() {
    try {
      // Always use grid data for accurate values (DOM table can't read input values properly)
      const metadata = { serialNumber, customerName, jobCard, jobDate, batterySpec };
      const aoa = buildTableAOA(grid, S, P, { totalsAH, totalsVoltage, averageVoltages }, metadata);
      const wsBefore = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsBefore, "Report");

      // Summary sheet with enhanced statistics
      const rMx = totalsAH.reduce((a, t, i) => (t > totalsAH[a] ? i : a), 0);
      const rMn = totalsAH.reduce((a, t, i) => (t < totalsAH[a] ? i : a), 0);
      const spreadVal = (totalsAH[rMx] ?? 0) - (totalsAH[rMn] ?? 0);
      const avgCapacity = totalsAH.length > 0 ? totalsAH.reduce((a, b) => a + b, 0) / totalsAH.length : 0;
      const totalCapacity = totalsAH.reduce((a, b) => a + b, 0);
      
      const wsSummary = XLSX.utils.aoa_to_sheet([
        ["AH Balancer - Job Summary", ""],
        ["Generated", new Date().toLocaleString()],
        ["", ""],
        ["Job Information", ""],
        ["Serial Number", serialNumber || "Not assigned"],
        ["Customer Name", customerName || "Not specified"],
        ["Job Card #", jobCard || "Not specified"],
        ["Job Date", jobDate || "Not specified"],
        ["Battery Specification", batterySpec || "Not specified"],
        ["", ""],
        ["Configuration", ""],
        ["Rows (Series)", S],
        ["Columns (Parallel)", P],
        ["Tolerance (mAh)", tolerance],
        ["", ""],
        ["Analysis Results", ""],
        ["Total Capacity (mAh)", Math.round(totalCapacity)],
        ["Average Row Capacity (mAh)", Math.round(avgCapacity)],
        ["Max Row (S#)", rMx + 1],
        ["Max Row Capacity (mAh)", Math.round(totalsAH[rMx] ?? 0)],
        ["Min Row (S#)", rMn + 1],
        ["Min Row Capacity (mAh)", Math.round(totalsAH[rMn] ?? 0)],
        ["Current Spread (mAh)", Math.round(spreadVal)],
        ["Balance Status", spreadVal <= tolerance ? "✓ Within Tolerance" : "⚠ Needs Optimization"],
        ["", ""],
        ["Voltage Analysis", ""],
        [
          "Max Cell Voltage (V)",
          isFiniteNumber(cellVoltageExtremes.max.value)
            ? cellVoltageExtremes.max.value.toFixed(3)
            : "Not recorded"
        ],
        [
          "Max Voltage Location",
          cellVoltageExtremes.max.series !== null
            ? `S${cellVoltageExtremes.max.series + 1} P${(cellVoltageExtremes.max.parallel ?? 0) + 1}`
            : "Not recorded"
        ],
        [
          "Min Cell Voltage (V)",
          isFiniteNumber(cellVoltageExtremes.min.value)
            ? cellVoltageExtremes.min.value.toFixed(3)
            : "Not recorded"
        ],
        [
          "Min Voltage Location",
          cellVoltageExtremes.min.series !== null
            ? `S${cellVoltageExtremes.min.series + 1} P${(cellVoltageExtremes.min.parallel ?? 0) + 1}`
            : "Not recorded"
        ],
        [
          "Avg V (Max Row)",
          isFiniteNumber(rowVoltageExtremes.max.value)
            ? rowVoltageExtremes.max.value.toFixed(3)
            : "Not recorded"
        ],
        [
          "Max Voltage Row",
          rowVoltageExtremes.max.series !== null
            ? `S${rowVoltageExtremes.max.series + 1}`
            : "Not recorded"
        ],
        [
          "Avg V (Min Row)",
          isFiniteNumber(rowVoltageExtremes.min.value)
            ? rowVoltageExtremes.min.value.toFixed(3)
            : "Not recorded"
        ],
        [
          "Min Voltage Row",
          rowVoltageExtremes.min.series !== null
            ? `S${rowVoltageExtremes.min.series + 1}`
            : "Not recorded"
        ],
        [
          "Voltage Difference (Avg Rows, V)",
          isFiniteNumber(rowVoltageExtremes.diff)
            ? rowVoltageExtremes.diff.toFixed(3)
            : "Not recorded"
        ],
      ]);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      const xblob = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const url = URL.createObjectURL(new Blob([xblob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      const filename = `AH_Balancer_${jobCard || 'Job'}_${S}Sx${P}P.xlsx`;
    a.href = url;
      a.download = filename;
      document.body.appendChild(a);
    a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      console.error(e);
      alert("Excel export failed. Try the Copy buttons to transfer data, or ensure 'xlsx' is installed.");
    }
  }

  function applySuggestedSwap() {
    if (!suggestion) return;
    setGrid((g) => applySwap(g, suggestion));
  }

  function iterateToTolerance() {
    let g = grid;
    let s = evaluateBestSingleSwap(g);
    let guard = 0;
    while (s && s.improvement > 0 && s.afterSpread > tolerance && guard < 200) {
      g = applySwap(g, s);
      s = evaluateBestSingleSwap(g);
      guard++;
    }
    setGrid(g);
  }

  function randomize() {
    setGrid(Array.from({ length: S }, () => generateDemoRow(P)));
  }

  return (
    <div className="space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="panel relative overflow-hidden px-6 py-8 space-y-8"
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-layer-gradient opacity-80" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Job Card</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-fluid-xl font-semibold">AH Balancer · Interactive Optimizer</h2>
              {statusChip}
              {serialNumber && currentJobId && (
                <span className="metric-chip font-mono text-xs uppercase text-muted-foreground">
                  SN · {serialNumber}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Manage manual AH and voltage readings with review workflow, instant analytics, and database persistence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={newJob} className={`${buttonClasses.secondary} ${disabledButtonClass}`}>
              New Job
            </button>
            <button
              onClick={saveJob}
              disabled={saving || (!isEditable && currentJobId)}
              className={`${buttonClasses.primary} ${disabledButtonClass}`}
              title={!isEditable && currentJobId ? "Job is not in editable status. Only draft or needs modification jobs can be edited." : ""}
            >
              {saving ? "Saving…" : currentJobId ? "Update Job" : "Save Job"}
            </button>
            {isCreator && currentJobId && (currentJobStatus === "draft" || currentJobStatus === "needs_modification") && (
              <button
                onClick={submitForReview}
                className={`${buttonClasses.warning} ${disabledButtonClass}`}
              >
                Submit for Review
              </button>
            )}
          </div>
        </div>

        {verificationNotes && (
          <div className="rounded-2xl border border-warning/40 bg-warning/30 px-4 py-3 text-sm text-warning-foreground shadow-sm">
            <p className="font-medium">Verification Notes</p>
            <p className="mt-1 text-xs leading-relaxed text-warning-foreground/80">{verificationNotes}</p>
          </div>
        )}

        {isVerifier && currentJobId && currentJobStatus === "pending_review" && (
          <div className="glass-panel px-5 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Review &amp; Verification</p>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Creator will be notified</span>
            </div>
            <textarea
              value={verificationNotesInput}
              onChange={(event) => setVerificationNotesInput(event.target.value)}
              placeholder="Enter verification notes..."
              className={`${baseInputClass} min-h-[100px] resize-y`}
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => verifyJob('approved')} className={`${buttonClasses.primary} ${disabledButtonClass}`}>
                Approve
              </button>
              <button onClick={() => verifyJob('rejected')} className={`${buttonClasses.danger} ${disabledButtonClass}`}>
                Reject
              </button>
              <button
                onClick={requestModification}
                className={`${buttonClasses.warning} ${disabledButtonClass}`}
                disabled={!verificationNotesInput.trim()}
              >
                Request Modification
              </button>
            </div>
          </div>
        )}

        {!isEditable && currentJobId && (
          <div className="rounded-2xl border border-muted/30 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Read-only</p>
            <p className="mt-1 text-xs leading-relaxed">
              This job cannot be edited in the current status.
              {currentJobStatus === 'pending_review' && ' It is awaiting verification.'}
              {currentJobStatus === 'approved' && ' It has been approved.'}
              {currentJobStatus === 'rejected' && ' It has been rejected.'}
              {currentJobStatus === 'needs_modification' && isCreator && ' Apply the requested changes, then resubmit.'}
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Serial Number <span className="font-normal text-muted-foreground/70">(Tracking ID)</span>
                </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value.toUpperCase())}
              disabled={!isEditable && currentJobId}
              className={`${baseInputClass} font-mono ${!isEditable && currentJobId ? disabledInputClass : ""}`}
              placeholder="AH-YYYYMMDD-XXXX"
              title={currentJobId ? "Edit serial number for tracking" : "Auto-generated on save"}
            />
            {!currentJobId && (
              <p className="text-[11px] text-muted-foreground/70">Auto-generated when you save.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              disabled={!isEditable && currentJobId}
              className={`${baseInputClass} ${!isEditable && currentJobId ? disabledInputClass : ""}`}
              placeholder="Enter customer name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Job Card #</label>
            <input
              type="text"
              value={jobCard}
              onChange={(event) => setJobCard(event.target.value)}
              disabled={!isEditable && currentJobId}
              className={`${baseInputClass} ${!isEditable && currentJobId ? disabledInputClass : ""}`}
              placeholder="Enter job card number"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Date</label>
            <input
              type="date"
              value={jobDate}
              onChange={(event) => setJobDate(event.target.value)}
              disabled={!isEditable && currentJobId}
              className={`${baseInputClass} ${!isEditable && currentJobId ? disabledInputClass : ""}`}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-1 space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Battery Specification</label>
            <input
              type="text"
              value={batterySpec}
              onChange={(event) => setBatterySpec(event.target.value)}
              disabled={!isEditable && currentJobId}
              className={`${baseInputClass} ${!isEditable && currentJobId ? disabledInputClass : ""}`}
              placeholder="e.g., 48V 100Ah LiFePO4"
            />
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="panel px-6 py-6 space-y-6"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Series (S)</label>
                <input
                  type="number"
              min={1}
              value={S}
              onChange={(event) => setS(Number(event.target.value) || 1)}
              className={baseInputClass}
                />
              </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Parallel (P)</label>
                <input
                  type="number"
              min={1}
              value={P}
              onChange={(event) => setP(Number(event.target.value) || 1)}
              className={baseInputClass}
                />
              </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Tolerance (mAh)</label>
            <input
              type="number"
              min={0}
              value={tolerance}
              onChange={(event) => setTolerance(Number(event.target.value) || 0)}
              className={baseInputClass}
            />
            </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="metric-chip w-full items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">AH Spread</span>
            <span className="text-base font-semibold text-foreground">{Number.isFinite(spread) ? Math.round(spread) : "—"} mAh</span>
          </div>
          <div className="metric-chip w-full items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Row Extremes</span>
            <span className="text-base font-semibold text-foreground">Max S{rMax + 1} · Min S{rMin + 1}</span>
          </div>
          <div className="metric-chip w-full items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Avg V (Max | Min)</span>
            <span className="text-base font-semibold text-foreground">
              {isFiniteNumber(averageVoltages[rMax]) ? averageVoltages[rMax].toFixed(3) : "—"}
              <span className="text-muted-foreground/70"> | </span>
              {isFiniteNumber(averageVoltages[rMin]) ? averageVoltages[rMin].toFixed(3) : "—"}
            </span>
          </div>
          <div className="metric-chip w-full items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Voltage Difference</span>
            <span className="text-base font-semibold text-foreground">
              {isFiniteNumber(rowVoltageExtremes.max.value) && isFiniteNumber(rowVoltageExtremes.min.value)
                ? (rowVoltageExtremes.max.value - rowVoltageExtremes.min.value).toFixed(3)
                : "—"} V
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="metric-chip w-full flex-col items-start gap-1 text-left">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Max Cell Voltage</span>
            <span className="text-base font-semibold text-foreground">
              {isFiniteNumber(cellVoltageExtremes.max.value) ? cellVoltageExtremes.max.value.toFixed(3) : "—"} V
            </span>
            {cellVoltageExtremes.max.series !== null && (
              <span className="text-xs text-muted-foreground">S{cellVoltageExtremes.max.series + 1} · P{(cellVoltageExtremes.max.parallel ?? 0) + 1}</span>
            )}
          </div>
          <div className="metric-chip w-full flex-col items-start gap-1 text-left">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Min Cell Voltage</span>
            <span className="text-base font-semibold text-foreground">
              {isFiniteNumber(cellVoltageExtremes.min.value) ? cellVoltageExtremes.min.value.toFixed(3) : "—"} V
            </span>
            {cellVoltageExtremes.min.series !== null && (
              <span className="text-xs text-muted-foreground">S{cellVoltageExtremes.min.series + 1} · P{(cellVoltageExtremes.min.parallel ?? 0) + 1}</span>
            )}
          </div>
        </div>

        <div className="glass-panel px-5 py-5 space-y-3">
          {suggestion ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Suggested swap available</p>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Improvement ready</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Swap <span className="font-semibold text-foreground">S{suggestion.rMax + 1}:P{suggestion.cFromMax + 1}</span> with <span className="font-semibold text-foreground">S{suggestion.rMin + 1}:P{suggestion.cFromMin + 1}</span> to reduce spread.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Improvement: <b>{Math.round(suggestion.improvement)} mAh</b></span>
                <span>After Spread: <b>{Math.round(suggestion.afterSpread)} mAh</b></span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={applySuggestedSwap} className={`${buttonClasses.primary} ${disabledButtonClass}`}>
                  Apply Suggested Swap
              </button>
                <button onClick={iterateToTolerance} className={`${buttonClasses.warning} ${disabledButtonClass}`}>
                  Iterate to Tolerance
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Enter more readings to generate swap recommendations and spread optimisation.</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-4 text-sm text-muted-foreground shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Enter AH and voltage values directly in the matrix. Each cell captures both measurements—no file import required.</p>
            <button onClick={randomize} className={`${buttonClasses.secondary} ${disabledButtonClass}`}>
              Generate Demo Data
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="panel px-6 py-6 space-y-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div id="search-container" className="flex-1 space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Search Saved Jobs</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder="Search by job card, customer name, date, or ID..."
                className={`${baseInputClass} pl-11`}
              />
              {searchQuery && (
              <button
                  onClick={() => {
                    setSearchQuery("");
                    setShowSearchResults(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>
              )}
            </div>

            {showSearchResults && searchQuery.trim() && (
              <div className="absolute z-50 mt-2 w-full max-w-[calc(100%-3rem)] rounded-2xl border border-white/30 bg-white/95 shadow-layer-md backdrop-blur-md">
                {filteredJobs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No jobs found matching "{searchQuery}".
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto py-2">
                    {filteredJobs.map((job) => (
              <button
                        key={job.id}
                        onClick={() => {
                          loadJob(job.id);
                          setSearchQuery("");
                          setShowSearchResults(false);
                        }}
                        className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-muted/50"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {job.serial_number && <span className="font-mono text-accent/80 mr-2">{job.serial_number}</span>}
                          {job.job_card || job.customer_name || 'Unnamed Job'}
                          {currentJobId === job.id && <span className="ml-2 text-xs text-accent">Current</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {job.customer_name && `${job.customer_name} · `}
                          {job.job_date && `Date ${new Date(job.job_date).toLocaleDateString()} · `}
                          {job.serial_number || job.id.substring(0, 8)}
                        </span>
              </button>
                    ))}
            </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-transparent">Actions</span>
            <button
              onClick={loadSavedJobs}
              disabled={loading}
              className={`${buttonClasses.secondary} ${disabledButtonClass}`}
              title="Retrieve all saved jobs from the database"
            >
              <span className="flex items-center gap-2">
                <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={loading ? "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4-4 4m0 0-4-4m4 4V4"}
                  />
                </svg>
                {loading ? "Retrieving…" : "Refresh List"}
              </span>
            </button>
              </div>
              </div>

        {searchQuery.trim() && (
          <div className="text-sm text-muted-foreground">
            Found {filteredJobs.length} of {savedJobs.length} saved {savedJobs.length === 1 ? "job" : "jobs"}.
              </div>
        )}

        {!searchQuery.trim() && savedJobs.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Quick Load</label>
            <select
              onChange={(event) => {
                if (event.target.value) {
                  loadJob(event.target.value);
                  event.target.value = "";
                }
              }}
              className={`${baseInputClass} max-w-xs`}
              defaultValue=""
            >
              <option value="">Select a job…</option>
              {savedJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.serial_number ? `[${job.serial_number}] ` : ""}
                  {job.job_card || job.customer_name || 'Unnamed Job'} — {new Date(job.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
              </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="panel px-6 py-6 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={copyTableTSV} className={`${buttonClasses.secondary} ${disabledButtonClass}`}>
            Copy Table TSV
          </button>
          <button onClick={copyTableCSV} className={`${buttonClasses.secondary} ${disabledButtonClass}`}>
            Copy Table CSV
          </button>
          <button onClick={exportCSV} className={`${buttonClasses.secondary} ${disabledButtonClass}`}>
            Export Table CSV
          </button>
          <button onClick={exportXLSX} className={`${buttonClasses.primary} ${disabledButtonClass}`}>
            Export Table Excel
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/60 shadow-layer-sm backdrop-blur-md">
          <table ref={tableRef} className="w-full text-sm">
            <thead className="bg-white/70 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 px-4 py-3 text-left font-semibold text-muted-foreground">Series\\Parallel</th>
                {Array.from({ length: P }).map((_, j) => (
                  <th key={j} className="px-4 py-3 text-left font-semibold">P{j + 1}</th>
                ))}
                <th className="px-4 py-3 text-left font-semibold">Total AH</th>
                <th className="px-4 py-3 text-left font-semibold">Avg V</th>
                <th className="px-4 py-3 text-left font-semibold">Total V</th>
                  </tr>
                </thead>
            <tbody className="divide-y divide-white/20">
              {grid.map((row, i) => {
                const isMax = i === rMax;
                const isMin = i === rMin;
                const rowBackgroundClass = isMax
                  ? "bg-danger/15"
                  : isMin
                  ? "bg-success/15"
                  : "bg-white/70";
                return (
                  <tr key={i} className={`${rowBackgroundClass} backdrop-blur-sm transition`}> 
                    <td className="sticky left-0 z-10 px-4 py-3 font-medium text-foreground/80">S{i + 1}</td>
                    {row.map((cell, j) => {
                      const highlightSwapFrom = suggestion && i === suggestion.rMax && j === suggestion.cFromMax;
                      const highlightSwapTo = suggestion && i === suggestion.rMin && j === suggestion.cFromMin;
                      const highlightClass = highlightSwapFrom
                        ? "ring-2 ring-warning/60"
                        : highlightSwapTo
                        ? "ring-2 ring-accent/60"
                        : "";
                      return (
                        <td key={j} className="px-3 py-3 align-top">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">AH</div>
                        <input
                            className={`${cellInputClass} ${highlightClass} ${!isEditable && currentJobId ? disabledCellClass : ""}`}
                          type="number"
                            step="1"
                            value={isFiniteNumber(cell?.ah) ? cell.ah : ""}
                            onChange={(event) => handleCellChange(i, j, "ah", event.target.value)}
                            inputMode="numeric"
                            disabled={!isEditable && currentJobId}
                            title={!isEditable && currentJobId ? 'Job is not editable in current status' : ''}
                          />
                          <div className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground/70">V</div>
                        <input
                            className={`${cellInputClass} ${highlightClass} ${!isEditable && currentJobId ? disabledCellClass : ""}`}
                          type="number"
                            step="any"
                            value={isFiniteNumber(cell?.v) ? cell.v : ""}
                            onChange={(event) => handleCellChange(i, j, "v", event.target.value)}
                            inputMode="decimal"
                            disabled={!isEditable && currentJobId}
                            title={!isEditable && currentJobId ? 'Job is not editable in current status' : ''}
                        />
                      </td>
                      );
                    })}
                    <td className="px-4 py-3 font-semibold text-foreground/80">{isFiniteNumber(totalsAH[i]) ? Math.round(totalsAH[i]) : "—"}</td>
                    <td className="px-4 py-3 font-semibold text-foreground/80">{isFiniteNumber(averageVoltages[i]) ? averageVoltages[i].toFixed(3) : "—"}</td>
                    <td className="px-4 py-3 font-semibold text-foreground/80">{isFiniteNumber(totalsVoltage[i]) ? totalsVoltage[i].toFixed(3) : "—"}</td>
                    </tr>
                );
              })}
                </tbody>
              </table>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="panel px-6 py-6 space-y-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Saved Jobs</h3>
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{savedJobs.length} total</span>
        </div>

        {savedJobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-muted/40 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
            No saved jobs yet. Save your first job to see it listed here.
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {savedJobs.map((job) => (
              <div
                key={job.id}
                className={`glass-panel flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${currentJobId === job.id ? "ring-1 ring-accent/40 bg-accent/10" : ""}`}
              >
                <div className="flex-1 space-y-1 text-left">
                  <div className="text-sm font-medium text-foreground">
                    {job.serial_number && <span className="font-mono text-accent mr-2">{job.serial_number}</span>}
                    {job.job_card || job.customer_name || 'Unnamed Job'}
                    {currentJobId === job.id && <span className="ml-2 text-xs text-accent">(Current)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.customer_name && `${job.customer_name} · `}
                    {job.battery_spec && `${job.battery_spec} · `}
                    {job.series_count}S×{job.parallel_count}P · {new Date(job.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => loadJob(job.id)}
                    disabled={loading}
                    className={`${buttonClasses.primary} ${disabledButtonClass}`}
                  >
                    {loading ? 'Loading…' : 'Load'}
                  </button>
                  <button
                    onClick={() => deleteJob(job.id)}
                    className={`${buttonClasses.danger} ${disabledButtonClass}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-muted/30 bg-muted/20 px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-muted-foreground">Tips for best results</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Enter AH and voltage for every cell manually; leave blank when a reading isn't available.</li>
            <li>Yellow ring highlights the cell to remove from the current maximum row; blue ring marks the destination in the minimum row.</li>
            <li>Use <b>Apply Suggested Swap</b> or run <b>Iterate to Tolerance</b> until spread is within your threshold.</li>
            <li>Keep metadata current and click <b>Save Job</b> to persist the calculation to Supabase.</li>
          </ul>
      </div>
      </motion.section>
    </div>
  );
}

// ---------- Self-tests (non-blocking) ----------
(function runSelfTests(){
  try {
    // sums tests
    console.assert(sumAH([{ah: 1, v: 3.2}, {ah: 2, v: 3.3}, {ah: 3, v: 3.4}]) === 6, "sumAH basic");
    console.assert(sumAH([{ah: NaN, v: 3.2}, {ah: 5, v: NaN}, {ah: NaN, v: 3.4}]) === 5, "sumAH ignores NaN");

    // parseCSV tests
    const parsed = parseCSV("1,2,3\n4 5 6\n7\t8\t9");
    console.assert(parsed.length === 3 && parsed[0].length === 3, "parseCSV basic");

    // evaluateBestSingleSwap sanity
    const g1 = [[{ ah: 1, v: 3.2 }, { ah: 2, v: 3.3 }], [{ ah: 3, v: 3.4 }, { ah: 4, v: 3.5 }]]; // totals: [3,7] spread 4
    const s1 = evaluateBestSingleSwap(g1);
    console.assert(s1 && typeof s1.improvement === 'number', "swap suggestion returns object");

    // swap application reduces or keeps spread
    const spreadBefore = Math.max(...g1.map((row) => sumAH(row))) - Math.min(...g1.map((row) => sumAH(row)));
    const g1b = applySwap(g1, s1);
    const spreadAfter = Math.max(...g1b.map((row) => sumAH(row))) - Math.min(...g1b.map((row) => sumAH(row)));
    console.assert(spreadAfter <= spreadBefore, "swap does not worsen spread");

    // newline join correctness for CSV/TSV
    const aoa = [["A","B"],[{ah: 1, v: 3.2}, {ah: 2, v: 3.3}]];
    const csvText = aoa.map((r)=>r.join(",")).join("\n");
    const tsvText = aoa.map((r)=>r.join("\t")).join("\n");
    console.assert(csvText.includes("\n") && tsvText.includes("\n"), "newline joins are correct");

  } catch (e) {
    console.warn("Self-tests failed (non-fatal):", e);
  }
})();
