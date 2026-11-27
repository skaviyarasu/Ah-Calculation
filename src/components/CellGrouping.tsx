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
  isUnassignedGroup,
  labelText,
  missingRuleColumns,
  parseRules,
  machineSheetRows,
  preprocessExcel,
  preprocessSheetRows,
  PyFloat,
  rawFilesZip,
  readCsv,
  readReportInputs,
  readWorkbook,
  resultToCsv,
  summarizeGroups,
  summarizeRun,
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
  RunSummary,
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
  /** Office-network restriction (database/20_cell_grouping_office_network.sql). Optional. */
  officeNetwork?: OfficeNetworkApi;
  /** Saves each successful run in the grading history (database/21_cell_grouping_runs.sql). Optional. */
  recordRun?: (run: RunRecord) => Promise<unknown>;
}

/** One successful run, as saved in the grading history. */
export interface RunRecord {
  chemistry: string;
  rulesId: string;
  rulesFileName: string;
  inputKind: 'machine_export' | 'per_cell_reports' | 'csv';
  inputFileName: string;
  inputFileCount: number;
  inputFileNames?: string[];
  cellsRead: number;
  cellsRemoved: number;
  cellsNotConverted: number;
  summary: RunSummary;
  inputFile: { name: string; data: Uint8Array | string; type: string };
  reportFile: { name: string; data: string; type: string };
  /** LFP per-cell reports: the raw per-channel files exactly as uploaded, as one ZIP. */
  rawInputFile?: { name: string; data: Uint8Array; type: string };
}

export interface OfficeStatus {
  /** At least one office IP is listed, i.e. the restriction is switched on. */
  configured: boolean;
  fromOffice: boolean;
  isAdmin: boolean;
  /** Public IP the database sees for this browser. */
  clientIp: string | null;
  /** Admins only: IP-related request headers the database receives (to verify detection). */
  ipHeaders?: Record<string, string> | null;
}

export interface OfficeIp {
  ip_range: string;
  label: string | null;
  created_at: string;
}

export interface OfficeNetworkApi {
  /** null when the migration is not installed. */
  getStatus: () => Promise<OfficeStatus | null>;
  list: () => Promise<OfficeIp[]>;
  add: (ipRange: string, label: string) => Promise<void>;
  remove: (ipRange: string) => Promise<void>;
  /** Approved devices (database/22_cell_grouping_devices.sql). Optional. */
  devices?: DeviceApi;
}

export type DeviceState = 'unknown' | 'pending' | 'active' | 'rejected' | 'revoked';

export interface DeviceStatus {
  /** false when migration 22 is not installed (no device approval). */
  installed: boolean;
  /** At least one device is approved, i.e. device approval is switched on. */
  approvalOn: boolean;
  status: DeviceState;
  name: string | null;
  problem: string | null;
}

export interface DeviceRow {
  id: string;
  name: string;
  asset_tag: string | null;
  mac_address: string | null;
  status: Exclude<DeviceState, 'unknown'>;
  user_agent: string | null;
  requested_by_email: string | null;
  requested_at: string;
  decided_by_email: string | null;
  decided_at: string | null;
  revoked_by_email: string | null;
  revoked_at: string | null;
}

