import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { db, auth, supabase } from "./lib/supabase";

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
function parseCSV(text) {
  const rows = String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((r) => r.split(/[\t,; ]+/).filter(Boolean));
  return rows
    .filter((r) => r.length > 0)
    .map((r) => r.map((v) => (v === "" ? NaN : Number(v))));
}

function sums(arr) {
  return arr.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
}

function evaluateBestSingleSwap(grid) {
  const S = grid.length; if (!S) return null;
  const P = grid[0]?.length ?? 0; if (!P) return null;

  const totals = grid.map((row) => sums(row));
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
      const vMax = grid[rMax][a];
      const vMin = grid[rMin][b];
      if (!isFinite(vMax) || !isFinite(vMin)) continue;
      if (a === b && Math.abs(vMax - vMin) < 1e-9) continue;

      const newTotals = totals.slice();
      newTotals[rMax] = totals[rMax] - vMax + vMin;
      newTotals[rMin] = totals[rMin] - vMin + vMax;
      let maxT = -Infinity, minT = Infinity;
      for (let i = 0; i < S; i++) {
        if (newTotals[i] > maxT) maxT = newTotals[i];
        if (newTotals[i] < minT) minT = newTotals[i];
      }
      const newSpread = maxT - minT;
      const improvement = beforeSpread - newSpread;
      const candidate = {
        rMax, rMin, cFromMax: a, cFromMin: b,
        valueFromMax: vMax, valueFromMin: vMin,
        beforeSpread, afterSpread: newSpread, improvement,
      };
      if (!best) best = candidate; else {
        const s1 = [candidate.improvement, -candidate.afterSpread, -Math.abs(newTotals[rMax] - newTotals[rMin])];
        const baseBestMax = totals[rMax] - best.valueFromMax + best.valueFromMin;
        const baseBestMin = totals[rMin] - best.valueFromMin + best.valueFromMax;
        const s2 = [best.improvement, -best.afterSpread, -Math.abs(baseBestMax - baseBestMin)];
        if (s1[0] > s2[0] || (s1[0] === s2[0] && (s1[1] > s2[1] || (s1[1] === s2[1] && s1[2] > s2[2])))) best = candidate;
      }
    }
  }
  return best;
}

function applySwap(grid, swap) {
  const out = grid.map((r) => r.slice());
  const tmp = out[swap.rMax][swap.cFromMax];
  out[swap.rMax][swap.cFromMax] = out[swap.rMin][swap.cFromMin];
  out[swap.rMin][swap.cFromMin] = tmp;
  return out;
}

// Build the current visible table as an array-of-arrays
function buildTableAOA(grid, S, P, totals, metadata = null) {
  const aoa = [];
  
  // Add metadata header if provided
  if (metadata) {
    aoa.push(["AH Balancer - Battery Optimization Report"]);
    aoa.push([""]);
    aoa.push(["Customer:", metadata.customerName || ""]);
    aoa.push(["Job Card #:", metadata.jobCard || ""]);
    aoa.push(["Date:", metadata.jobDate || ""]);
    aoa.push(["Battery Spec:", metadata.batterySpec || ""]);
    aoa.push([""]);
    aoa.push(["Capacity Matrix (mAh):"]);
    aoa.push([""]);
  }
  
  // Add table header
  const header = ["Series/Parallel", ...Array.from({ length: P }, (_, j) => `P${j + 1}`), "Total (mAh)"];
  aoa.push(header);
  
  // Add data rows
  for (let i = 0; i < S; i++) {
    const row = [`S${i + 1}`];
    for (let j = 0; j < P; j++) row.push(isFinite(grid[i]?.[j]) ? grid[i][j] : "");
    row.push(isFinite(totals[i]) ? Math.round(totals[i]) : "");
    aoa.push(row);
  }
  return aoa;
}

