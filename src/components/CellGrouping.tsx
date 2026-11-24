import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applySteps,
  batchFileStem,
  batchPreprocess,
  batchToCsv,
  batchToXlsx,
  CHEMISTRIES,
  convertBatch,
  DEFAULT_GROUP_COL,
  exportResults,
  isPerCellReport,
  labelText,
  missingRuleColumns,
  parseRules,
  machineSheetRows,
  preprocessExcel,
  preprocessSheetRows,
  PyFloat,
  readCsv,
  readReportInputs,
  readWorkbook,
  resultToCsv,
  summarizeGroups,
} from '../lib/cellGrouping/index.ts';
import type {
  BatchResult,
  Cell,
  GroupingResult,
  GroupSummary,
  NormalizeResult,
  Preprocess,
  PublishedRules,
  ReportInput,
  RuleSet,
  Workbook,
} from '../lib/cellGrouping/index.ts';

const PREVIEW_ROWS = 200;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type PublishedMap = Record<string, PublishedRules | undefined>;

export interface CellGroupingProps {
  /** Admin: may upload and publish the LFP/NMC YAML rules. */
  canManageRules: boolean;
  /** Operator (and admin): may process grading reports with the published rules. */
  canProcessReports: boolean;
  /** Newest published rules per chemistry. */
  loadRules: () => Promise<PublishedMap>;
  /** Publishes a new version for one chemistry and returns the stored row. */
  publishRules: (chemistry: string, fileName: string, yamlText: string) => Promise<PublishedRules>;
}

const formatCell = (c: Cell): string => (c === null ? '' : typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : String(c));
const formatDate = (iso: string): string => new Date(iso).toLocaleString();

function describeCondition(c: Preprocess['dropRows'][number]): string {
  if (c.regex !== undefined) return `${c.col ?? 'row'} matches /${c.regex}/`;
  if (c.between) return `${c.col} between ${c.between.map(String).join(' and ')}`;
  const show = (x: unknown) => String(x instanceof PyFloat ? x.value : x);
  const v = c.values ? `[${c.values.map(show).join(', ')}]` : show(c.value);
  return `${c.col} ${c.op} ${v}`;
}

/** One-line description of a rules file's preprocessing. */
function describePreprocess(pre: Preprocess | undefined): string {
  if (!pre) return 'no preprocessing (Excel files are read as they are)';
  const parts = [`remove first ${pre.skipRows} row(s)`];
  parts.push(pre.header ? `replace header (${pre.header.length} columns)` : 'keep the file header');
  if (pre.dropRows.length) parts.push(`remove rows where ${pre.dropRows.map(describeCondition).join(' or ')}`);
  return `Excel preprocessing: ${parts.join(', ')}`;
}

function summarizeRules(rules: RuleSet): string {
  return `${rules.steps.length} steps · default_action: ${rules.defaultAction} · ${describePreprocess(rules.preprocess)}`;
}

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

const dropZone =
  'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-5 text-center text-sm text-muted-foreground hover:border-accent/50';
const primaryButton =
  'rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-layer-sm disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButton = 'rounded-full border border-white/40 bg-white/70 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40';