export interface DeviceApi {
  getStatus: () => Promise<DeviceStatus>;
  request: (name: string) => Promise<string>;
  list: () => Promise<DeviceRow[]>;
  decide: (id: string, action: 'approve' | 'reject' | 'revoke', labels?: { name?: string; assetTag?: string; macAddress?: string }) => Promise<void>;
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
    tone === 'error'
      ? 'border-[rgba(211,47,47,0.4)] bg-[#fdecec] text-genie-danger-fg'
      : 'border-genie-warning-border bg-[#fff6e5] text-genie-warning-fg';
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
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={() => setShowText((v) => !v)} className="text-genie-primary underline-offset-2 hover:underline">
              {showText ? 'Hide rules' : 'View rules'}
            </button>
            <button
              type="button"
              onClick={() => downloadBytes(published.yaml_text, published.file_name || `GroupingRules-${label}.yaml`, 'application/x-yaml;charset=utf-8')}
              title="Saves the live rules exactly as published, e.g. to keep them in the Cell Grouping rules folder"
              className="text-genie-primary underline-offset-2 hover:underline"
            >
              Download rules (.yaml)
            </button>
          </div>
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
  recordRun,
}: {
  published: PublishedMap;
  advanced: boolean;
  /** Fetches the latest published rules (and updates `published`). */
  reload: () => Promise<PublishedMap>;
  recordRun?: (run: RunRecord) => Promise<unknown>;
}) {
  const available = CHEMISTRIES.filter((c) => published[c.id]);
  const [chemistry, setChemistry] = useState<string>('');
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [dataName, setDataName] = useState('');
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  /** Set when the upload is a set of per-cell reports (LFP) instead of one machine export. */
  const [perCell, setPerCell] = useState<ReportInput[] | null>(null);
  /** The per-cell files exactly as uploaded, kept for the grading history. */
  const [perCellRaw, setPerCellRaw] = useState<Array<{ name: string; data: Uint8Array }> | null>(null);
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
  /** Grading-history save of the last run. */
  const [recordState, setRecordState] = useState<{ state: 'saving' | 'saved' | 'failed'; message?: string } | null>(null);

  /** Saves the run in the grading history in the background; never blocks or fails the grouping. */
  const saveRun = (run: RunRecord) => {
    if (!recordRun) return;
    setRecordState({ state: 'saving' });
    recordRun(run)
      .then(() => setRecordState({ state: 'saved' }))
      .catch((e: Error) => setRecordState({ state: 'failed', message: e.message }));
  };

  const rules = chemistry ? published[chemistry] : undefined;
  const parsed = useMemo(() => (rules ? parseRules(rules.yaml_text) : null), [rules]);
  const groups: GroupSummary[] = useMemo(() => (result ? summarizeGroups(result) : []), [result]);
  const chem = CHEMISTRIES.find((c) => c.id === chemistry);
  /** Chemistries that accept per-cell reports, e.g. "LFP". */
  const perCellLabel = CHEMISTRIES.filter((c) => c.perCellReports)
    .map((c) => c.label)
    .join(' / ');

  const clearResult = () => {
    setRecordState(null);
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
      setPerCellRaw(read);
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
    setPerCellRaw(null);
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
        const grouped = applySteps(out.frame, latestParsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL });
        setResult(grouped);
        setResultInfo({ chemistry, rules: latest, conversion: { batch, names: batchPre.header ?? [] } });
        setActiveGroup(0);
        const batchStem = batchFileStem(batch);
        saveRun({
          chemistry,
          rulesId: latest.id,
          rulesFileName: latest.file_name,
          inputKind: 'per_cell_reports',
          inputFileName: dataName,
          inputFileCount: batch.reports.length,
          inputFileNames: batch.reports.map((r) => r.fileName),
          cellsRead: batch.reports.length,
          cellsRemoved: out.droppedRows,
          cellsNotConverted: batch.failed,
          summary: summarizeRun(grouped),
          // the converted batch (machine layout) that was grouped, plus the raw per-channel files as uploaded
          inputFile: { name: `${batchStem}.xlsx`, data: batchToXlsx(batch), type: XLSX_MIME },
          reportFile: { name: `${batchStem}_${chemistry}_categorized.csv`, data: resultToCsv(grouped), type: 'text/csv' },
          rawInputFile: perCellRaw ? { name: `${batchStem}_raw.zip`, data: rawFilesZip(perCellRaw), type: 'application/zip' } : undefined,
        });
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
      const grouped = applySteps(frame, latestParsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL });
      setResult(grouped);
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
      if (fileBytes) {
        const fileStem = dataName.replace(/\.[^.]+$/, '') || 'cells';
        saveRun({
          chemistry,
          rulesId: latest.id,
          rulesFileName: latest.file_name,
          inputKind: isCsv ? 'csv' : 'machine_export',
          inputFileName: dataName,
          inputFileCount: 1,
          cellsRead: frame.length + (preprocessed?.droppedRows ?? 0),
          cellsRemoved: preprocessed?.droppedRows ?? 0,
          cellsNotConverted: 0,
          summary: summarizeRun(grouped),
          inputFile: { name: dataName, data: fileBytes, type: isCsv ? 'text/csv' : XLSX_MIME },
          reportFile: { name: `${fileStem}_${chemistry}_categorized.csv`, data: resultToCsv(grouped), type: 'text/csv' },
        });
      }
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
  const isUnassigned = (g: GroupSummary) => (result ? isUnassignedGroup(result, g) : false);
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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs leading-[1.4] text-genie-text-secondary">Rules used: {rulesUsed}</p>
            {recordState?.state === 'saving' && <span className="text-xs text-genie-text-secondary">Saving to the grading history…</span>}
            {recordState?.state === 'saved' && <StatusPill tone="success">Recorded in the grading history</StatusPill>}
            {recordState?.state === 'failed' && <StatusPill tone="warning">Not recorded in the grading history: {recordState.message}</StatusPill>}
          </div>

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

