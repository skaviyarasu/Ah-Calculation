import React, { useMemo, useState } from 'react';
import {
  applySteps,
  DEFAULT_GROUP_COL,
  exportResults,
  labelText,
  parseRules,
  readCsv,
  readWorkbook,
  resultToCsv,
  summarizeGroups,
} from '../lib/cellGrouping/index.ts';
import type { Cell, GroupingResult, GroupSummary, Workbook } from '../lib/cellGrouping/index.ts';

const PREVIEW_ROWS = 200;

const formatCell = (c: Cell): string => (c === null ? '' : typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : String(c));

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBytes(bytes: Uint8Array | string, filename: string, type = XLSX_MIME): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function IssueList({ title, issues, tone }: { title: string; issues: { path: string; message: string }[]; tone: 'error' | 'warn' }) {
  if (!issues.length) return null;
  const color = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${color}`}>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {issues.map((i, n) => (
          <li key={n}>
            {i.path && <code className="mr-2 text-xs">{i.path}</code>}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowsTable({ result, rows }: { result: GroupingResult; rows: number[] }) {
  const { frame } = result;
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="overflow-auto rounded-xl border border-white/40 bg-white/70">
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-white/90">
          <tr>
            {frame.columns.map((c) => (
              <th key={c} className={`whitespace-nowrap px-3 py-2 font-semibold ${c === result.groupCol ? 'text-accent' : 'text-muted-foreground'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r} className="border-t border-slate-100">
              {frame.columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-1.5">
                  {formatCell(frame.data[c][r])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Showing {shown.length} of {rows.length} cells. Export to see all.
        </p>
      )}
    </div>
  );
}

export default function CellGrouping() {
  const [rulesText, setRulesText] = useState('');
  const [rulesName, setRulesName] = useState('');
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [dataName, setDataName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [groupCol, setGroupCol] = useState(DEFAULT_GROUP_COL);
  const [result, setResult] = useState<GroupingResult | null>(null);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState(0);

  const parsed = useMemo(() => (rulesText.trim() ? parseRules(rulesText) : null), [rulesText]);
  const groups: GroupSummary[] = useMemo(() => (result ? summarizeGroups(result) : []), [result]);

  const onRulesFile = async (file: File | undefined) => {
    if (!file) return;
    setRulesName(file.name);
    setRulesText(await file.text());
    setResult(null);
  };

  const onDataFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // CSV is read like the Python CLI (pandas read_csv defaults); Excel like pandas read_excel.
      const wb: Workbook = /\.csv$/i.test(file.name)
        ? (() => {
            const frame = readCsv(bytes);
            return { sheetNames: [], sheet: () => frame };
          })()
        : readWorkbook(bytes);
      setWorkbook(wb);
      setDataName(file.name);
      setSheetName(wb.sheetNames[0] ?? '');
    } catch (e) {
      setWorkbook(null);
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
    }
  };

  const run = () => {
    setError('');
    setResult(null);
    if (!parsed?.rules || !workbook) return;
    try {
      const frame = workbook.sheet(sheetName || undefined);
      setResult(applySteps(frame, parsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL }));
      setActiveGroup(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const exportExcel = () => {
    if (!result) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    downloadBytes(exportResults(result, rulesText), `cell_groups_${stamp}.xlsx`);
  };

  /** Same file the Python CLI writes (default name <input>_categorized.csv, Windows line endings). */
  const exportCsv = () => {
    if (!result) return;
    const stem = dataName.replace(/\.[^.]+$/, '') || 'cells';
    downloadBytes(resultToCsv(result), `${stem}_categorized.csv`, 'text/csv;charset=utf-8');
  };

  const canRun = Boolean(parsed?.rules && workbook);
  const kept = groups.filter((g) => !g.rejected);
  const tabs: Array<{ label: string; rows: number[]; rejected?: boolean }> = result
    ? [
        { label: 'All cells', rows: result.outputRows },
        ...kept.map((g) => ({ label: labelText(g.label), rows: g.rows })),
        { label: 'Rejected', rows: result.rejectedRows, rejected: true },
      ]
    : [];
  const excluded = result ? result.frame.length - result.outputRows.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Cell Grouping</p>
        <h2 className="text-fluid-lg font-semibold">Group cells with YAML rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Same rule format and results as the Python grouping script: steps run in order, and the first matching step labels a cell unless <code>once: false</code> is set.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass-panel space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">1. Rules (YAML or JSON)</h3>
            <label className="cursor-pointer rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs hover:border-accent/50">
              Load file
              <input type="file" accept=".yaml,.yml,.json" className="hidden" onChange={(e) => onRulesFile(e.target.files?.[0])} />
            </label>
          </div>
          {rulesName && <p className="text-xs text-muted-foreground">{rulesName}</p>}
          <textarea
            value={rulesText}
            onChange={(e) => {
              setRulesText(e.target.value);
              setResult(null);
            }}
            spellCheck={false}
            placeholder={'steps:\n  - name: "Grade-A"\n    filter:\n      all:\n        - { col: "IR_Value", op: "<=", value: 20 }'}
            className="h-64 w-full rounded-xl border border-white/40 bg-white/80 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {parsed && (
            <>
              <IssueList title="Rules are invalid" issues={parsed.errors} tone="error" />
              <IssueList title="Warnings" issues={parsed.warnings} tone="warn" />
              {parsed.rules && (
                <p className="text-xs text-emerald-700">
                  {parsed.rules.steps.length} steps · default_action: {parsed.rules.defaultAction}
                </p>
              )}
            </>
          )}
        </section>

        <section className="glass-panel space-y-4 p-5">
          <h3 className="font-semibold">2. Cell data (Excel)</h3>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-sm text-muted-foreground hover:border-accent/50">
            {dataName || 'Choose an .xlsx / .xls / .csv file'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onDataFile(e.target.files?.[0])} />
          </label>
          {workbook && workbook.sheetNames.length > 1 && (
            <label className="block text-sm">
              Sheet
              <select value={sheetName} onChange={(e) => setSheetName(e.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
                {workbook.sheetNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Group column
            <input
              value={groupCol}
              onChange={(e) => setGroupCol(e.target.value)}
              className="ml-2 w-40 rounded-lg border border-slate-200 bg-white px-2 py-1"
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={run}
              disabled={!canRun}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-layer-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Run grouping
            </button>
            <button
              onClick={exportExcel}
              disabled={!result}
              className="rounded-full border border-white/40 bg-white/70 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export Excel
            </button>
            <button
              onClick={exportCsv}
              disabled={!result}
              title="Identical to the CSV written by categorize_csv.py"
              className="rounded-full border border-white/40 bg-white/70 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
          {error && <IssueList title="Run failed" issues={[{ path: '', message: error }]} tone="error" />}
        </section>
      </div>

      {result && (
        <section className="glass-panel space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Cells', result.frame.length],
              ['Groups', kept.length],
              ['Rejected', result.rejectedRows.length],
              ['Excluded (drop_unmatched)', excluded],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((t, i) => (
              <button
                key={`${t.label}-${i}`}
                onClick={() => setActiveGroup(i)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  activeGroup === i
                    ? t.rejected
                      ? 'bg-red-600 text-white'
                      : 'bg-accent text-accent-foreground'
                    : 'bg-white/70 text-muted-foreground hover:bg-white'
                }`}
              >
                {t.label} <span className="opacity-70">({t.rows.length})</span>
              </button>
            ))}
          </div>

          {tabs[activeGroup] && <RowsTable result={result} rows={tabs[activeGroup].rows} />}
        </section>
      )}
    </div>
  );
}