function FilePicker({
  label,
  accept,
  onFile,
  onFiles,
  multiple = false,
}: {
  label: React.ReactNode;
  accept: string;
  onFile?: (f: File) => void;
  /** Receives every selected file (use with `multiple`). */
  onFiles?: (fs: File[]) => void;
  multiple?: boolean;
}) {
  return (
    <label className={dropZone}>
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length && onFiles) onFiles(fs);
          else if (fs[0] && onFile) onFile(fs[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Admin: publish rules per chemistry
// ---------------------------------------------------------------------------

interface Draft {
  fileName: string;
  text: string;
  parsed: NormalizeResult;
}

function RulesCard({
  chemistryId,
  label,
  description,
  published,
  onPublish,
}: {
  chemistryId: string;
  label: string;
  description: string;
  published: PublishedRules | undefined;
  onPublish: (chemistry: string, fileName: string, text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showText, setShowText] = useState(false);
  const publishedRules = useMemo(() => (published ? parseRules(published.yaml_text).rules : undefined), [published]);

  const onFile = async (file: File) => {
    setError('');
    const text = await file.text();
    setDraft({ fileName: file.name, text, parsed: parseRules(text) });
  };

  const publish = async () => {
    if (!draft?.parsed.rules) return;
    setBusy(true);
    setError('');
    try {
      await onPublish(chemistryId, draft.fileName, draft.text);
      setDraft(null);
    } catch (e) {
      setError(`Could not publish: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/40 bg-white/60 p-4">
      <div>
        <p className="text-lg font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {published ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <p className="font-medium">Live: {published.file_name}</p>
          {publishedRules && <p>{summarizeRules(publishedRules)}</p>}
          <p>
            Published {formatDate(published.uploaded_at)}
            {published.uploaded_by_email && ` by ${published.uploaded_by_email}`}
          </p>
          <button type="button" onClick={() => setShowText((v) => !v)} className="mt-1 text-accent hover:underline">
            {showText ? 'Hide rules' : 'View rules'}
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No rules published yet. Operators cannot process {label} reports.</p>
      )}
      {showText && published && <pre className="max-h-64 overflow-auto rounded-lg bg-white/80 p-3 text-xs">{published.yaml_text}</pre>}

      <FilePicker
        accept=".yaml,.yml"
        onFile={onFile}
        label={draft ? <span className="font-medium text-foreground">{draft.fileName}</span> : `Upload new ${label} rules (.yaml)`}
      />

      {draft && (
        <div className="space-y-2">
          <IssueList title="These rules are invalid and cannot be published" issues={draft.parsed.errors} tone="error" />
          <IssueList title="Warnings" issues={draft.parsed.warnings} tone="warn" />
          {draft.parsed.rules && <p className="text-xs text-emerald-700">Valid · {summarizeRules(draft.parsed.rules)}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={publish} disabled={!draft.parsed.rules || busy} className={primaryButton}>
              {busy ? 'Publishing…' : `Publish for ${label}`}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <IssueList title="Publish failed" issues={[{ path: '', message: error }]} tone="error" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operator: process a grading report
// ---------------------------------------------------------------------------

/** `advanced` (admins) adds rule details, sheet and group-column options; operators only pick the chemistry and the file. */
function ReportProcessor({
  published,
  advanced,
  reload,
}: {
  published: PublishedMap;
  advanced: boolean;
  /** Fetches the latest published rules (and updates `published`). */
  reload: () => Promise<PublishedMap>;
}) {
  const available = CHEMISTRIES.filter((c) => published[c.id]);
  const [chemistry, setChemistry] = useState<string>('');
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [dataName, setDataName] = useState('');
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  /** Set when the upload is a set of per-cell reports (LFP) instead of one machine export. */
  const [perCell, setPerCell] = useState<ReportInput[] | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [groupCol, setGroupCol] = useState(DEFAULT_GROUP_COL);
  const [result, setResult] = useState<GroupingResult | null>(null);
  const [resultInfo, setResultInfo] = useState<{
    chemistry: string;
    rules: PublishedRules;
    /** Set when an Excel file was preprocessed (converted CSV + what was done). */
    preprocessed?: { csvText: string; pre: Preprocess; droppedRows: number; sheetName: string; sheetCount: number };
    /** An Excel file was read as-is because the rules have no `preprocess:` block. */
    excelWithoutPreprocess?: boolean;
    /** Per-cell reports converted to the machine layout (LFP). */
    conversion?: { batch: BatchResult; names: string[] };
  } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);

  const rules = chemistry ? published[chemistry] : undefined;
  const parsed = useMemo(() => (rules ? parseRules(rules.yaml_text) : null), [rules]);
  const groups: GroupSummary[] = useMemo(() => (result ? summarizeGroups(result) : []), [result]);
  const chem = CHEMISTRIES.find((c) => c.id === chemistry);

  const clearResult = () => {
    setResult(null);
    setResultInfo(null);
    setMissing([]);
  };

  /** One machine export, or several per-cell reports (LFP), which are converted when processing. */
  const onDataFiles = async (files: File[]) => {
    setError('');
    clearResult();
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    const inputs = readReportInputs(read);
    if (files.length > 1 || inputs.some((i) => i.table && isPerCellReport(i.table))) {
      setPerCell(inputs);
      setWorkbook(null);
      setFileBytes(null);
      setSheetName('');
      setDataName(files.length === 1 ? files[0].name : `${files.length} per-cell reports`);
      return;
    }
    setPerCell(null);
    await onDataFile(files[0]);
  };

  const onDataFile = async (file: File) => {
    setError('');
    clearResult();
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
      setFileBytes(bytes);
      setDataName(file.name);
      setSheetName(''); // '' = auto: raw-export sheet when preprocessing, else the first sheet
    } catch (e) {
      setWorkbook(null);
      setFileBytes(null);
      setDataName('');
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
    }
  };

  const reloadRules = async () => {
    setReloading(true);
    setError('');
    try {
      await reload();
    } catch (e) {
      setError(`Could not reload the rules: ${(e as Error).message}`);
    } finally {
      setReloading(false);
    }
  };

  /** Always processes with the latest published rules, even if they changed after this page was opened. */
  const run = async () => {
    setError('');
    clearResult();
    if (!chemistry || (!workbook && !perCell)) return;
    setBusy(true);
    try {
      const latest = (await reload())[chemistry];
      if (!latest) throw new Error(`No ${chemistry} rules are published any more. Ask an administrator to publish them.`);
      const latestParsed = parseRules(latest.yaml_text);
      if (!latestParsed.rules) throw new Error(`The published ${chemistry} rules are invalid. Ask an administrator to publish a corrected file.`);
      // Excel files are preprocessed when the chemistry's rules say so (convert to CSV, remove rows,
      // replace the header); CSV files are taken as already preprocessed, like the Python script.
      const pre = latestParsed.rules.preprocess;
      if (perCell) {
        if (!chem?.perCellReports) {
          const allowed = CHEMISTRIES.filter((c) => c.perCellReports)
            .map((c) => c.label)
            .join(' / ');
          throw new Error(`Per-cell reports can only be processed as ${allowed}. Select the right chemistry, or upload one grading-machine export.`);
        }
        // Convert to the machine layout, then read it exactly like a machine export of this chemistry.
        const batch = convertBatch(perCell);
        const batchPre = batchPreprocess(batch, pre);
        const out = preprocessSheetRows(machineSheetRows(batch), batchPre);
        setMissing(missingRuleColumns(latestParsed.rules, out.frame));
        setResult(applySteps(out.frame, latestParsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL }));
        setResultInfo({ chemistry, rules: latest, conversion: { batch, names: batchPre.header ?? [] } });
        setActiveGroup(0);
        return;
      }
      if (!workbook) return;
      const isCsv = /\.csv$/i.test(dataName);
      if (isCsv && pre) {
        throw new Error(`The ${chemistry} rules expect the raw grading-machine export (Excel .xlsx / .xls), not a CSV. Upload the raw machine file.`);
      }
      const preprocessed = !isCsv && pre && fileBytes ? { ...preprocessExcel(fileBytes, pre, sheetName || undefined), pre } : undefined;
      const frame = preprocessed ? preprocessed.frame : workbook.sheet(sheetName || undefined);
      setMissing(missingRuleColumns(latestParsed.rules, frame));
      setResult(applySteps(frame, latestParsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL }));
      setResultInfo({
        chemistry,
        rules: latest,
        preprocessed: preprocessed && {
          csvText: preprocessed.csvText,
          pre: preprocessed.pre,
          droppedRows: preprocessed.droppedRows,
          sheetName: preprocessed.sheetName,
          sheetCount: workbook.sheetNames.length,
        },
        excelWithoutPreprocess: !isCsv && !pre,
      });
      setActiveGroup(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reloadButton = (
    <button type="button" onClick={reloadRules} disabled={reloading || busy} className="text-xs text-accent hover:underline disabled:opacity-50">
      {reloading ? 'Reloading…' : 'Reload rules'}
    </button>
  );

  const stem = resultInfo?.conversion ? batchFileStem(resultInfo.conversion.batch) : dataName.replace(/\.[^.]+$/, '') || 'cells';
  /** Converted LFP batch in the grading machine's layout (4 header rows). */
  const exportBatchXlsx = () => {
    if (resultInfo?.conversion) downloadBytes(batchToXlsx(resultInfo.conversion.batch), `${stem}.xlsx`);
  };
  /** Converted LFP batch as CSV with one header row (the grouping column names). */
  const exportBatchCsv = () => {
    if (resultInfo?.conversion)
      downloadBytes(batchToCsv(resultInfo.conversion.batch, resultInfo.conversion.names), `${stem}.csv`, 'text/csv;charset=utf-8');
  };
  const exportExcel = () => {
    if (!result || !resultInfo) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    downloadBytes(exportResults(result), `${stem}_${resultInfo.chemistry}_groups_${stamp}.xlsx`);
  };
  /** The converted, preprocessed input (what used to be saved by hand before running the Python script). */
  const exportPreprocessed = () => {
    if (!resultInfo?.preprocessed) return;
    downloadBytes(resultInfo.preprocessed.csvText, `${stem}.csv`, 'text/csv;charset=utf-8');
  };
  /** Same content the Python CLI writes (Windows line endings). */
  const exportCsv = () => {
    if (!result || !resultInfo) return;
    downloadBytes(resultToCsv(result), `${stem}_${resultInfo.chemistry}_categorized.csv`, 'text/csv;charset=utf-8');
  };

  if (!available.length) {
    return (
      <section className="glass-panel p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Process grading report</h3>
          {reloadButton}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No grouping rules have been published yet. Ask an administrator to publish the LFP / NMC rules, then click Reload rules.
        </p>
        {error && <IssueList title="Error" issues={[{ path: '', message: error }]} tone="error" />}
      </section>
    );
  }

  const canRun = Boolean(parsed?.rules && (workbook || perCell)) && !busy;
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
    <>
      <section className="glass-panel space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Process grading report</h3>
          {reloadButton}
        </div>

        <div>
          <p className="mb-2 text-sm">1. Select the cell chemistry</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHEMISTRIES.map((c) => {
              const p = published[c.id];
              const selected = c.id === chemistry;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!p}
                  aria-pressed={selected}
                  onClick={() => {
                    setChemistry(c.id);
                    clearResult();
                    setError('');
                  }}
                  className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? 'border-accent bg-accent/10 ring-2 ring-accent/40' : 'border-white/40 bg-white/70 hover:border-accent/50'
                  }`}
                >
                  <p className="text-lg font-semibold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  {(advanced || !p) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p ? `Rules: ${p.file_name} · ${formatDate(p.uploaded_at)}` : 'Not available yet'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {parsed && parsed.errors.length > 0 && (
            <div className="mt-2">
              <IssueList
                title={`The published ${chem?.label} rules are invalid. Ask an administrator to publish a corrected file.`}
                issues={parsed.errors}
                tone="error"
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm">2. Upload the raw grading-machine export{chem?.perCellReports ? ', or all per-cell reports of the batch' : ''}</p>
          <FilePicker
            accept={advanced || chem?.perCellReports ? '.xlsx,.xls,.csv' : '.xlsx,.xls'}
            multiple={Boolean(chem?.perCellReports)}
            onFiles={onDataFiles}
            label={
              dataName ? (
                <>
                  <span className="font-medium text-foreground">{dataName}</span>
                  <span className="mt-1 text-xs">click to replace</span>
                </>
              ) : chem?.perCellReports ? (
                `Choose all ${chem.label} per-cell reports at once (.xls / .xlsx / .csv), or one machine export`
              ) : advanced ? (
                'Choose the raw grading-machine export (.xlsx / .xls; .csv for testing)'
              ) : (
                'Choose the raw grading-machine export (.xlsx / .xls)'
              )
            }
          />
          {advanced && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {workbook && workbook.sheetNames.length > 1 && (
                <label>
                  Sheet
                  <select
                    value={sheetName}
                    onChange={(e) => {
                      setSheetName(e.target.value);
                      clearResult();
                    }}
                    className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1"
                  >
                    <option value="">Auto-detect</option>
                    {workbook.sheetNames.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Group column
                <input
                  value={groupCol}
                  onChange={(e) => {
                    setGroupCol(e.target.value);
                    clearResult();
                  }}
                  className="ml-2 w-40 rounded-lg border border-slate-200 bg-white px-2 py-1"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={run} disabled={!canRun} className={primaryButton}>
            {busy ? 'Processing…' : `3. Process ${chem?.label ?? ''} data`}
          </button>
          <button onClick={exportExcel} disabled={!result} className={secondaryButton}>
            Export Excel
          </button>
          <button onClick={exportCsv} disabled={!result} title="Same content as the CSV written by categorize_csv.py" className={secondaryButton}>
            Export CSV
          </button>
        </div>
        {!canRun && (
          <p className="text-xs text-muted-foreground">
            {!chemistry && !workbook && !perCell
              ? 'Select LFP or NMC and upload the raw grading-machine export.'
              : !chemistry
                ? 'Select LFP or NMC.'
                : !workbook && !perCell
                  ? 'Upload the raw grading-machine export.'
                  : ''}
          </p>
        )}
        {error && <IssueList title="Processing failed" issues={[{ path: '', message: error }]} tone="error" />}
      </section>

      {result && missing.length > 0 && (
        <IssueList
          title={
            resultInfo?.excelWithoutPreprocess
              ? `The ${resultInfo.chemistry} rules have no preprocess block, so this Excel file was read as it is (its first row became the header) and ${missing.length} column(s) the rules use were not found. ` +
                (advanced
                  ? `Add the preprocess block (skip_rows, header, drop_rows) to the ${resultInfo.chemistry} rules and publish them again.`
                  : 'Ask an administrator to add the preprocessing settings to these rules.')
              : `The report is missing ${missing.length} column(s) that the ${resultInfo?.chemistry} rules use, so those conditions never match. Is this the right chemistry?`
          }
          issues={missing.map((m) => ({ path: '', message: m }))}
          tone="warn"
        />
      )}

      {result && resultInfo && (
        <section className="glass-panel space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            {dataName} · {resultInfo.chemistry}
            {advanced && ` · rules ${resultInfo.rules.file_name} (published ${formatDate(resultInfo.rules.uploaded_at)})`}
          </p>
          {resultInfo.conversion && (
            <div className="space-y-3 rounded-xl border border-white/40 bg-white/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium">Per-cell reports:</span> {resultInfo.conversion.batch.reports.length} read ·{' '}
                  <span className="text-emerald-700">{resultInfo.conversion.batch.converted} converted</span> ·{' '}
                  <span className={resultInfo.conversion.batch.failed ? 'text-red-700' : ''}>{resultInfo.conversion.batch.failed} not converted</span>
                </p>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={exportBatchXlsx} className="text-accent hover:underline">
                    Download batch (.xlsx, machine layout)
                  </button>
                  <button type="button" onClick={exportBatchCsv} className="text-accent hover:underline">
                    Download batch (.csv)
                  </button>
                </div>
              </div>
              {resultInfo.conversion.batch.failed > 0 && (
                <div className="overflow-auto">
                  <p className="mb-1 text-xs text-muted-foreground">Not converted (these cells have empty values and are grouped as unmatched):</p>
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="px-2 py-1">cell No.</th>
                        <th className="px-2 py-1">File</th>
                        <th className="px-2 py-1">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultInfo.conversion.batch.reports
                        .filter((r) => r.error !== null)
                        .map((r) => (
                          <tr key={r.cellNo} className="border-t border-slate-100">
                            <td className="px-2 py-1">{r.cellNo}</td>
                            <td className="px-2 py-1">{r.fileName}</td>
                            <td className="px-2 py-1 text-red-700">{r.error}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {resultInfo.preprocessed && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {resultInfo.preprocessed.sheetCount > 1 && `Sheet "${resultInfo.preprocessed.sheetName}" used. `}Converted to CSV: first{' '}
                {resultInfo.preprocessed.pre.skipRows} row(s) removed
                {resultInfo.preprocessed.pre.header ? `, header replaced (${resultInfo.preprocessed.pre.header.length} columns)` : ''}
                {resultInfo.preprocessed.pre.dropRows.length > 0 &&
                  `, ${resultInfo.preprocessed.droppedRows} cell(s) removed by the rules' drop_rows filter`}
                .
              </span>
              {advanced && (
                <button type="button" onClick={exportPreprocessed} className="text-accent hover:underline">
                  Download preprocessed CSV
                </button>
              )}
            </div>
          )}
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
    </>
  );
}

// ---------------------------------------------------------------------------

export default function CellGrouping({ canManageRules, canProcessReports, loadRules, publishRules }: CellGroupingProps) {
  const [published, setPublished] = useState<PublishedMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setPublished(await loadRules());
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadRules]);

  /** Background reload (no loading screen); throws so callers can show the error. */
  const reload = useCallback(async () => {
    const latest = await loadRules();
    setPublished(latest);
    return latest;
  }, [loadRules]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pick up rules published from another browser when the user comes back to this tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  const onPublish = async (chemistry: string, fileName: string, text: string) => {
    const row = await publishRules(chemistry, fileName, text);
    setPublished((prev) => ({ ...prev, [chemistry]: row }));
  };

  if (!canManageRules && !canProcessReports) {
    return <p className="text-sm text-muted-foreground">You do not have access to Cell Grouping. Ask an administrator for the Operator role.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Cell Grouping</p>
        <h2 className="text-fluid-lg font-semibold">Grading report processing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {canManageRules
            ? 'Publish the LFP and NMC grouping rules for operators, then process grading reports with them.'
            : 'Select LFP or NMC, upload the raw grading-machine export and process it. The matching rules and preprocessing are applied automatically.'}
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading grouping rules…</p>}
      {loadError && (
        <IssueList
          title="Could not load the grouping rules"
          issues={[{ path: '', message: `${loadError}. If this is a new setup, run database/19_add_cell_grouping.sql in Supabase.` }]}
          tone="error"
        />
      )}

      {!loading && !loadError && canManageRules && (
        <section className="glass-panel space-y-3 p-5">
          <div>
            <h3 className="font-semibold">Grouping rules (administrator)</h3>
            <p className="text-xs text-muted-foreground">
              Each upload is validated, then published as a new version. Operators always use the latest version.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {CHEMISTRIES.map((c) => (
              <RulesCard
                key={c.id}
                chemistryId={c.id}
                label={c.label}
                description={c.description}
                published={published[c.id]}
                onPublish={onPublish}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !loadError && canProcessReports && <ReportProcessor published={published} advanced={canManageRules} reload={reload} />}
    </div>
  );
}
