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

  const voltageExtremes = useMemo(() => {
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

  const suggestion = useMemo(() => evaluateBestSingleSwap(grid), [grid]);

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
          "Max Avg Row Voltage (V)",
          isFiniteNumber(voltageExtremes.max.value) ? voltageExtremes.max.value.toFixed(3) : "Not recorded"
        ],
        [
          "Max Voltage Row",
          voltageExtremes.max.series !== null
            ? `S${voltageExtremes.max.series + 1}`
            : "Not recorded"
        ],
        [
          "Min Avg Row Voltage (V)",
          isFiniteNumber(voltageExtremes.min.value) ? voltageExtremes.min.value.toFixed(3) : "Not recorded"
        ],
        [
          "Min Voltage Row",
          voltageExtremes.min.series !== null
            ? `S${voltageExtremes.min.series + 1}`
            : "Not recorded"
        ],
        [
          "Voltage Spread (V)",
          isFiniteNumber(voltageExtremes.diff) ? voltageExtremes.diff.toFixed(3) : "Not recorded"
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-6 space-y-6"
        >
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
            AH Balancer — Interactive Optimizer
          </h1>
          
          {/* Job Information Section */}
          <div className="mb-6 bg-blue-50 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-blue-800">Job Information</h2>
                {currentJobId && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentJobStatus === 'draft' ? 'bg-gray-200 text-gray-700' :
                    currentJobStatus === 'pending_review' ? 'bg-yellow-200 text-yellow-800' :
                    currentJobStatus === 'needs_modification' ? 'bg-orange-200 text-orange-800' :
                    currentJobStatus === 'approved' ? 'bg-green-200 text-green-800' :
                    currentJobStatus === 'rejected' ? 'bg-red-200 text-red-800' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {currentJobStatus === 'draft' ? 'Draft' :
                     currentJobStatus === 'pending_review' ? 'Pending Review' :
                     currentJobStatus === 'needs_modification' ? 'Needs Modification' :
                     currentJobStatus === 'approved' ? 'Approved' :
                     currentJobStatus === 'rejected' ? 'Rejected' : 'Draft'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={newJob}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                >
                  New Job
                </button>
                <button
                  onClick={saveJob}
                  disabled={saving || !isEditable}
                  className={`px-4 py-2 rounded-md transition-colors text-sm ${
                    saving || !isEditable
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                  title={!isEditable && currentJobId ? 'Job is not in editable status. Only draft or needs_modification jobs can be edited.' : ''}
                >
                  {saving ? 'Saving...' : currentJobId ? 'Update Job' : 'Save Job'}
                </button>
                {/* Submit for Review button (Creator only) */}
                {isCreator && currentJobId && (currentJobStatus === 'draft' || currentJobStatus === 'needs_modification') && (
                  <button
                    onClick={submitForReview}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                  >
                    Submit for Review
                  </button>
                )}
              </div>
            </div>
            
            {/* Verification Notes Display */}
            {verificationNotes && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm font-medium text-yellow-800 mb-1">Verification Notes:</p>
                <p className="text-sm text-yellow-700">{verificationNotes}</p>
              </div>
            )}

            {/* Verifier Actions */}
            {isVerifier && currentJobId && currentJobStatus === 'pending_review' && (
              <div className="mb-4 p-4 bg-white border border-gray-300 rounded-md">
                <p className="text-sm font-medium text-gray-700 mb-2">Review & Verification</p>
                <textarea
                  value={verificationNotesInput}
                  onChange={(e) => setVerificationNotesInput(e.target.value)}
                  placeholder="Enter verification notes..."
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => verifyJob('approved')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => verifyJob('rejected')}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                  >
                    Reject
                  </button>
                  <button
                    onClick={requestModification}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                    disabled={!verificationNotesInput.trim()}
                  >
                    Request Modification
                  </button>
                </div>
              </div>
            )}
            
            {!isEditable && currentJobId && (
              <div className="mb-4 p-3 bg-gray-100 border border-gray-300 rounded-md">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Note:</span> This job is not editable in its current status. 
                  {currentJobStatus === 'pending_review' && ' It is awaiting verification.'}
                  {currentJobStatus === 'approved' && ' It has been approved.'}
                  {currentJobStatus === 'rejected' && ' It has been rejected.'}
                  {currentJobStatus === 'needs_modification' && isCreator && ' You can now edit and resubmit.'}
                </p>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Serial Number <span className="text-xs text-gray-500 font-normal">(Tracking ID)</span>
                </label>
                <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
              disabled={!isEditable && currentJobId}
              className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                !isEditable && currentJobId ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'
              }`}
              placeholder="AH-YYYYMMDD-XXXX"
              title={currentJobId ? "Edit serial number for tracking" : "Auto-generated on save"}
            />
            {!currentJobId && (
              <p className="text-xs text-gray-500">Will be auto-generated when you save</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={!isEditable && currentJobId}
              className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                !isEditable && currentJobId ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="Enter customer name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Job Card #</label>
            <input
              type="text"
              value={jobCard}
              onChange={(e) => setJobCard(e.target.value)}
              disabled={!isEditable && currentJobId}
              className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                !isEditable && currentJobId ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="Enter job card number"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Date</label>
                <input
              type="date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
              disabled={!isEditable && currentJobId}
                  className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    !isEditable && currentJobId ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                />
              </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Battery Specification</label>
                <input
              type="text"
              value={batterySpec}
              onChange={(e) => setBatterySpec(e.target.value)}
              disabled={!isEditable && currentJobId}
                  className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    !isEditable && currentJobId ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
              placeholder="e.g., 48V 100Ah LiFePO4"
                />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium">Series (S)</label>
            <input type="number" min={1} value={S} onChange={(e) => setS(Number(e.target.value) || 1)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Parallel (P)</label>
            <input type="number" min={1} value={P} onChange={(e) => setP(Number(e.target.value) || 1)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tolerance (mAh)</label>
            <input type="number" min={0} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value) || 0)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3 p-4 bg-white border rounded-lg">
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Manual Entry Workflow</h3>
              <p className="text-sm text-gray-600">
                Enter amp-hour and voltage values directly in the grid below. Each cell now captures both measurements—no file import is required.
              </p>
              <ul className="list-disc ml-5 text-xs text-gray-500 space-y-1">
                <li>Type AH in the first field and Voltage in the second field for every parallel slot.</li>
                <li>Voltage accepts decimal values (comma or dot). Leave blank if a reading isn&apos;t available.</li>
                <li>Use the export buttons to capture snapshots once the matrix is complete.</li>
              </ul>
              <div>
              <button
                  onClick={randomize}
                  className="mt-3 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
              >
                  Generate Demo Data
              </button>
              </div>
            </div>
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
          <div className="text-sm">AH Spread (max - min): <b>{isFinite(spread) ? Math.round(spread) : "—"} mAh</b></div>
          <div className="text-sm">Max row: <b>S{(rMax + 1) || "—"}</b> | Min row: <b>S{(rMin + 1) || "—"}</b></div>
          <div className="text-xs text-gray-600">
            Avg V (Max row): <b>{isFiniteNumber(averageVoltages[rMax]) ? averageVoltages[rMax].toFixed(3) : "—"}</b>&nbsp;|&nbsp;
            Avg V (Min row): <b>{isFiniteNumber(averageVoltages[rMin]) ? averageVoltages[rMin].toFixed(3) : "—"}</b>
          </div>
          <div className="text-sm">
            Max avg row voltage: <b>{isFiniteNumber(voltageExtremes.max.value) ? voltageExtremes.max.value.toFixed(3) : "—"} V</b>
            {voltageExtremes.max.series !== null && (
              <span> (S{voltageExtremes.max.series + 1})</span>
            )}
          </div>
          <div className="text-sm">
            Min avg row voltage: <b>{isFiniteNumber(voltageExtremes.min.value) ? voltageExtremes.min.value.toFixed(3) : "—"} V</b>
            {voltageExtremes.min.series !== null && (
              <span> (S{voltageExtremes.min.series + 1})</span>
            )}
          </div>
          <div className="text-sm">
            Voltage spread: <b>{isFiniteNumber(voltageExtremes.diff) ? voltageExtremes.diff.toFixed(3) : "—"} V</b>
          </div>
          {suggestion ? (
            <div className="text-sm">
              Suggested swap: <b>S{suggestion.rMax + 1}:P{suggestion.cFromMax + 1}</b> ↔ <b>S{suggestion.rMin + 1}:P{suggestion.cFromMin + 1}</b>
              <div>Improvement: <b>{Math.round(suggestion.improvement)}</b> mAh | After spread: <b>{Math.round(suggestion.afterSpread)}</b> mAh</div>
              <div className="flex gap-2 mt-2">
                <button onClick={applySuggestedSwap} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors">Apply Suggested Swap</button>
                <button onClick={iterateToTolerance} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md transition-colors">Iterate to Tolerance</button>
              </div>
              </div>
          ) : (
            <div className="text-sm text-gray-500">Enter data to see a suggestion.</div>
          )}
        </div>
      </div>

          {/* Search and Retrieve Section */}
          <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              {/* Search Input */}
              <div id="search-container" className="flex-1 relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Saved Jobs
                </label>
                <div className="relative">
                  <svg 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    placeholder="Search by Job Card, Customer Name, Date, or ID..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchQuery && (
              <button
                      onClick={() => {
                        setSearchQuery("");
                        setShowSearchResults(false);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
              </button>
                  )}
                </div>
                
                {/* Search Results Dropdown */}
                {showSearchResults && searchQuery.trim() && filteredJobs.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                    {filteredJobs.map((job) => (
                      <div
                        key={job.id}
                        onClick={() => {
                          loadJob(job.id);
                          setSearchQuery("");
                          setShowSearchResults(false);
                        }}
                        className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {job.serial_number && (
                                <span className="font-mono text-blue-600 mr-2 font-semibold">{job.serial_number}</span>
                              )}
                              {job.job_card || job.customer_name || 'Unnamed Job'}
                              {currentJobId === job.id && (
                                <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Current</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {job.customer_name && job.job_card && `${job.customer_name} • `}
                              {job.job_date && `Date: ${new Date(job.job_date).toLocaleDateString()} • `}
                              {job.serial_number ? `SN: ${job.serial_number}` : `ID: ${job.id.substring(0, 8)}...`}
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {showSearchResults && searchQuery.trim() && filteredJobs.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-gray-500">
                    No jobs found matching "{searchQuery}"
                  </div>
                )}
              </div>

              {/* Retrieve Button */}
              <div className="flex flex-col gap-2">
                <label className="block text-sm font-medium text-gray-700 mb-2 opacity-0">Actions</label>
              <button
                  onClick={loadSavedJobs}
                  disabled={loading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium whitespace-nowrap ${
                    loading
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title="Retrieve all saved jobs from database"
                >
                  <svg 
                    className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d={loading 
                        ? "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                        : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      }
                    />
                  </svg>
                  {loading ? 'Retrieving...' : 'Refresh List'}
              </button>
            </div>
          </div>

            {/* Search Summary */}
            {searchQuery.trim() && (
              <div className="mt-3 text-sm text-gray-600">
                Found {filteredJobs.length} of {savedJobs.length} saved {savedJobs.length === 1 ? 'job' : 'jobs'}
              </div>
            )}
            
            {/* Quick Access Dropdown (fallback) */}
            {!searchQuery.trim() && savedJobs.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Quick Load:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      loadJob(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="flex-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  defaultValue=""
                >
                  <option value="">Select a job to load...</option>
                  {savedJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.serial_number ? `[${job.serial_number}] ` : ''}{job.job_card || job.customer_name || 'Unnamed Job'} - {new Date(job.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Export Buttons */}
          <div className="mb-4 flex items-center justify-end gap-2">
            <button onClick={copyTableTSV} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Copy Table TSV</button>
            <button onClick={copyTableCSV} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Copy Table CSV</button>
            <button onClick={exportCSV} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Export Table CSV</button>
            <button onClick={exportXLSX} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Export Table Excel</button>
          </div>

          <div className="overflow-auto border rounded-2xl">
            <table ref={tableRef} className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-white z-10">Series\\Parallel</th>
                    {Array.from({ length: P }).map((_, j) => (
                      <th key={j} className="px-3 py-2">P{j + 1}</th>
                    ))}
                    <th className="px-3 py-2">Total AH</th>
                    <th className="px-3 py-2">Avg V</th>
                    <th className="px-3 py-2">Total V</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, i) => {
                    const isMax = i === rMax;
                    const isMin = i === rMin;
                    return (
                      <tr key={i} className={`${isMax ? "bg-red-50" : isMin ? "bg-green-50" : ""}`}>
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white z-10">S{i + 1}</td>
                      {row.map((cell, j) => {
                        const highlightSwapFrom = suggestion && i === suggestion.rMax && j === suggestion.cFromMax;
                        const highlightSwapTo = suggestion && i === suggestion.rMin && j === suggestion.cFromMin;
                        const baseClass = "px-3 py-1 border rounded-xl w-24";
                        const highlightClass = `${highlightSwapFrom ? " ring-2 ring-yellow-400" : ""}${highlightSwapTo ? " ring-2 ring-blue-400" : ""}`;
                        const disabledClass = !isEditable && currentJobId ? ' bg-gray-100 cursor-not-allowed' : '';
                        return (
                          <td key={j} className="px-2 py-2 align-top">
                            <div className="text-[10px] text-gray-500 mb-1">AH</div>
                        <input
                              className={`${baseClass}${highlightClass}${disabledClass}`}
                          type="number"
                              step="1"
                              value={isFiniteNumber(cell?.ah) ? cell.ah : ""}
                              onChange={(e) => handleCellChange(i, j, "ah", e.target.value)}
                              inputMode="numeric"
                              disabled={!isEditable && currentJobId}
                              title={!isEditable && currentJobId ? 'Job is not editable in current status' : ''}
                            />
                            <div className="text-[10px] text-gray-500 mt-2 mb-1">V</div>
                        <input
                              className={`${baseClass}${highlightClass}${disabledClass}`}
                          type="number"
                              step="any"
                              value={isFiniteNumber(cell?.v) ? cell.v : ""}
                              onChange={(e) => handleCellChange(i, j, "v", e.target.value)}
                              inputMode="decimal"
                              disabled={!isEditable && currentJobId}
                              title={!isEditable && currentJobId ? 'Job is not editable in current status' : ''}
                        />
                      </td>
                        );
                      })}
                      <td className="px-3 py-2 font-semibold">{isFiniteNumber(totalsAH[i]) ? Math.round(totalsAH[i]) : "—"}</td>
                      <td className="px-3 py-2 font-semibold">{isFiniteNumber(averageVoltages[i]) ? averageVoltages[i].toFixed(3) : "—"}</td>
                      <td className="px-3 py-2 font-semibold">{isFiniteNumber(totalsVoltage[i]) ? totalsVoltage[i].toFixed(3) : "—"}</td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
          </div>

          {/* Saved Jobs List */}
          {savedJobs.length > 0 && (
            <div className="mt-6 bg-gray-50 border rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Your Saved Jobs</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`flex items-center justify-between p-3 bg-white border rounded-lg ${
                      currentJobId === job.id ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {job.serial_number && (
                          <span className="font-mono text-blue-600 font-semibold mr-2">{job.serial_number}</span>
                        )}
                        {job.job_card || job.customer_name || 'Unnamed Job'}
                        {currentJobId === job.id && <span className="ml-2 text-blue-600 text-sm">(Current)</span>}
                      </div>
                      <div className="text-sm text-gray-500">
                        {job.customer_name && job.job_card && `${job.customer_name} • `}
                        {job.battery_spec && `${job.battery_spec} • `}
                        {job.series_count}S×{job.parallel_count}P • {new Date(job.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadJob(job.id)}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md transition-colors text-sm"
                      >
                        {loading ? 'Loading...' : 'Load'}
                      </button>
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            Tips:
            <ul className="list-disc ml-5 space-y-1 mt-1">
              <li>Enter AH and Voltage for every cell manually; leave blank when you don’t have a reading.</li>
              <li>Yellow ring = cell to <b>swap out</b> from the current <b>max</b> row; Blue ring = cell to <b>swap in</b> to the current <b>min</b> row.</li>
              <li>Click <b>Apply Suggested Swap</b> to mutate the grid; re-run until spread ≤ tolerance using <b>Iterate to Tolerance</b>.</li>
              <li>Fill in job information and click <b>Save Job</b> to store your calculations in the database.</li>
            </ul>
          </div>
        </motion.div>
      </div>
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