// ---------------------------------------------------------------------------
// Office network only (Option B): operators outside the office see a notice;
// admins manage the allowed office IPs.
// ---------------------------------------------------------------------------

const IP_OR_RANGE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+:[0-9a-fA-F:.]*)(\/\d{1,3})?$/;

function OfficeOnlyNotice({ status, onRetry }: { status: OfficeStatus; onRetry: () => void }) {
  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">Group cells is available on the office network only</h3>
        <StatusPill tone="warning">Outside the office network</StatusPill>
      </div>
      <p className="text-sm leading-[1.4] text-genie-text-secondary">
        Connect from the office (or through the office VPN) to process grading reports. Your connection: {status.clientIp ?? 'not detected'}.
      </p>
      <div>
        <button type="button" onClick={onRetry} className="genie-btn-secondary">
          Check again
        </button>
      </div>
    </section>
  );
}

function OfficeNetworkCard({ api, status, onChanged }: { api: OfficeNetworkApi; status: OfficeStatus; onChanged: () => void }) {
  const [ips, setIps] = useState<OfficeIp[]>([]);
  const [ipInput, setIpInput] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setIps(await api.list());
    } catch (e) {
      setError(`Could not load the office IPs: ${(e as Error).message}`);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (ip: string, text: string) => {
    const value = ip.trim();
    if (!IP_OR_RANGE.test(value)) {
      setError('Enter an IP address (e.g. 203.0.113.10) or a range (e.g. 203.0.113.0/29).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.add(value, text.trim());
      setIpInput('');
      setLabel('');
      await load();
      onChanged();
    } catch (e) {
      setError(`Could not add ${value}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ipRange: string) => {
    if (
      ips.length === 1 &&
      !window.confirm('Removing the last office IP switches the restriction off: Group cells will work from any network. Continue?')
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api.remove(ipRange);
      await load();
      onChanged();
    } catch (e) {
      setError(`Could not remove ${ipRange}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const myIpListed = status.clientIp !== null && status.fromOffice && status.configured;

  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">Office network</h3>
        <StatusPill tone="info">Admin only</StatusPill>
        {status.configured ? (
          <StatusPill tone="success">On: Group cells works only from these networks</StatusPill>
        ) : (
          <StatusPill tone="warning">Off: Group cells works from any network</StatusPill>
        )}
      </div>
      <p className="text-xs leading-[1.4] text-genie-text-secondary">
        Operators can use Group cells only from the office IPs listed here; administrators are exempt so they can always fix this list.
        {!status.configured && ' Add the office static IP to switch the restriction on.'}
      </p>
      <div className="flex flex-wrap items-center gap-3 rounded-genie-md bg-genie-muted p-4 text-sm leading-[1.4]">
        <span className="font-medium text-genie-text">Your connection: {status.clientIp ?? 'not detected'}</span>
        {status.configured &&
          (myIpListed ? <StatusPill tone="success">Office network</StatusPill> : <StatusPill tone="warning">Not an office IP</StatusPill>)}
        {status.clientIp && !myIpListed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => add(status.clientIp!, 'Added from Group cells')}
            className="text-genie-primary underline-offset-2 hover:underline"
          >
            Add this IP as an office IP
          </button>
        )}
        {!status.clientIp && (
          <span className="text-xs text-genie-warning-fg">
            The database could not detect your IP, so the restriction would block operators. Do not switch it on yet.
          </span>
        )}
      </div>
      {status.ipHeaders && (
        <details className="text-xs text-genie-text-secondary">
          <summary className="cursor-pointer">How the database sees your connection</summary>
          <pre className="mt-2 overflow-auto rounded-genie-md border border-genie-border bg-genie-surface p-3">
            {JSON.stringify(status.ipHeaders, null, 2)}
          </pre>
        </details>
      )}
      {ips.length > 0 && (
        <table className="w-full text-left leading-[1.4]">
          <thead>
            <tr className="text-sm font-medium text-genie-text-secondary">
              <th className="py-2 pr-4 font-medium">IP / range</th>
              <th className="py-2 pr-4 font-medium">Label</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {ips.map((row) => (
              <tr key={row.ip_range} className="border-t border-genie-border text-genie-text">
                <td className="py-2 pr-4 text-sm font-medium">{row.ip_range}</td>
                <td className="py-2 pr-4 text-sm">{row.label ?? ''}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(row.ip_range)}
                    className="text-sm text-genie-danger-fg underline-offset-2 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex max-w-xs basis-56 flex-col gap-1">
          <span className="genie-label">Office IP or range</span>
          <input value={ipInput} onChange={(e) => setIpInput(e.target.value)} placeholder="203.0.113.10" className="genie-field" />
        </label>
        <label className="flex max-w-sm basis-64 flex-col gap-1">
          <span className="genie-label">Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Namakkal plant - main line" className="genie-field" />
        </label>
        <button type="button" disabled={busy || !ipInput.trim()} onClick={() => add(ipInput, label)} className="genie-btn-primary">
          Add office IP
        </button>
      </div>
      {error && <IssueList title="Office network" issues={[{ path: '', message: error }]} tone="error" />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Approved devices: notice for unapproved devices, admin approval card
// ---------------------------------------------------------------------------

function DeviceNotice({ api, status, onChanged }: { api: DeviceApi; status: DeviceStatus; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canRequest = status.status === 'unknown' || status.status === 'revoked' || status.status === 'rejected';

  const request = async () => {
    setBusy(true);
    setError('');
    try {
      await api.request(name.trim());
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    status.status === 'pending'
      ? 'Waiting for administrator approval'
      : status.status === 'revoked'
        ? 'Access for this device was revoked'
        : status.status === 'rejected'
          ? 'The request for this device was rejected'
          : 'This device is not approved for Group cells';

  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">{title}</h3>
        <StatusPill tone={status.status === 'pending' ? 'info' : 'warning'}>
          {status.status === 'pending' ? 'Pending approval' : 'Device not approved'}
        </StatusPill>
      </div>
      <p className="text-sm leading-[1.4] text-genie-text-secondary">
        {status.status === 'pending'
          ? `This device${status.name ? ` ("${status.name}")` : ''} has asked for access. An administrator approves it in Group cells → Approved devices.`
          : 'Group cells works only on devices approved by an administrator. Give this device a name and request access.'}
      </p>
      {canRequest && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex max-w-sm basis-72 flex-col gap-1">
            <span className="genie-label">Device name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grading station 1" className="genie-field" />
          </label>
          <button type="button" disabled={busy || !name.trim()} onClick={request} className="genie-btn-primary">
            {busy ? 'Requesting…' : status.status === 'unknown' ? 'Request access' : 'Request access again'}
          </button>
        </div>
      )}
      {status.status === 'pending' && (
        <div>
          <button type="button" onClick={onChanged} className="genie-btn-secondary">
            Check again
          </button>
        </div>
      )}
      {error && <IssueList title="Request failed" issues={[{ path: '', message: error }]} tone="error" />}
    </section>
  );
}

const DEVICE_TONE: Record<DeviceRow['status'], PillTone> = { pending: 'info', active: 'success', rejected: 'danger', revoked: 'warning' };
const DEVICE_LABEL: Record<DeviceRow['status'], string> = { pending: 'Pending', active: 'Active', rejected: 'Rejected', revoked: 'Revoked' };

function PendingDeviceRow({
  row,
  busy,
  onDecide,
}: {
  row: DeviceRow;
  busy: boolean;
  onDecide: (action: 'approve' | 'reject', labels?: { name: string; assetTag: string; macAddress: string }) => void;
}) {
  const [name, setName] = useState(row.name);
  const [assetTag, setAssetTag] = useState('');
  const [macAddress, setMacAddress] = useState('');
  return (
    <div className="flex flex-col gap-3 rounded-genie-md border border-genie-info-border bg-genie-info-bg p-4 text-sm leading-[1.4]">
      <p className="text-genie-text">
        <span className="font-medium">{row.name}</span> · requested by {row.requested_by_email ?? '—'} on {formatDate(row.requested_at)}
      </p>
      {row.user_agent && (
        <p className="truncate text-xs text-genie-text-secondary" title={row.user_agent}>
          {row.user_agent}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex basis-56 flex-col gap-1">
          <span className="genie-label">Device name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="genie-field" />
        </label>
        <label className="flex basis-40 flex-col gap-1">
          <span className="genie-label">Asset tag (label)</span>
          <input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="DM-PC-014" className="genie-field" />
        </label>
        <label className="flex basis-48 flex-col gap-1">
          <span className="genie-label">MAC address (label)</span>
          <input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="3C:52:82:1A:9F:07" className="genie-field" />
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => onDecide('approve', { name, assetTag, macAddress })}
          className="genie-btn-primary"
        >
          Approve
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide('reject')} className="genie-btn-secondary">
          Reject
        </button>
      </div>
    </div>
  );
}

function DevicesCard({ api, status, onChanged }: { api: DeviceApi; status: DeviceStatus; onChanged: () => void }) {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [myName, setMyName] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.list());
    } catch (e) {
      setError(`Could not load the devices: ${(e as Error).message}`);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeCount = rows.filter((r) => r.status === 'active').length;
  const decide = (row: DeviceRow, action: 'approve' | 'reject' | 'revoke', labels?: { name?: string; assetTag?: string; macAddress?: string }) => {
    if (
      action === 'approve' &&
      activeCount === 0 &&
      !window.confirm(
        'Approving the first device switches device approval on: from then on Group cells works only on approved devices (administrators exempt). Continue?',
      )
    )
      return;
    if (
      action === 'revoke' &&
      !window.confirm(`Revoke "${row.name}"? It is blocked at once and needs a new request and approval to get access again.`)
    )
      return;
    if (action === 'reject' && !window.confirm(`Reject the request for "${row.name}"?`)) return;
    act(() => api.decide(row.id, action, labels));
  };

  const pending = rows.filter((r) => r.status === 'pending');
  const others = rows.filter((r) => r.status !== 'pending');

  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">Approved devices</h3>
        <StatusPill tone="info">Admin only</StatusPill>
        {status.approvalOn ? (
          <StatusPill tone="success">On: Group cells works only on approved devices</StatusPill>
        ) : (
          <StatusPill tone="warning">Off until the first device is approved</StatusPill>
        )}
      </div>
      <p className="text-xs leading-[1.4] text-genie-text-secondary">
        Operators request access from the device they use; you approve it here. Revoking is immediate and final: the device must request again and be
        approved again. Approved devices still work only from the office network. MAC address and asset tag are labels for your records and the
        firewall list.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-genie-md bg-genie-muted p-4 text-sm leading-[1.4]">
        <span className="font-medium text-genie-text">
          This browser: {status.status === 'unknown' ? 'not registered' : `${DEVICE_LABEL[status.status]}${status.name ? ` ("${status.name}")` : ''}`}
        </span>
        {(status.status === 'unknown' || status.status === 'revoked' || status.status === 'rejected') && (
          <>
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="Device name, e.g. Grading station 1"
              className="genie-field h-10 max-w-xs"
            />
            <button
              type="button"
              disabled={busy || !myName.trim()}
              onClick={() => act(() => api.request(myName.trim()))}
              className="text-genie-primary underline-offset-2 hover:underline disabled:opacity-40"
            >
              Request approval for this browser
            </button>
          </>
        )}
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-base font-semibold leading-[1.4] text-genie-text">Waiting for approval ({pending.length})</p>
          {pending.map((row) => (
            <PendingDeviceRow key={row.id} row={row} busy={busy} onDecide={(action, labels) => decide(row, action, labels)} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm leading-[1.4]">
            <thead>
              <tr className="text-genie-text-secondary">
                {['Device', 'Asset tag', 'MAC (label)', 'Requested by', 'Status', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap py-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {others.map((row) => (
                <tr key={row.id} className="border-t border-genie-border text-genie-text">
                  <td className="py-2 pr-4 font-medium">{row.name}</td>
                  <td className="py-2 pr-4">{row.asset_tag ?? '—'}</td>
                  <td className="py-2 pr-4">{row.mac_address ?? '—'}</td>
                  <td className="py-2 pr-4">{row.requested_by_email ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <StatusPill tone={DEVICE_TONE[row.status]}>{DEVICE_LABEL[row.status]}</StatusPill>
                    <span className="ml-2 text-xs text-genie-text-secondary">
                      {row.status === 'revoked'
                        ? `${row.revoked_at ? formatDate(row.revoked_at) : ''}${row.revoked_by_email ? ` by ${row.revoked_by_email}` : ''}`
                        : `${row.decided_at ? formatDate(row.decided_at) : ''}${row.decided_by_email ? ` by ${row.decided_by_email}` : ''}`}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {row.status === 'active' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decide(row, 'revoke')}
                        className="text-genie-danger-fg underline-offset-2 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!rows.length && <p className="text-sm text-genie-text-secondary">No device has requested access yet.</p>}
      {error && <IssueList title="Approved devices" issues={[{ path: '', message: error }]} tone="error" />}
    </section>
  );
}

export default function CellGrouping({ canManageRules, canProcessReports, loadRules, publishRules, officeNetwork, recordRun }: CellGroupingProps) {
  const [published, setPublished] = useState<PublishedMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [office, setOffice] = useState<OfficeStatus | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);

  const checkOffice = useCallback(async () => {
    if (!officeNetwork) return;
    setOffice(await officeNetwork.getStatus());
    if (officeNetwork.devices) {
      try {
        setDevice(await officeNetwork.devices.getStatus());
      } catch {
        setDevice(null);
      }
    }
  }, [officeNetwork]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await checkOffice();
      setPublished(await loadRules());
    } catch (e) {
      if ((e as { accessProblem?: string }).accessProblem) {
        setPublished({});
        await checkOffice().catch(() => undefined);
      } else setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadRules, checkOffice]);

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
      if (document.visibilityState === 'visible') {
        checkOffice().catch(() => undefined);
        reload().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload, checkOffice]);

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

      {!loading && !loadError && canProcessReports && office && !office.isAdmin && !office.fromOffice ? (
        <OfficeOnlyNotice status={office} onRetry={refresh} />
      ) : !loading &&
        !loadError &&
        canProcessReports &&
        officeNetwork?.devices &&
        device?.installed &&
        !office?.isAdmin &&
        device.approvalOn &&
        device.status !== 'active' ? (
        <DeviceNotice api={officeNetwork.devices} status={device} onChanged={refresh} />
      ) : (
        !loading &&
        !loadError &&
        canProcessReports && <ReportProcessor published={published} advanced={canManageRules} reload={reload} recordRun={recordRun} />
      )}

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
      {!loading && !loadError && canManageRules && officeNetwork && office && (
        <OfficeNetworkCard api={officeNetwork} status={office} onChanged={() => checkOffice().catch(() => undefined)} />
      )}
      {!loading && !loadError && canManageRules && officeNetwork?.devices && device?.installed && (
        <DevicesCard api={officeNetwork.devices} status={device} onChanged={() => checkOffice().catch(() => undefined)} />
      )}
    </div>
  );
}
