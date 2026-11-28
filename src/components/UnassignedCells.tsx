import React, { useMemo, useState } from 'react';
import {
  applySuggestions,
  CHEMISTRIES,
  compareRules,
  parseRules,
  readCsv,
  reportGroupColumn,
  suggestSteps,
  unassignedCells,
  validateProposal,
} from '../lib/cellGrouping/index.ts';
import type { PublishedRules, RulesComparison, RunReport, Suggestion, UnassignedCell, ValidationReport } from '../lib/cellGrouping/index.ts';
import type { GradingRun } from './GradingHistory';
import iconChevronDown from '../assets/genie/icon-chevron-down.svg';

type PublishedMap = Record<string, PublishedRules | undefined>;

export interface UnassignedCellsProps {
  /** Runs, newest first (admins only). Dates are ISO strings. */
  listRuns: (filters: { from?: string; to?: string; chemistry?: string }) => Promise<GradingRun[]>;
  /** A saved run file as text (the grouped report CSV). */
  runFileText: (path: string) => Promise<string>;
  /** Newest published rules per chemistry. */
  loadRules: () => Promise<PublishedMap>;
  /** Publishes a new version for one chemistry. Missing = the user may not publish. */
  publishRules?: (chemistry: string, fileName: string, yamlText: string) => Promise<unknown>;
}

/** Reports downloaded at once, and at most per load. */
const PARALLEL = 4;
const MAX_RUNS = 300;

const formatDate = (iso: string) => new Date(iso).toLocaleString();

function Kpi({ label, value, caption }: { label: string; value: React.ReactNode; caption?: string }) {
  return (
    <div className="genie-kpi">
      <p className="text-sm font-medium text-genie-text-secondary">{label}</p>
      <p className="truncate text-[28px] font-semibold text-genie-text">{value}</p>
      <p className="min-h-[17px] truncate text-xs text-genie-text-secondary">{caption ?? ''}</p>
    </div>
  );
}

