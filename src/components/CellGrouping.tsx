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

import iconChevronDown from '../assets/genie/icon-chevron-down.svg';
import statusDotInfo from '../assets/genie/status-dot-info.svg';
import statusDotSuccess from '../assets/genie/status-dot-success.svg';

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
  const color =
    tone === 'error' ? 'border-[rgba(211,47,47,0.4)] bg-[#fdecec] text-genie-danger-fg' : 'border-genie-warning-border bg-[#fff6e5] text-genie-warning-fg';
  return (
    <div className={`rounded-genie-md border px-4 py-3 text-sm leading-[1.4] ${color}`}>
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

type PillTone = 'success' | 'info' | 'warning' | 'danger';
const PILL_STYLE: Record<PillTone, string> = {
  success: 'border-genie-success-border bg-genie-success-bg text-genie-success-fg',
  info: 'border-genie-info-border bg-genie-info-bg text-genie-info-fg',
  warning: 'border-genie-warning-border bg-[#fff6e5] text-genie-warning-fg',
  danger: 'border-genie-danger bg-[#fdecec] text-genie-danger-fg',
};
const PILL_DOT: Record<PillTone, React.ReactNode> = {
  success: <img src={statusDotSuccess} alt="" width={10} height={10} className="h-[10px] w-[10px] shrink-0" />,
  info: <img src={statusDotInfo} alt="" width={10} height={10} className="h-[10px] w-[10px] shrink-0" />,
  warning: <span className="h-[10px] w-[10px] shrink-0 rounded-full bg-genie-warning-fg" aria-hidden="true" />,
  danger: <span className="h-[10px] w-[10px] shrink-0 rounded-full bg-genie-danger-fg" aria-hidden="true" />,
};

/** Genie status pill (dot + text). */
function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`genie-pill ${PILL_STYLE[tone]}`}>
      {PILL_DOT[tone]}
      {children}
    </span>
  );
}

/** Genie KPI tile: label, big value, caption. */
function Kpi({ label, value, caption }: { label: string; value: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="genie-kpi">
      <p className="text-sm font-medium text-genie-text-secondary">{label}</p>
      <p className="truncate text-[28px] font-semibold text-genie-text">{value}</p>
      <p className="min-h-[17px] text-xs text-genie-text-secondary">{caption ?? ''}</p>
    </div>
  );
}

