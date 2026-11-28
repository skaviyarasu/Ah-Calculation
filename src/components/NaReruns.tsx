import React, { useCallback, useEffect, useState } from 'react';
import { frameToCsv, parseRules, readCsv, rerunUnassigned, reportGroupColumn } from '../lib/cellGrouping/index.ts';
import type { CellChange, PublishedRules } from '../lib/cellGrouping/index.ts';
import type { RunRecord } from './CellGrouping';
import type { GradingRun } from './GradingHistory';

type PublishedMap = Record<string, PublishedRules | undefined>;

/** A run that still has NA cells and was graded with older rules (database/25_cell_grouping_na_reruns.sql). */
export type RerunCandidate = GradingRun & { rules_id: string | null };

export interface NaRerunsApi {
  /** Runs to rerun; null when migration 25 is not installed (the card is then hidden). */
  listCandidates: () => Promise<RerunCandidate[] | null>;
  /** The saved report of a run, as text. */
  runFileText: (path: string) => Promise<string>;
  /** The rules version a run used (to know its NA group names), or null. */
  getRulesVersion: (id: string) => Promise<PublishedRules | null>;
}

interface Outcome {
  regrouped: CellChange[];
  stillUnassigned: CellChange[];
  csv: string;
  fileName: string;
  saved: boolean;
  message?: string;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString();

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Runs with NA cells that can be refreshed with the newest published rules. A rerun regroups only
 * the NA cells; graded cells keep their group. It is saved as a new run linked to the original.
 */
export default function NaReruns({ api, published, recordRun }: { api: NaRerunsApi; published: PublishedMap; recordRun?: (run: RunRecord) => Promise<unknown> }) {
  const [runs, setRuns] = useState<RerunCandidate[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [done, setDone] = useState<RerunCandidate[]>([]);
  const publishedKey = Object.values(published)
    .map((p) => p?.id ?? '')
    .join(',');

  const load = useCallback(async () => {
    try {
      setError('');
      setRuns(await api.listCandidates());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    load();
    // reload when a new rules version is published
  }, [load, publishedKey]);

  const rerun = async (run: RerunCandidate): Promise<boolean> => {
    const rules = published[run.chemistry];
    if (!rules || !run.report_path) return false;
    setBusy(run.id);
    try {
      const next = parseRules(rules.yaml_text);
      if (!next.rules) throw new Error(`The published ${run.chemistry} rules have errors.`);
      const [reportText, oldVersion] = await Promise.all([api.runFileText(run.report_path), run.rules_id ? api.getRulesVersion(run.rules_id) : null]);
      const oldRules = (oldVersion && parseRules(oldVersion.yaml_text).rules) || next.rules;
      const report = readCsv(reportText);
      const r = rerunUnassigned(report, reportGroupColumn(report.columns), oldRules, next.rules, run.input_file_name);
      const csv = frameToCsv(r.frame, Array.from({ length: r.frame.length }, (_, i) => i));
      const stem = (run.report_path.split('/').pop() ?? 'report.csv').replace(/\.csv$/i, '').replace(/_rerun$/, '');
      const fileName = `${stem}_rerun.csv`;
      let saved = false;
      let message: string | undefined;
      if (recordRun) {
        try {
          await recordRun({
            chemistry: run.chemistry,
            rulesId: rules.id,
            rulesFileName: rules.file_name,
            inputKind: run.input_kind,
            inputFileName: run.input_file_name,
            inputFileCount: run.input_file_count,
            inputFileNames: run.input_file_names ?? undefined,
            cellsRead: run.cells_read ?? r.frame.length,
            cellsRemoved: run.cells_removed,
            cellsNotConverted: run.cells_not_converted,
            summary: r.summary,
            reportFile: { name: fileName, data: csv, type: 'text/csv' },
            rerunOf: run.id,
          });
          saved = true;
        } catch (e) {
          message = (e as Error).message;
        }
      }
      setOutcomes((o) => ({ ...o, [run.id]: { regrouped: r.regrouped, stillUnassigned: r.stillUnassigned, csv, fileName, saved, message } }));
      if (saved) {
        setDone((d) => [run, ...d]);
        setRuns((rs) => rs?.filter((x) => x.id !== run.id) ?? rs);
      }
      return saved;
    } catch (e) {
      setOutcomes((o) => ({ ...o, [run.id]: { regrouped: [], stillUnassigned: [], csv: '', fileName: '', saved: false, message: (e as Error).message } }));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rerunAll = async () => {
    for (const run of runs ?? []) await rerun(run);
  };

  if (runs === null && !error) return null; // loading, or migration 25 not installed
  if (!runs?.length && !done.length && !error) return null;

  const shown = [...(runs ?? []), ...done];

  return (
    <section className="genie-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="genie-card-title">Runs with NA cells to refresh</h3>
        {runs && runs.length > 0 && (
          <span className="genie-pill border-genie-warning-border bg-[#fff6e5] text-genie-warning-fg">{runs.length} to rerun</span>
        )}
      </div>
      <p className="text-xs leading-[1.4] text-genie-text-secondary">
        New grouping rules were published after these runs were graded. Rerun a run to give its NA cells a group with the newest rules. Cells
        that already have a group keep it. The rerun is saved in the grading history as a new run linked to the original, with a refreshed
        report to download.
      </p>
      {error && <div className="rounded-genie-md border border-[rgba(211,47,47,0.4)] bg-[#fdecec] px-4 py-3 text-sm text-genie-danger-fg">{error}</div>}
      {runs && runs.length > 1 && (
        <div>
          <button type="button" onClick={rerunAll} disabled={busy !== null} className="genie-btn-secondary">
            Rerun all ({runs.length})
          </button>
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm leading-[1.4]">
          <thead>
            <tr className="text-genie-text-secondary">
              <th className="py-2 pr-4 font-medium">Graded</th>
              <th className="py-2 pr-4 font-medium">Chemistry</th>
              <th className="py-2 pr-4 font-medium">Input</th>
              <th className="py-2 pr-4 font-medium">NA cells</th>
              <th className="py-2 pr-4 font-medium">Rules used → newest</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown.map((run) => {
              const o = outcomes[run.id];
              const newest = published[run.chemistry];
              return (
                <React.Fragment key={run.id}>
                  <tr className="border-t border-genie-border align-top">
                    <td className="whitespace-nowrap py-2 pr-4">{formatDate(run.created_at)}</td>
                    <td className="py-2 pr-4 font-medium">{run.chemistry}</td>
                    <td className="py-2 pr-4">
                      <span className="block max-w-[240px] truncate" title={run.input_file_name}>
                        {run.input_file_name}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {run.unassigned_count} of {run.cells_grouped}
                    </td>
                    <td className="py-2 pr-4 text-xs text-genie-text-secondary">
                      {run.rules_file_name ?? '—'} → {newest ? `${newest.file_name} (${formatDate(newest.uploaded_at)})` : 'none published'}
                    </td>
                    <td className="whitespace-nowrap py-2">
                      {o?.saved ? (
                        <span className="text-xs text-genie-success-fg">Refreshed</span>
                      ) : (
                        <button type="button" onClick={() => rerun(run)} disabled={busy !== null || !newest} className="genie-btn-primary">
                          {busy === run.id ? 'Rerunning…' : 'Rerun NA cells'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {o && (
                    <tr>
                      <td colSpan={6} className="pb-3 text-sm">
                        {o.csv && (
                          <p>
                            <span className="text-genie-success-fg">
                              {o.regrouped.length} of {o.regrouped.length + o.stillUnassigned.length} NA cell(s) got a group
                            </span>
                            {o.regrouped.length > 0 && `: ${o.regrouped.map((c) => `${c.cellId} → ${c.to}`).join(', ')}`}
                            {o.stillUnassigned.length > 0 && (
                              <span className="text-genie-text-secondary">
                                {' '}
                                · still NA: {o.stillUnassigned.map((c) => c.cellId).join(', ')}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadText(o.csv, o.fileName)}
                              className="ml-3 text-genie-primary underline-offset-2 hover:underline"
                            >
                              Download refreshed report
                            </button>
                          </p>
                        )}
                        {o.saved && <p className="text-xs text-genie-text-secondary">Saved in the grading history as a rerun of this run.</p>}
                        {o.message && <p className="text-genie-danger-fg">{o.csv ? `Not saved in the grading history: ${o.message}` : `Could not rerun: ${o.message}`}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