/** Saves text as a file through the browser (it goes to the Downloads folder or where the user picks). */
function downloadText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** "GroupingRules-LFP.yaml" → "GroupingRules-LFP-2026-11-27.yaml" (the date the proposal was saved). */
function proposalFileName(publishedName: string | undefined, chemistry: string): string {
  const base = (publishedName ?? `GroupingRules-${chemistry}.yaml`).replace(/\.(ya?ml)$/i, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return `${base}-${new Date().toISOString().slice(0, 10)}.yaml`;
}

function ChangeList({ title, tone, items }: { title: string; tone: 'success' | 'danger' | 'muted'; items: ValidationReport['changed'] }) {
  if (!items.length) return null;
  const color = tone === 'success' ? 'text-genie-success-fg' : tone === 'danger' ? 'text-genie-danger-fg' : 'text-genie-text-secondary';
  return (
    <div className="min-w-[260px] flex-1">
      <p className={`mb-1 text-sm font-medium ${color}`}>
        {title} ({items.length})
      </p>
      <div className="max-h-56 overflow-auto rounded-genie-md border border-genie-border">
        <table className="w-full text-left text-xs">
          <tbody>
            {items.map((c, i) => (
              <tr key={i} className="border-t border-genie-border first:border-t-0">
                <td className="px-2 py-1 text-genie-text-secondary">{c.runLabel}</td>
                <td className="px-2 py-1 font-medium">{c.cellId}</td>
                <td className="whitespace-nowrap px-2 py-1">
                  {c.from || 'NA'} → <span className="font-medium">{c.to || 'NA'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepLines({ lines, tone }: { lines: string[]; tone?: string }) {
  return (
    <ul className={`font-mono text-xs leading-[1.5] ${tone ?? ''}`}>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

/** What changes against the published rules, step by step. */
function RulesDiff({ comparison: c }: { comparison: RulesComparison }) {
  if (c.same) return <p className="text-sm text-genie-text-secondary">The proposed rules are the same as the published rules.</p>;
  return (
    <div className="rounded-genie-md border border-genie-border p-4">
      <p className="mb-2 text-sm font-medium">Changes to the published rules</p>
      <div className="flex flex-col gap-3 text-sm">
        {c.added.map((a) => (
          <div key={`a-${a.name}`}>
            <p className="text-genie-success-fg">
              + New group <span className="font-medium">{a.name}</span> (step {a.position})
            </p>
            <StepLines lines={a.lines} />
          </div>
        ))}
        {c.changed.map((ch) => (
          <div key={`c-${ch.name}`}>
            <p className="text-genie-warning-fg">
              ~ Changed <span className="font-medium">{ch.name}</span>
            </p>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-genie-text-secondary">Published</p>
                <StepLines lines={ch.before} tone="text-genie-text-secondary line-through" />
              </div>
              <div>
                <p className="text-xs text-genie-text-secondary">Proposed</p>
                <StepLines lines={ch.after} />
              </div>
            </div>
          </div>
        ))}
        {c.removed.map((r) => (
          <div key={`r-${r.name}`}>
            <p className="text-genie-danger-fg">
              − Removed <span className="font-medium">{r.name}</span>
            </p>
            <StepLines lines={r.lines} tone="text-genie-text-secondary line-through" />
          </div>
        ))}
        {c.reordered && <p className="text-genie-warning-fg">The order of the steps changed: a cell gets the first group it matches.</p>}
        {c.other.map((o) => (
          <p key={o} className="text-genie-warning-fg">
            {o}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function UnassignedCells({ listRuns, runFileText, loadRules, publishRules }: UnassignedCellsProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [chemistry, setChemistry] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runs, setRuns] = useState<RunReport[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [published, setPublished] = useState<PublishedMap>({});
  // workbench
  const [workChem, setWorkChem] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [proposal, setProposal] = useState('');
  const [validation, setValidation] = useState<{ text: string; report: ValidationReport; comparison: RulesComparison | null } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const field = 'genie-field';

  const rulesFor = (chem: string) => {
    const p = published[chem];
    return p ? parseRules(p.yaml_text).rules : undefined;
  };

  const cells: UnassignedCell[] = useMemo(() => {
    if (!runs) return [];
    return [...new Set(runs.map((r) => r.chemistry))].flatMap((chem) => {
      const rules = rulesFor(chem);
      return rules ? unassignedCells(runs.filter((r) => r.chemistry === chem), rules) : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, published]);

  const chemsWithNa = [...new Set(cells.map((c) => c.chemistry))];
  const cellsChecked = runs?.reduce((n, r) => n + r.frame.length, 0) ?? 0;

  const load = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    setValidation(null);
    setSuggestions([]);
    setProgress('Loading runs…');
    try {
      const toExclusive = to ? new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10) : undefined;
      const [list, rules] = await Promise.all([listRuns({ from: from || undefined, to: toExclusive, chemistry: chemistry || undefined }), loadRules()]);
      setPublished(rules);
      // a run whose NA cells were rerun is replaced by its rerun (database/25_cell_grouping_na_reruns.sql)
      const rerunOf = new Set(list.map((r) => r.rerun_of).filter(Boolean));
      const withReport = list.filter((r) => r.report_path && !rerunOf.has(r.id));
      const picked = withReport.slice(0, MAX_RUNS);
      if (withReport.length > MAX_RUNS) setNotice(`Only the newest ${MAX_RUNS} of ${withReport.length} runs were loaded; narrow the dates to see older runs.`);
      const loaded: RunReport[] = [];
      const failed: string[] = [];
      let done = 0;
      const queue = [...picked];
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          const label = `${formatDate(r.created_at)} · ${r.input_file_name}`;
          try {
            const frame = readCsv(await runFileText(r.report_path!));
            loaded.push({ runId: r.id, label, chemistry: r.chemistry, frame, groupCol: reportGroupColumn(frame.columns) });
          } catch (e) {
            failed.push(`${label}: ${(e as Error).message}`);
          }
          setProgress(`Reading reports… ${++done} of ${picked.length}`);
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      const order = new Map(picked.map((r, i) => [r.id, i]));
      loaded.sort((a, b) => order.get(a.runId)! - order.get(b.runId)!);
      setRuns(loaded);
      setSkipped(failed);
      const first = loaded.find((r) => rules[r.chemistry]);
      setWorkChem((c) => (c && loaded.some((r) => r.chemistry === c) ? c : chemistry || first?.chemistry || ''));
      setProposal('');
    } catch (e) {
      setError(`${(e as Error).message}. Grading history needs database/21_cell_grouping_runs.sql.`);
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const workRules = workChem ? rulesFor(workChem) : undefined;
  const workRuns = runs?.filter((r) => r.chemistry === workChem) ?? [];
  const workCells = cells.filter((c) => c.chemistry === workChem);

  const suggest = () => {
    const p = published[workChem];
    if (!p || !workRules) return;
    const s = suggestSteps(workCells, workRules);
    setSuggestions(s);
    setProposal(applySuggestions(p.yaml_text, s, workRules));
    setValidation(null);
    setError('');
  };

  const startFromPublished = () => {
    setSuggestions([]);
    setProposal(published[workChem]?.yaml_text ?? '');
    setValidation(null);
  };

  const validate = () => {
    if (!workRules) return;
    const next = parseRules(proposal).rules;
    setValidation({ text: proposal, report: validateProposal(proposal, workRuns, workRules), comparison: next ? compareRules(workRules, next) : null });
  };

  const report = validation?.report;
  const validated = validation !== null && validation.text === proposal;
  const canPublish =
    Boolean(publishRules) && validated && report !== undefined && !report.errors.length && !report.runErrors.length && proposal !== published[workChem]?.yaml_text;

  const publish = async () => {
    const p = published[workChem];
    if (!publishRules || !p || !report) return;
    const moved = report.changed.length;
    const ok = window.confirm(
      `Approve and publish these ${workChem} rules? They go live: every grading uses them from now on.\n\n` +
        `${report.nowGrouped.length} NA cell(s) get a group, ${report.stillUnassigned.length} stay NA` +
        (moved ? `, and ${moved} already graded cell(s) would change group if graded again.` : '.') +
        `\n\nRuns with NA cells can then be rerun from Group cells; cells that already have a group keep it.`,
    );
    if (!ok) return;
    setPublishing(true);
    setError('');
    try {
      await publishRules(workChem, p.file_name, proposal);
      const fresh = await loadRules();
      setPublished(fresh);
      setNotice(
        `Published new ${workChem} rules: they are live. Runs with NA cells now appear under "Runs with NA cells to refresh" on Group cells, ` +
          `for operators and admins, to rerun their NA cells. Cells that already have a group keep it.`,
      );
      setValidation(null);
      setSuggestions([]);
      setProposal('');
    } catch (e) {
      setError(`Could not publish: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="genie-card">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="genie-card-title">Unassigned cells (NA)</h3>
          <span className="genie-pill border-genie-info-border bg-genie-info-bg text-genie-info-fg">Admin only</span>
        </div>
        <p className="text-xs leading-[1.4] text-genie-text-secondary">
          Cells that no grouping rule matched, read from the grouping reports saved in the grading history. For each one you see the nearest group
          and the condition it missed; below you can generate rules that group them, validate them against every cell of these runs, and publish.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex basis-44 flex-col gap-1">
            <span className="genie-label">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="flex basis-44 flex-col gap-1">
            <span className="genie-label">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          <label className="flex basis-48 flex-col gap-1">
            <span className="genie-label">Chemistry</span>
            <span className="relative block">
              <select value={chemistry} onChange={(e) => setChemistry(e.target.value)} className={`${field} appearance-none pr-10`}>
                <option value="">All</option>
                {CHEMISTRIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <img src={iconChevronDown} alt="" width={16} height={16} className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </span>
          </label>
          <button type="button" onClick={load} disabled={loading} className="genie-btn-primary">
            {loading ? 'Loading…' : runs ? 'Reload' : 'Load NA cells'}
          </button>
          {progress && <span className="text-sm text-genie-text-secondary">{progress}</span>}
        </div>
        {runs && (
          <div className="flex flex-wrap gap-4">
            <Kpi label="Runs read" value={runs.length} caption={skipped.length ? `${skipped.length} report(s) could not be read` : ''} />
            <Kpi label="Cells checked" value={cellsChecked} />
            <Kpi
              label="NA cells"
              value={cells.length}
              caption={chemsWithNa.map((c) => `${c} ${cells.filter((x) => x.chemistry === c).length}`).join(' · ')}
            />
            <Kpi label="Not converted" value={cells.filter((c) => c.error).length} caption="Incomplete / unreadable tests" />
          </div>
        )}
        {notice && <div className="rounded-genie-md border border-genie-info-border bg-genie-info-bg px-4 py-3 text-sm text-genie-info-fg">{notice}</div>}
        {error && <div className="rounded-genie-md border border-[rgba(211,47,47,0.4)] bg-[#fdecec] px-4 py-3 text-sm text-genie-danger-fg">{error}</div>}
        {skipped.length > 0 && (
          <details className="text-xs text-genie-text-secondary">
            <summary>Reports that could not be read ({skipped.length})</summary>
            <ul className="mt-1 list-disc pl-5">
              {skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {runs && (
        <section className="genie-card">
          <h3 className="genie-card-title">NA cells and their nearest group</h3>
          {!cells.length ? (
            <p className="text-sm text-genie-text-secondary">No NA cells in these runs.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-sm leading-[1.4]">
                <thead>
                  <tr className="text-genie-text-secondary">
                    <th className="py-2 pr-4 font-medium">Run</th>
                    <th className="py-2 pr-4 font-medium">Chemistry</th>
                    <th className="py-2 pr-4 font-medium">Cell</th>
                    <th className="py-2 pr-4 font-medium">Nearest group</th>
                    <th className="py-2 font-medium">Missed</th>
                  </tr>
                </thead>
                <tbody>
                  {cells.map((c) => {
                    const best = c.nearest[0];
                    return (
                      <tr key={`${c.runId}-${c.row}`} className="border-t border-genie-border align-top">
                        <td className="py-2 pr-4 text-genie-text-secondary">{c.runLabel}</td>
                        <td className="py-2 pr-4">{c.chemistry}</td>
                        <td className="py-2 pr-4 font-medium">{c.cellId}</td>
                        {c.error ? (
                          <>
                            <td className="py-2 pr-4 text-genie-text-secondary">—</td>
                            <td className="py-2 text-genie-danger-fg">Not converted: {c.error}</td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-4 font-medium">
                              {best?.name ?? '—'}
                              {c.nearest.length > 1 && (
                                <span className="block text-xs font-normal text-genie-text-secondary">
                                  then {c.nearest.slice(1).map((n) => `${n.name} (${n.failed.length} missed)`).join(', ')}
                                </span>
                              )}
                            </td>
                            <td className="py-2">
                              {best?.failed.map((f) => (
                                <span key={f.text} className="block">
                                  {f.text}: <span className="text-genie-warning-fg">{f.detail}</span>
                                </span>
                              ))}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {runs && (
        <section className="genie-card">
          <h3 className="genie-card-title">Improve the grouping rules</h3>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex basis-48 flex-col gap-1">
              <span className="genie-label">Chemistry</span>
              <span className="relative block">
                <select
                  value={workChem}
                  onChange={(e) => {
                    setWorkChem(e.target.value);
                    setProposal('');
                    setSuggestions([]);
                    setValidation(null);
                  }}
                  className={`${field} appearance-none pr-10`}
                >
                  <option value="">Choose…</option>
                  {[...new Set(runs.map((r) => r.chemistry))].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <img src={iconChevronDown} alt="" width={16} height={16} className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              </span>
            </label>
            <button type="button" onClick={suggest} disabled={!workRules || !workCells.length} className="genie-btn-primary">
              Generate rules for the NA cells
            </button>
            <button type="button" onClick={startFromPublished} disabled={!workRules} className="genie-btn-secondary">
              Edit the published rules
            </button>
          </div>
          {workChem && !published[workChem] && <p className="text-sm text-genie-danger-fg">No {workChem} rules are published.</p>}
          {workChem && published[workChem] && (
            <p className="text-xs text-genie-text-secondary">
              Published: {published[workChem]!.file_name}, {formatDate(published[workChem]!.uploaded_at)}. {workCells.length} NA cell(s) and{' '}
              {workRuns.reduce((n, r) => n + r.frame.length, 0)} cell(s) in {workRuns.length} run(s) are used to validate.
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="rounded-genie-md bg-genie-muted p-4 text-sm leading-[1.4]">
              <p className="mb-2 font-medium">Suggested new groups (rename NEW-… to your group codes before publishing):</p>
              <ul className="list-disc pl-5">
                {suggestions.map((s) => (
                  <li key={s.name}>
                    <span className="font-medium">{s.name}</span>: like {s.fromStep}, with {s.col} {s.between[0]} – {s.between[1]}. Groups {s.cells.length} NA
                    cell(s): {s.cells.map((c) => c.split(': ').pop()).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workRules && proposal === '' && suggestions.length === 0 && workCells.length > 0 && (
            <p className="text-sm text-genie-text-secondary">
              Generate rules to get suggestions for NA cells that miss their nearest group by one range; cells that miss by more, or were not converted,
              need a rule written by hand (Edit the published rules).
            </p>
          )}
          {proposal !== '' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="genie-label">Proposed rules (YAML)</span>
                <textarea
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                  spellCheck={false}
                  rows={20}
                  className={`${field} h-auto font-mono text-xs leading-[1.5]`}
                />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" onClick={validate} className="genie-btn-primary">
                  Validate
                </button>
                <button type="button" onClick={publish} disabled={!canPublish || publishing} className="genie-btn-secondary">
                  {publishing ? 'Publishing…' : 'Approve and publish (go live)'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(proposal, proposalFileName(published[workChem]?.file_name, workChem), 'application/x-yaml;charset=utf-8')}
                  title="Saves the rules exactly as shown, e.g. to keep them in the Cell Grouping rules folder"
                  className="genie-btn-secondary"
                >
                  Download rules (.yaml)
                </button>
                {validated && report && !report.errors.length && !report.runErrors.length ? (
                  <span className="text-xs text-genie-success-fg">Validated: the download is the checked version.</span>
                ) : (
                  <span className="text-xs text-genie-text-secondary">Not validated yet: validate before keeping or publishing.</span>
                )}
                {!publishRules && <span className="text-xs text-genie-text-secondary">Publishing needs the manage grouping rules permission.</span>}
                {validation && !validated && <span className="text-xs text-genie-warning-fg">The rules changed since the last validation: validate again.</span>}
              </div>
            </>
          )}
          {report && validated && (
            <div className="flex flex-col gap-3">
              {report.errors.length > 0 ? (
                <div className="rounded-genie-md border border-[rgba(211,47,47,0.4)] bg-[#fdecec] px-4 py-3 text-sm text-genie-danger-fg">
                  <p className="font-medium">The rules file has errors:</p>
                  <ul className="list-disc pl-5">
                    {report.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    Checked {report.cellsChecked} cell(s):{' '}
                    <span className="text-genie-success-fg">{report.nowGrouped.length} NA cell(s) get a group</span>,{' '}
                    {report.stillUnassigned.length} stay NA,{' '}
                    <span className={report.changed.length ? 'font-medium text-genie-danger-fg' : ''}>
                      {report.changed.length} already graded cell(s) would change group
                    </span>
                    .
                  </p>
                  <p className="text-xs text-genie-text-secondary">
                    Cells per group:{' '}
                    {Object.entries(report.groupCounts)
                      .map(([g, n]) => `${g} ${n}`)
                      .join(' · ')}
                  </p>
                  {report.runErrors.length > 0 && (
                    <div className="rounded-genie-md border border-[rgba(211,47,47,0.4)] bg-[#fdecec] px-4 py-3 text-sm text-genie-danger-fg">
                      <p className="font-medium">These runs could not be grouped with the proposed rules:</p>
                      <ul className="list-disc pl-5">
                        {report.runErrors.map((e) => (
                          <li key={e.runLabel}>
                            {e.runLabel}: {e.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validation.comparison && <RulesDiff comparison={validation.comparison} />}
                  {report.warnings.length > 0 && (
                    <p className="text-xs text-genie-warning-fg">Warnings: {report.warnings.join('; ')}</p>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <ChangeList title="Would change group" tone="danger" items={report.changed} />
                    <ChangeList title="NA → grouped" tone="success" items={report.nowGrouped} />
                    <ChangeList title="Still NA" tone="muted" items={report.stillUnassigned} />
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