/** Genie select field (label above, chevron icon). */
function SelectField({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-1 flex-col gap-1 ${className}`}>
      <span className="genie-label">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="genie-field appearance-none pr-10">
          {children}
        </select>
        <img src={iconChevronDown} alt="" width={16} height={16} className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      </span>
    </label>
  );
}

function RowsTable({ result, rows }: { result: GroupingResult; rows: number[] }) {
  const { frame } = result;
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="overflow-auto rounded-genie-md border border-genie-border bg-genie-surface">
      <table className="min-w-full text-left text-sm leading-[1.4]">
        <thead className="sticky top-0 bg-genie-surface">
          <tr>
            {frame.columns.map((c) => (
              <th
                key={c}
                className={`whitespace-nowrap px-3 py-2 font-medium ${c === result.groupCol ? 'text-genie-primary' : 'text-genie-text-secondary'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r} className="border-t border-genie-border">
              {frame.columns.map((c) => (
                <td key={c} className={`whitespace-nowrap px-3 py-1.5 ${c === result.groupCol ? 'font-medium' : ''}`}>
                  {formatCell(frame.data[c][r])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="px-3 py-2 text-xs text-genie-text-secondary">
          Showing {shown.length} of {rows.length} cells. Download to see all.
        </p>
      )}
    </div>
  );
}

const dropZone =
  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-genie-md border border-dashed border-genie-border-strong bg-genie-muted px-4 py-6 text-center text-sm leading-[1.4] text-genie-text-secondary transition-colors hover:border-genie-primary';

function FilePicker({
  label,
  accept,
  onFile,
  onFiles,
  multiple = false,
  className = dropZone,
}: {
  label: React.ReactNode;
  accept: string;
  onFile?: (f: File) => void;
  /** Receives every selected file (use with `multiple`). */
  onFiles?: (fs: File[]) => void;
  multiple?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
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
// Plain-language rule conditions (admin "Rule details", Figma UI-GRD-002 Admin)
// ---------------------------------------------------------------------------

const OP_SYMBOL: Record<string, string> = { '>=': '≥', '<=': '≤', '!=': '≠', '==': '=', '>': '>', '<': '<' };
const showValue = (x: unknown) => String(x instanceof PyFloat ? x.value : x);

function conditionText(
  c: RuleSet['steps'][number]['filter'] extends infer F ? (F extends { conditions: Array<infer C> } ? C : never) : never,
): string {
  const col = c.col ?? 'row';
  if (c.regex !== undefined) return `${col} matches /${c.regex}/`;
  if (c.between) return `${showValue(c.between[0])} ≤ ${col} ≤ ${showValue(c.between[1])}`;
  if (c.values) return `${col} ${c.op === 'in' ? 'in' : c.op} [${c.values.map(showValue).join(', ')}]`;
  return `${col} ${OP_SYMBOL[c.op] ?? c.op} ${showValue(c.value)}`;
}

function stepText(step: RuleSet['steps'][number]): string {
  if (!step.filter) return 'Every cell not matched by an earlier group';
  const joiner = step.filter.mode === 'any' ? ' OR ' : ' AND ';
  return step.filter.conditions.map(conditionText).join(joiner) + (step.action === 'drop' ? '  → rejected' : '');
}

function ruleColumns(rules: RuleSet): string[] {
  const cols: string[] = [];
  for (const step of rules.steps) for (const c of step.filter?.conditions ?? []) if (c.col && !cols.includes(c.col)) cols.push(c.col);
  return cols;
}

function RuleDetails({ rules }: { rules: RuleSet }) {
  const [all, setAll] = useState(false);
  const LIMIT = 5;
  const shown = all ? rules.steps : rules.steps.slice(0, LIMIT);
  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">Rule details</h3>
        <StatusPill tone="info">Admin access</StatusPill>
      </div>
      <p className="text-sm font-medium leading-[1.4] text-genie-text">Columns used: {ruleColumns(rules).join(', ') || '—'}</p>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left leading-[1.4]">
          <thead>
            <tr className="text-sm font-medium text-genie-text-secondary">
              <th className="w-24 py-2 pr-4 font-medium">Group</th>
              <th className="py-2 font-medium">Condition</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((step, k) => (
              <tr key={k} className="border-t border-genie-border text-genie-text">
                <td className="py-2 pr-4 align-top text-sm font-medium">{String(step.name)}</td>
                <td className="py-2 text-base">{stepText(step)}</td>
              </tr>
            ))}
            {rules.steps.length > LIMIT && (
              <tr className="border-t border-genie-border text-genie-text">
                <td className="py-2 pr-4 text-sm font-medium">…</td>
                <td className="py-2 text-base">
                  <button type="button" onClick={() => setAll((v) => !v)} className="text-genie-primary underline-offset-2 hover:underline">
                    {all ? 'Show fewer groups' : `${rules.steps.length - LIMIT} more groups`}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
    <div className="flex flex-col gap-3 rounded-genie-md border border-genie-border bg-genie-surface p-4 leading-[1.4]">
      <div>
        <p className="text-base font-semibold text-genie-text">{label}</p>
        <p className="text-xs text-genie-text-secondary">{description}</p>
      </div>

      {published ? (
        <div className="flex flex-col gap-1 rounded-genie-md bg-genie-muted p-3 text-xs text-genie-text-secondary">
          <div>
            <StatusPill tone="success">Live: {published.file_name}</StatusPill>
          </div>
          {publishedRules && <p>{summarizeRules(publishedRules)}</p>}
          <p>
            Published {formatDate(published.uploaded_at)}
            {published.uploaded_by_email && ` by ${published.uploaded_by_email}`}
          </p>
          <button type="button" onClick={() => setShowText((v) => !v)} className="self-start text-genie-primary underline-offset-2 hover:underline">
            {showText ? 'Hide rules' : 'View rules'}
          </button>
        </div>
      ) : (
        <div>
          <StatusPill tone="warning">No rules published yet. Operators cannot process {label} reports.</StatusPill>
        </div>
      )}
      {showText && published && (
        <pre className="max-h-64 overflow-auto rounded-genie-md border border-genie-border bg-genie-surface p-3 text-xs">{published.yaml_text}</pre>
      )}

      <FilePicker
        accept=".yaml,.yml"
        onFile={onFile}
        label={draft ? <span className="font-medium text-genie-text">{draft.fileName}</span> : `Upload new ${label} rules (.yaml)`}
      />

      {draft && (
        <div className="flex flex-col gap-2">
          <IssueList title="These rules are invalid and cannot be published" issues={draft.parsed.errors} tone="error" />
          <IssueList title="Warnings" issues={draft.parsed.warnings} tone="warn" />
          {draft.parsed.rules && <p className="text-xs text-genie-success-fg">Valid · {summarizeRules(draft.parsed.rules)}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={publish} disabled={!draft.parsed.rules || busy} className="genie-btn-primary">
              {busy ? 'Publishing…' : `Publish for ${label}`}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className="genie-btn-secondary">
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
  /** Chemistries that accept per-cell reports, e.g. "LFP". */
  const perCellLabel = CHEMISTRIES.filter((c) => c.perCellReports)
    .map((c) => c.label)
    .join(' / ');

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
      if (chem && !chem.perCellReports) {
        setError(
          `${chem.label} takes one grading-machine export. Per-cell reports are only processed as ${perCellLabel}: select ${perCellLabel} in step 1.`,
        );
      }
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
    <button
      type="button"
      onClick={reloadRules}
      disabled={reloading || busy}
      className="text-sm text-genie-primary underline-offset-2 hover:underline disabled:opacity-50"
    >
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
      <section className="genie-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="genie-card-title">1 · Select grouping rules</h3>
          {reloadButton}
        </div>
        <p className="text-sm leading-[1.4] text-genie-text-secondary">
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

  // "Unassigned" = cells labelled by a catch-all step (no filter) or by no step at all.
  const catchAll = new Set((result?.rules.steps ?? []).filter((st) => st.filter === null).map((st) => String(st.name)));
  const isUnassigned = (g: GroupSummary) => g.label === null || (g.steps.length > 0 && g.steps.every((st) => catchAll.has(String(st))));
  const unassignedCount = kept.filter(isUnassigned).reduce((n, g) => n + g.rows.length, 0);
  const assigned = kept.filter((g) => !isUnassigned(g)).sort((a, b) => b.rows.length - a.rows.length);
  const tableRows = result
    ? [
        ...assigned.map((g) => ({ label: labelText(g.label), count: g.rows.length, tone: 'normal' as const })),
        ...kept.filter(isUnassigned).map((g) => ({ label: labelText(g.label), count: g.rows.length, tone: 'unassigned' as const })),
        ...(result.rejectedRows.length ? [{ label: 'Rejected', count: result.rejectedRows.length, tone: 'rejected' as const }] : []),
      ]
    : [];
  const total = result?.frame.length || 1;
  const fileCaption = perCell
    ? `${perCell.length} per-cell report${perCell.length === 1 ? '' : 's'}`
    : workbook && workbook.sheetNames.length > 1
      ? `Excel workbook · ${workbook.sheetNames.length} sheets`
      : '';
  const rulesUsed = resultInfo
    ? advanced
      ? `${resultInfo.chemistry} / ${resultInfo.rules.file_name} / published ${formatDate(resultInfo.rules.uploaded_at)}`
      : resultInfo.chemistry
    : '';

  return (
    <>
      {/* 1 · Select grouping rules */}
      <section className="genie-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="genie-card-title">1 · Select grouping rules</h3>
          {reloadButton}
        </div>
        <div className="flex flex-wrap gap-4">
          <SelectField
            label="Choose cell chemistry"
            value={chemistry}
            onChange={(v) => {
              setChemistry(v);
              clearResult();
              setError('');
            }}
            className="max-w-[calc(50%-8px)] basis-64"
          >
            <option value="" disabled>
              Select…
            </option>
            {CHEMISTRIES.map((c) => (
              <option key={c.id} value={c.id} disabled={!published[c.id]}>
                {c.label} · {c.description}
                {published[c.id] ? '' : ' (not available yet)'}
              </option>
            ))}
          </SelectField>
        </div>
        {advanced && parsed?.rules && rules && (
          <div className="flex flex-wrap gap-4">
            <Kpi
              label="Groups defined"
              value={parsed.rules.steps.length}
              caption={parsed.rules.steps
                .map((st) => String(st.name))
                .slice(0, 8)
                .join(', ')
                .concat(parsed.rules.steps.length > 8 ? ', …' : '')}
            />
            <Kpi label="Saved" value={new Date(rules.uploaded_at).toISOString().slice(0, 10)} caption={rules.file_name} />
          </div>
        )}
        {parsed && parsed.errors.length > 0 && (
          <IssueList
            title={`The published ${chem?.label} rules are invalid. Ask an administrator to publish a corrected file.`}
            issues={parsed.errors}
            tone="error"
          />
        )}
      </section>

      {advanced && parsed?.rules && <RuleDetails rules={parsed.rules} />}

      {/* 2 · Upload grading file */}
      <section className="genie-card">
        <h3 className="genie-card-title">2 · Upload grading file</h3>
        {/* Several files can always be selected, whatever is chosen in step 1; Assign groups checks the combination. */}
        {dataName ? (
          <div className="flex flex-wrap items-center gap-3 rounded-genie-md bg-genie-muted p-4 leading-[1.4]">
            <p className="text-sm font-medium text-genie-text">{dataName}</p>
            {fileCaption && <p className="text-xs text-genie-text-secondary">{fileCaption}</p>}
            {result && (
              <p className="text-xs text-genie-text-secondary">
                {result.frame.length} cells · {result.frame.columns.length} columns
              </p>
            )}
            <span className="h-2 min-w-px flex-1" aria-hidden="true" />
            {result &&
              (missing.length === 0 ? (
                <StatusPill tone="success">All rule columns found</StatusPill>
              ) : (
                <StatusPill tone="warning">
                  {missing.length} rule column{missing.length === 1 ? '' : 's'} missing
                </StatusPill>
              ))}
            <FilePicker
              accept={advanced || !chem || chem.perCellReports ? '.xlsx,.xls,.csv' : '.xlsx,.xls'}
              multiple
              onFiles={onDataFiles}
              className="cursor-pointer text-sm text-genie-primary underline-offset-2 hover:underline"
              label="Replace"
            />
          </div>
        ) : (
          <FilePicker
            accept={advanced || !chem || chem.perCellReports ? '.xlsx,.xls,.csv' : '.xlsx,.xls'}
            multiple
            onFiles={onDataFiles}
            label={
              <>
                <span className="text-base font-medium text-genie-text">
                  {!chem || chem.perCellReports ? 'Choose the grading file(s)' : 'Choose the raw grading-machine export'}
                </span>
                <span className="text-xs">
                  {!chem || chem.perCellReports
                    ? `One machine export (.xlsx / .xls), or all ${chem?.label ?? perCellLabel} per-cell reports at once (Ctrl+A / Shift+click)`
                    : advanced
                      ? '.xlsx / .xls (.csv for testing)'
                      : '.xlsx / .xls'}
                </span>
              </>
            }
          />
        )}
        {advanced && (
          <div className="flex flex-wrap items-end gap-4">
            {workbook && workbook.sheetNames.length > 1 && (
              <SelectField
                label="Sheet"
                value={sheetName}
                onChange={(v) => {
                  setSheetName(v);
                  clearResult();
                }}
                className="max-w-xs basis-48"
              >
                <option value="">Auto-detect</option>
                {workbook.sheetNames.map((sh) => (
                  <option key={sh}>{sh}</option>
                ))}
              </SelectField>
            )}
            <label className="flex max-w-xs basis-48 flex-col gap-1">
              <span className="genie-label">Group column</span>
              <input
                value={groupCol}
                onChange={(e) => {
                  setGroupCol(e.target.value);
                  clearResult();
                }}
                className="genie-field"
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={run} disabled={!canRun} className="genie-btn-primary">
            {busy ? 'Assigning…' : 'Assign groups'}
          </button>
          <p className="text-xs leading-[1.4] text-genie-text-secondary">
            {!canRun && !busy
              ? !chemistry && !workbook && !perCell
                ? 'Select LFP or NMC and upload the grading file.'
                : !chemistry
                  ? 'Select LFP or NMC.'
                  : !workbook && !perCell
                    ? 'Upload the grading file.'
                    : ''
              : `Group column: ${groupCol.trim() || DEFAULT_GROUP_COL}`}
          </p>
        </div>
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

      {/* 3 · Result */}
      {result && resultInfo && (
        <section className="genie-card">
          <h3 className="genie-card-title">3 · Result</h3>
          <p className="text-xs leading-[1.4] text-genie-text-secondary">Rules used: {rulesUsed}</p>

          {resultInfo.conversion && (
            <div className="flex flex-col gap-3 rounded-genie-md bg-genie-muted p-4 leading-[1.4]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-genie-text">
                  <span className="font-medium">Per-cell reports:</span> {resultInfo.conversion.batch.reports.length} read ·{' '}
                  <span className="text-genie-success-fg">{resultInfo.conversion.batch.converted} converted</span> ·{' '}
                  <span className={resultInfo.conversion.batch.failed ? 'text-genie-danger-fg' : ''}>
                    {resultInfo.conversion.batch.failed} not converted
                  </span>
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <button type="button" onClick={exportBatchXlsx} className="text-genie-primary underline-offset-2 hover:underline">
                    Download batch (.xlsx, machine layout)
                  </button>
                  <button type="button" onClick={exportBatchCsv} className="text-genie-primary underline-offset-2 hover:underline">
                    Download batch (.csv)
                  </button>
                </div>
              </div>
              {resultInfo.conversion.batch.failed > 0 && (
                <div className="overflow-auto">
                  <p className="mb-1 text-xs text-genie-text-secondary">
                    Not converted (these cells have empty values and are grouped as unmatched):
                  </p>
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-genie-text-secondary">
                        <th className="py-1 pr-4 font-medium">cell No.</th>
                        <th className="py-1 pr-4 font-medium">File</th>
                        <th className="py-1 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultInfo.conversion.batch.reports
                        .filter((r) => r.error !== null)
                        .map((r) => (
                          <tr key={r.cellNo} className="border-t border-genie-border">
                            <td className="py-1 pr-4">{r.cellNo}</td>
                            <td className="py-1 pr-4">{r.fileName}</td>
                            <td className="py-1 text-genie-danger-fg">{r.error}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {resultInfo.preprocessed && (
            <div className="flex flex-wrap items-center gap-3 text-xs leading-[1.4] text-genie-text-secondary">
              <span>
                {resultInfo.preprocessed.sheetCount > 1 && `Sheet "${resultInfo.preprocessed.sheetName}" used. `}Converted to CSV: first{' '}
                {resultInfo.preprocessed.pre.skipRows} row(s) removed
                {resultInfo.preprocessed.pre.header ? `, header replaced (${resultInfo.preprocessed.pre.header.length} columns)` : ''}
                {resultInfo.preprocessed.pre.dropRows.length > 0 &&
                  `, ${resultInfo.preprocessed.droppedRows} cell(s) removed by the rules' drop_rows filter`}
                .
              </span>
              {advanced && (
                <button type="button" onClick={exportPreprocessed} className="text-genie-primary underline-offset-2 hover:underline">
                  Download preprocessed CSV
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <Kpi
              label="Cells"
              value={result.frame.length}
              caption={excluded > 0 ? `${dataName} · ${excluded} excluded by drop_unmatched` : dataName}
            />
            <Kpi label="Groups found" value={assigned.length} caption={advanced ? `of ${result.rules.steps.length} defined` : ' '} />
            <Kpi label="Unassigned" value={unassignedCount} caption="Outside every range – review" />
            <Kpi label="Rejected" value={result.rejectedRows.length} caption="Removed by a rejection rule – review" />
          </div>

          {/* Group table with share-of-file bars */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left leading-[1.4]">
              <thead>
                <tr className="text-sm font-medium text-genie-text-secondary">
                  <th className="w-[120px] pb-3 pr-4 font-medium">Group</th>
                  <th className="w-[80px] pb-3 pr-4 font-medium">Cells</th>
                  <th className="pb-3 font-medium">Share of file</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${row.tone}-${row.label}`} className="border-t border-genie-border">
                    <td
                      className={`py-2 pr-4 text-sm font-medium ${
                        row.tone === 'unassigned' ? 'text-genie-warning-fg' : row.tone === 'rejected' ? 'text-genie-danger-fg' : 'text-genie-text'
                      }`}
                    >
                      {row.label}
                    </td>
                    <td className="py-2 pr-4 text-base text-genie-text">{row.count}</td>
                    <td className="py-2">
                      <div
                        className={`h-3 rounded-[3px] ${
                          row.tone === 'unassigned' ? 'bg-genie-warning-border' : row.tone === 'rejected' ? 'bg-genie-danger' : 'bg-genie-primary'
                        }`}
                        style={{ width: `max(4px, ${(row.count / total) * 100}%)` }}
                        title={`${((row.count / total) * 100).toFixed(1)} %`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={exportCsv} title="Same content as the CSV written by categorize_csv.py" className="genie-btn-secondary">
              Download grouped CSV
            </button>
            <button onClick={exportExcel} className="genie-btn-secondary">
              Download Excel
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold leading-[1.4] text-genie-text">Cells by group</p>
            <div className="flex flex-wrap gap-2">
              {tabs.map((t, idx) => (
                <button
                  key={`${t.label}-${idx}`}
                  onClick={() => setActiveGroup(idx)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeGroup === idx
                      ? t.rejected
                        ? 'bg-genie-danger text-white'
                        : 'bg-genie-primary text-white'
                      : 'bg-genie-muted text-genie-text-secondary hover:text-genie-text'
                  }`}
                >
                  {t.label} <span className="opacity-70">({t.rows.length})</span>
                </button>
              ))}
            </div>
            {tabs[activeGroup] && <RowsTable result={result} rows={tabs[activeGroup].rows} />}
          </div>
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
    return <p className="text-sm text-genie-text-secondary">You do not have access to Cell Grouping. Ask an administrator for the Operator role.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {loading && <p className="text-sm text-genie-text-secondary">Loading grouping rules…</p>}
      {loadError && (
        <IssueList
          title="Could not load the grouping rules"
          issues={[{ path: '', message: `${loadError}. If this is a new setup, run database/19_add_cell_grouping.sql in Supabase.` }]}
          tone="error"
        />
      )}

      {!loading && !loadError && canProcessReports && <ReportProcessor published={published} advanced={canManageRules} reload={reload} />}

      {!loading && !loadError && canManageRules && (
        <section className="genie-card">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="genie-card-title">Grouping rules</h3>
            <StatusPill tone="info">Admin only</StatusPill>
          </div>
          <p className="text-xs leading-[1.4] text-genie-text-secondary">
            Each upload is validated, then published as a new version. Operators always use the latest version.
          </p>
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
    </div>
  );
}