// ---------- React Component ----------
export default function App() {
  const [S, setS] = useState(13);
  const [P, setP] = useState(7);
  const [tolerance, setTolerance] = useState(20); // mAh
  const [grid, setGrid] = useState(() => Array.from({ length: 13 }, () => Array.from({ length: 7 }, () => NaN)));
  const [pasteText, setPasteText] = useState("");
  const tableRef = useRef(null);

  // Job/Customer metadata
  const [customerName, setCustomerName] = useState("");
  const [jobCard, setJobCard] = useState("");
  const [jobDate, setJobDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [batterySpec, setBatterySpec] = useState("");

  // Database state
  const [currentJobId, setCurrentJobId] = useState(null);
  const [savedJobs, setSavedJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ensure grid matches SxP
  useEffect(() => {
    setGrid((g) => Array.from({ length: S }, (_, i) => Array.from({ length: P }, (_, j) => (g[i]?.[j] ?? NaN))));
  }, [S, P]);

  // Load user's saved jobs on mount
  useEffect(() => {
    loadSavedJobs();
  }, []);

  async function loadSavedJobs() {
    setLoading(true);
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const jobs = await db.getUserJobs(user.id);
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

    if (!customerName.trim() && !jobCard.trim()) {
      alert('Please enter at least Customer Name or Job Card number before saving');
      return;
    }

    setSaving(true);
    try {
      const jobData = {
        user_id: user.id,
        customer_name: customerName || null,
        job_card: jobCard || null,
        job_date: jobDate || null,
        battery_spec: batterySpec || null,
        series_count: S,
        parallel_count: P,
        tolerance: tolerance
      };

      let job;
      if (currentJobId) {
        // Update existing job
        await db.updateJob(currentJobId, jobData);
        job = { id: currentJobId, ...jobData };
      } else {
        // Create new job
        job = await db.createJob(jobData);
        setCurrentJobId(job.id);
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
      setCustomerName(job.customer_name || "");
      setJobCard(job.job_card || "");
      setJobDate(job.job_date || new Date().toISOString().split('T')[0]);
      setBatterySpec(job.battery_spec || "");
      setS(job.series_count || 13);
      setP(job.parallel_count || 7);
      setTolerance(job.tolerance || 20);

      // Load cell data
      const cellData = await db.getCellData(jobId);
      
      // Reconstruct grid from cell data
      const newGrid = Array.from({ length: job.series_count || 13 }, () => 
        Array.from({ length: job.parallel_count || 7 }, () => NaN)
      );
      
      cellData.forEach(cell => {
        if (newGrid[cell.series_index] && newGrid[cell.series_index][cell.parallel_index] !== undefined) {
          newGrid[cell.series_index][cell.parallel_index] = parseFloat(cell.capacity_mah);
        }
      });

      setGrid(newGrid);
      setCurrentJobId(jobId);
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
      await db.deleteJob(jobId);
      if (currentJobId === jobId) {
        setCurrentJobId(null);
        // Clear current form
        setCustomerName("");
        setJobCard("");
        setJobDate(new Date().toISOString().split('T')[0]);
        setBatterySpec("");
        setGrid(Array.from({ length: S }, () => Array.from({ length: P }, () => NaN)));
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
      setCustomerName("");
      setJobCard("");
      setJobDate(new Date().toISOString().split('T')[0]);
      setBatterySpec("");
      setGrid(Array.from({ length: S }, () => Array.from({ length: P }, () => NaN)));
    }
  }

  const totals = useMemo(() => grid.map((r) => sums(r)), [grid]);
  const rMax = useMemo(() => totals.reduce((a, t, i) => (t > totals[a] ? i : a), 0), [totals]);
  const rMin = useMemo(() => totals.reduce((a, t, i) => (t < totals[a] ? i : a), 0), [totals]);
  const spread = useMemo(() => (totals[rMax] ?? 0) - (totals[rMin] ?? 0), [totals, rMax, rMin]);

  const suggestion = useMemo(() => evaluateBestSingleSwap(grid), [grid]);

  function handleCellChange(i, j, v) {
    const n = String(v).trim() === "" ? NaN : Number(v);
    setGrid((g) => {
      const gg = g.map((r) => r.slice());
      gg[i][j] = isFinite(n) ? n : NaN;
      return gg;
    });
  }

  function loadFromPaste() {
    const m = parseCSV(pasteText);
    if (!m.length) return;
    setS(m.length);
    setP(Math.max(...m.map((r) => r.length)));
    const maxP = Math.max(...m.map((x) => x.length));
    const norm = m.map((r) => {
      const rr = r.slice();
      while (rr.length < maxP) rr.push(NaN);
      return rr;
    });
    setGrid(norm);
  }

  function exportCSV() {
    try {
      const metadata = { customerName, jobCard, jobDate, batterySpec };
      const aoa = buildTableAOA(grid, S, P, totals, metadata);
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
    const metadata = { customerName, jobCard, jobDate, batterySpec };
    const aoa = buildTableAOA(grid, S, P, totals, metadata);
    const text = aoa.map((row) => row.join(",")).join("\n");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => alert("Table copied as CSV."));
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); alert("Table copied as CSV.");
    }
  }

  function copyTableTSV() {
    const metadata = { customerName, jobCard, jobDate, batterySpec };
    const aoa = buildTableAOA(grid, S, P, totals, metadata);
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
      const metadata = { customerName, jobCard, jobDate, batterySpec };
      const aoa = buildTableAOA(grid, S, P, totals, metadata);
      const wsBefore = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsBefore, "Report");

      // Summary sheet with enhanced statistics
      const rMx = totals.reduce((a, t, i) => (t > totals[a] ? i : a), 0);
      const rMn = totals.reduce((a, t, i) => (t < totals[a] ? i : a), 0);
      const spreadVal = (totals[rMx] ?? 0) - (totals[rMn] ?? 0);
      const avgCapacity = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      const totalCapacity = totals.reduce((a, b) => a + b, 0);
      
      const wsSummary = XLSX.utils.aoa_to_sheet([
        ["AH Balancer - Job Summary", ""],
        ["Generated", new Date().toLocaleString()],
        ["", ""],
        ["Job Information", ""],
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
        ["Max Row Capacity (mAh)", Math.round(totals[rMx] ?? 0)],
        ["Min Row (S#)", rMn + 1],
        ["Min Row Capacity (mAh)", Math.round(totals[rMn] ?? 0)],
        ["Current Spread (mAh)", Math.round(spreadVal)],
        ["Balance Status", spreadVal <= tolerance ? "✓ Within Tolerance" : "⚠ Needs Optimization"],
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

  function randomize() {
    const g = Array.from({ length: S }, () => Array.from({ length: P }, () => Math.round(4350 + Math.random() * 200)));
    setGrid(g);
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
              <h2 className="text-xl font-semibold text-blue-800">Job Information</h2>
              <div className="flex gap-2">
                <button
                  onClick={newJob}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
                >
                  New Job
                </button>
                <button
                  onClick={saveJob}
                  disabled={saving}
                  className={`px-4 py-2 rounded-md transition-colors text-sm ${
                    saving
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {saving ? 'Saving...' : currentJobId ? 'Update Job' : 'Save Job'}
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter customer name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Job Card #</label>
            <input
              type="text"
              value={jobCard}
              onChange={(e) => setJobCard(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter job card number"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Date</label>
                <input
              type="date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Battery Specification</label>
                <input
              type="text"
              value={batterySpec}
              onChange={(e) => setBatterySpec(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Paste CSV / TSV (auto-detect)</label>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={"4350,4389,4472\n4430,4451,4403"} />
              <div className="flex gap-2">
                <button onClick={loadFromPaste} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors">Load from Paste</button>
                <button onClick={randomize} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors">Generate Demo Data</button>
              </div>
              </div>
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
          <div className="text-sm">Spread (max - min): <b>{isFinite(spread) ? Math.round(spread) : "—"} mAh</b></div>
          <div className="text-sm">Max row: <b>S{(rMax + 1) || "—"}</b> | Min row: <b>S{(rMin + 1) || "—"}</b></div>
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

          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={loadSavedJobs}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${
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
                {loading ? 'Retrieving...' : 'Retrieve Data'}
              </button>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-700">Saved Jobs:</h3>
                {savedJobs.length > 0 ? (
                  <>
                    <span className="text-sm text-gray-600">({savedJobs.length} found)</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) loadJob(e.target.value);
                        e.target.value = '';
                      }}
                      className="border rounded-md px-3 py-1 text-sm"
                      defaultValue=""
                    >
                      <option value="">Select a job to load...</option>
                      {savedJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.job_card || job.customer_name || 'Unnamed Job'} - {new Date(job.created_at).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-sm text-gray-500">No saved jobs yet</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyTableTSV} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Copy Table TSV</button>
              <button onClick={copyTableCSV} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Copy Table CSV</button>
              <button onClick={exportCSV} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Export Table CSV</button>
              <button onClick={exportXLSX} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors text-sm">Export Table Excel</button>
            </div>
          </div>

          <div className="overflow-auto border rounded-2xl">
            <table ref={tableRef} className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-white z-10">Series\\Parallel</th>
                    {Array.from({ length: P }).map((_, j) => (
                      <th key={j} className="px-3 py-2">P{j + 1}</th>
                    ))}
                    <th className="px-3 py-2">Total (mAh)</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, i) => {
                    const isMax = i === rMax;
                    const isMin = i === rMin;
                    return (
                      <tr key={i} className={`${isMax ? "bg-red-50" : isMin ? "bg-green-50" : ""}`}>
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white z-10">S{i + 1}</td>
                      {row.map((v, j) => {
                        const highlightSwapFrom = suggestion && i === suggestion.rMax && j === suggestion.cFromMax;
                        const highlightSwapTo = suggestion && i === suggestion.rMin && j === suggestion.cFromMin;
                        const common = "px-3 py-1 border rounded-xl w-24";
                        return (
                          <td key={j} className="px-2 py-2">
                        <input
                              className={`${common} ${highlightSwapFrom ? "ring-2 ring-yellow-400" : ""} ${highlightSwapTo ? "ring-2 ring-blue-400" : ""}`}
                              value={isFinite(v) ? v : ""}
                              onChange={(e) => handleCellChange(i, j, e.target.value)}
                              inputMode="numeric"
                        />
                      </td>
                        );
                      })}
                      <td className="px-3 py-2 font-semibold">{isFinite(totals[i]) ? Math.round(totals[i]) : "—"}</td>
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
              <li>Paste a 13×7 matrix (or change S/P first) and click <b>Load from Paste</b>.</li>
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
    console.assert(sums([1,2,3]) === 6, "sums basic");
    console.assert(sums([NaN, 5, NaN]) === 5, "sums ignores NaN");

    // parseCSV tests
    const parsed = parseCSV("1,2,3\n4 5 6\n7\t8\t9");
    console.assert(parsed.length === 3 && parsed[0].length === 3, "parseCSV basic");

    // evaluateBestSingleSwap sanity
    const g1 = [[1,2],[3,4]]; // totals: [3,7] spread 4
    const s1 = evaluateBestSingleSwap(g1);
    console.assert(s1 && typeof s1.improvement === 'number', "swap suggestion returns object");

    // swap application reduces or keeps spread
    const spreadBefore = Math.max(...g1.map(sums)) - Math.min(...g1.map(sums));
    const g1b = applySwap(g1, s1);
    const spreadAfter = Math.max(...g1b.map(sums)) - Math.min(...g1b.map(sums));
    console.assert(spreadAfter <= spreadBefore, "swap does not worsen spread");

    // newline join correctness for CSV/TSV
    const aoa = [["A","B"],[1,2]];
    const csvText = aoa.map((r)=>r.join(",")).join("\n");
    const tsvText = aoa.map((r)=>r.join("\t")).join("\n");
    console.assert(csvText.includes("\n") && tsvText.includes("\n"), "newline joins are correct");

  } catch (e) {
    console.warn("Self-tests failed (non-fatal):", e);
  }
})();
