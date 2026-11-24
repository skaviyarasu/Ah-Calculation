import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applySteps,
  CHEMISTRIES,
  DEFAULT_GROUP_COL,
  exportResults,
  labelText,
  missingRuleColumns,
  parseRules,
  readCsv,
  readWorkbook,
  resultToCsv,
  summarizeGroups,
} from '../lib/cellGrouping/index.ts';
import type { Cell, GroupingResult, GroupSummary, NormalizeResult, PublishedRules, Workbook } from '../lib/cellGrouping/index.ts';

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

function FilePicker({ label, accept, onFile }: { label: React.ReactNode; accept: string; onFile: (f: File) => void }) {
  return (
    <label className={dropZone}>
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
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
  const publishedSteps = useMemo(() => (published ? parseRules(published.yaml_text).rules?.steps.length : undefined), [published]);

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
          <p className="font-medium">
            Live: {published.file_name}
            {publishedSteps !== undefined && ` · ${publishedSteps} steps`}
          </p>
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
          {draft.parsed.rules && (
            <p className="text-xs text-emerald-700">
              Valid · {draft.parsed.rules.steps.length} steps · default_action: {draft.parsed.rules.defaultAction}
            </p>
          )}
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
function ReportProcessor({ published, advanced }: { published: PublishedMap; advanced: boolean }) {
  const available = CHEMISTRIES.filter((c) => published[c.id]);
  const [chemistry, setChemistry] = useState<string>('');
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [dataName, setDataName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [groupCol, setGroupCol] = useState(DEFAULT_GROUP_COL);
  const [result, setResult] = useState<GroupingResult | null>(null);
  const [resultInfo, setResultInfo] = useState<{ chemistry: string; rules: PublishedRules } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState(0);

  const rules = chemistry ? published[chemistry] : undefined;
  const parsed = useMemo(() => (rules ? parseRules(rules.yaml_text) : null), [rules]);
  const groups: GroupSummary[] = useMemo(() => (result ? summarizeGroups(result) : []), [result]);
  const chem = CHEMISTRIES.find((c) => c.id === chemistry);

  const clearResult = () => {
    setResult(null);
    setResultInfo(null);
    setMissing([]);
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
      setDataName(file.name);
      setSheetName(wb.sheetNames[0] ?? '');
    } catch (e) {
      setWorkbook(null);
      setDataName('');
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
    }
  };

  const run = () => {
    setError('');
    clearResult();
    if (!parsed?.rules || !rules || !workbook) return;
    try {
      const frame = workbook.sheet(sheetName || undefined);
      setMissing(missingRuleColumns(parsed.rules, frame));
      setResult(applySteps(frame, parsed.rules, { groupCol: groupCol.trim() || DEFAULT_GROUP_COL }));
      setResultInfo({ chemistry, rules });
      setActiveGroup(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const stem = dataName.replace(/\.[^.]+$/, '') || 'cells';
  const exportExcel = () => {
    if (!result || !resultInfo) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    downloadBytes(exportResults(result, resultInfo.rules.yaml_text), `${stem}_${resultInfo.chemistry}_groups_${stamp}.xlsx`);
  };
  /** Same content the Python CLI writes (Windows line endings). */
  const exportCsv = () => {
    if (!result || !resultInfo) return;
    downloadBytes(resultToCsv(result), `${stem}_${resultInfo.chemistry}_categorized.csv`, 'text/csv;charset=utf-8');
  };

  if (!available.length) {
    return (
      <section className="glass-panel p-5">
        <h3 className="font-semibold">Process grading report</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No grouping rules have been published yet. Ask an administrator to publish the LFP / NMC rules.
        </p>
      </section>
    );
  }

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
    <>
      <section className="glass-panel space-y-4 p-5">
        <h3 className="font-semibold">Process grading report</h3>

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
          <p className="text-sm">2. Upload the input file</p>
          <FilePicker
            accept=".csv,.xlsx,.xls"
            onFile={onDataFile}
            label={
              dataName ? (
                <>
                  <span className="font-medium text-foreground">{dataName}</span>
                  <span className="mt-1 text-xs">click to replace</span>
                </>
              ) : (
                'Choose the grading-machine report (.csv / .xlsx / .xls)'
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
            3. Process {chem?.label ?? ''} data
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
            {!chemistry && !workbook
              ? 'Select LFP or NMC and upload the input file.'
              : !chemistry
                ? 'Select LFP or NMC.'
                : !workbook
                  ? 'Upload the input file.'
                  : ''}
          </p>
        )}
        {error && <IssueList title="Processing failed" issues={[{ path: '', message: error }]} tone="error" />}
      </section>

      {result && missing.length > 0 && (
        <IssueList
          title={`The report is missing ${missing.length} column(s) that the ${resultInfo?.chemistry} rules use, so those conditions never match. Is this the right chemistry?`}
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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
            : 'Select LFP or NMC, upload the input file and process it. The matching rules are applied automatically.'}
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

      {!loading && !loadError && canProcessReports && <ReportProcessor published={published} advanced={canManageRules} />}
    </div>
  );
}
