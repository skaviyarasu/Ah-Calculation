import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CHEMISTRIES } from '../lib/cellGrouping/index.ts';
import iconChevronDown from '../assets/genie/icon-chevron-down.svg';

/** One row of cell_grouping_runs (database/21_cell_grouping_runs.sql). */
export interface GradingRun {
  id: string;
  created_at: string;
  user_email: string | null;
  chemistry: string;
  rules_file_name: string | null;
  input_kind: 'machine_export' | 'per_cell_reports' | 'csv';
  input_file_name: string;
  input_file_count: number;
  input_file_names: string[] | null;
  cells_read: number | null;
  cells_removed: number;
  cells_not_converted: number;
  cells_grouped: number;
  group_counts: Record<string, number>;
  unassigned_count: number;
  rejected_count: number;
  input_path: string | null;
  report_path: string | null;
  /** LFP per-cell reports: the raw per-channel files as one ZIP (database/24_cell_grouping_raw_inputs.sql). */
  raw_input_path?: string | null;
}

export interface GradingHistoryProps {
  /** Runs, newest first (admins only; enforced in the database). Dates are ISO strings. */
  listRuns: (filters: { from?: string; to?: string; chemistry?: string }) => Promise<GradingRun[]>;
  /** Short-lived download link for a saved run file. */
  fileUrl: (path: string) => Promise<string>;
}

const INPUT_KIND: Record<GradingRun['input_kind'], string> = {
  machine_export: 'Machine export',
  per_cell_reports: 'Per-cell reports',
  csv: 'CSV',
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString();
const sum = (runs: GradingRun[], pick: (r: GradingRun) => number) => runs.reduce((n, r) => n + (pick(r) || 0), 0);

function Kpi({ label, value, caption }: { label: string; value: React.ReactNode; caption?: string }) {
  return (
    <div className="genie-kpi">
      <p className="text-sm font-medium text-genie-text-secondary">{label}</p>
      <p className="truncate text-[28px] font-semibold text-genie-text">{value}</p>
      <p className="min-h-[17px] truncate text-xs text-genie-text-secondary">{caption ?? ''}</p>
    </div>
  );
}

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(data: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GradingHistory({ listRuns, fileUrl }: GradingHistoryProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [chemistry, setChemistry] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [runs, setRuns] = useState<GradingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // "to" is inclusive: everything before the start of the next day
      const toExclusive = to ? new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10) : undefined;
      setRuns(await listRuns({ from: from || undefined, to: toExclusive, chemistry: chemistry || undefined }));
    } catch (e) {
      setError(`${(e as Error).message}. If this is a new setup, run database/21_cell_grouping_runs.sql in Supabase.`);
    } finally {
      setLoading(false);
    }
  }, [listRuns, from, to, chemistry]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    return q ? runs.filter((r) => (r.user_email ?? '').toLowerCase().includes(q)) : runs;
  }, [runs, userFilter]);

  const byChemistry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shown) m.set(r.chemistry, (m.get(r.chemistry) ?? 0) + 1);
    return [...m].map(([c, n]) => `${c} ${n}`).join(' · ');
  }, [shown]);

  const openFile = async (path: string | null) => {
    if (!path) return;
    try {
      window.location.assign(await fileUrl(path));
    } catch (e) {
      setError(`Could not download the file: ${(e as Error).message}`);
    }
  };

  const exportCsv = () => {
    const header = [
      'Date',
      'User',
      'Chemistry',
      'Rules',
      'Input type',
      'Input',
      'Files',
      'Cells read',
      'Removed',
      'Not converted',
      'Grouped',
      'Unassigned',
      'Rejected',
      'Groups',
    ];
    const lines = shown.map((r) =>
      [
        r.created_at,
        r.user_email,
        r.chemistry,
        r.rules_file_name,
        INPUT_KIND[r.input_kind],
        r.input_file_name,
        r.input_file_count,
        r.cells_read,
        r.cells_removed,
        r.cells_not_converted,
        r.cells_grouped,
        r.unassigned_count,
        r.rejected_count,
        Object.entries(r.group_counts)
          .map(([g, n]) => `${g} ${n}`)
          .join('; '),
      ]
        .map(csvField)
        .join(','),
    );
    download(
      [header.join(','), ...lines].join('\r\n') + '\r\n',
      `grading_history_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
    );
  };

  const field = 'genie-field';

  return (
    <div className="flex flex-col gap-6">
      <section className="genie-card">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="genie-card-title">Grading runs</h3>
          <span className="genie-pill border-genie-info-border bg-genie-info-bg text-genie-info-fg">Admin only</span>
        </div>
        <p className="text-xs leading-[1.4] text-genie-text-secondary">
          Every Assign groups in Group cells is recorded with its input and grouping report. Runs cannot be changed or deleted.
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
              <img
                src={iconChevronDown}
                alt=""
                width={16}
                height={16}
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
              />
            </span>
          </label>
          <label className="flex basis-64 flex-col gap-1">
            <span className="genie-label">User</span>
            <input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Email contains…" className={field} />
          </label>
          <button type="button" onClick={exportCsv} disabled={!shown.length} className="genie-btn-secondary">
            Export list (.csv)
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Kpi label="Runs" value={shown.length} caption={byChemistry} />
          <Kpi
            label="Cells graded"
            value={sum(shown, (r) => r.cells_grouped)}
            caption={`${sum(shown, (r) => r.cells_removed)} removed by preprocessing`}
          />
          <Kpi label="Unassigned" value={sum(shown, (r) => r.unassigned_count)} caption="Outside every range" />
          <Kpi
            label="Rejected"
            value={sum(shown, (r) => r.rejected_count)}
            caption={`${sum(shown, (r) => r.cells_not_converted)} LFP reports not converted`}
          />
        </div>
        {error && (
          <div className="rounded-genie-md border border-[rgba(211,47,47,0.4)] bg-[#fdecec] px-4 py-3 text-sm text-genie-danger-fg">{error}</div>
        )}
      </section>

      <section className="genie-card">
        <h3 className="genie-card-title">History</h3>
        {loading ? (
          <p className="text-sm text-genie-text-secondary">Loading…</p>
        ) : !shown.length ? (
          <p className="text-sm text-genie-text-secondary">No grading runs for these filters.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm leading-[1.4]">
              <thead>
                <tr className="text-genie-text-secondary">
                  {['Date', 'User', 'Chemistry', 'Input', 'Cells', 'Groups', 'Files'].map((h) => (
                    <th key={h} className="whitespace-nowrap py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const groups = Object.entries(r.group_counts);
                  const isOpen = open === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-t border-genie-border text-genie-text hover:bg-genie-muted"
                        onClick={() => setOpen(isOpen ? null : r.id)}
                      >
                        <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(r.created_at)}</td>
                        <td className="py-2 pr-4">{r.user_email ?? '—'}</td>
                        <td className="py-2 pr-4 font-medium">{r.chemistry}</td>
                        <td className="py-2 pr-4">
                          <span className="block max-w-[240px] truncate" title={r.input_file_name}>
                            {r.input_file_name}
                          </span>
                          <span className="text-xs text-genie-text-secondary">
                            {INPUT_KIND[r.input_kind]}
                            {r.input_file_count > 1 ? ` · ${r.input_file_count} files` : ''}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4">
                          {r.cells_grouped}
                          {r.cells_read !== null && <span className="text-xs text-genie-text-secondary"> of {r.cells_read}</span>}
                        </td>
                        <td className="py-2 pr-4">
                          {groups
                            .slice(0, 3)
                            .map(([g, n]) => `${g} ${n}`)
                            .join(' · ')}
                          {groups.length > 3 ? ' · …' : ''}
                        </td>
                        <td className="whitespace-nowrap py-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={!r.input_path}
                            onClick={() => openFile(r.input_path)}
                            className="mr-3 text-genie-primary underline-offset-2 hover:underline disabled:opacity-40"
                          >
                            Input
                          </button>
                          {r.input_kind === 'per_cell_reports' && (
                            <button
                              type="button"
                              disabled={!r.raw_input_path}
                              onClick={() => openFile(r.raw_input_path ?? null)}
                              title={r.raw_input_path ? 'The per-channel files exactly as uploaded (ZIP)' : 'Not saved for this run'}
                              className="mr-3 text-genie-primary underline-offset-2 hover:underline disabled:opacity-40"
                            >
                              Raw files
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!r.report_path}
                            onClick={() => openFile(r.report_path)}
                            className="text-genie-primary underline-offset-2 hover:underline disabled:opacity-40"
                          >
                            Report
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-genie-muted">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap gap-8 text-sm">
                              <div>
                                <p className="mb-1 font-medium text-genie-text">Cells per group</p>
                                <table>
                                  <tbody>
                                    {groups.map(([g, n]) => (
                                      <tr key={g}>
                                        <td className="pr-6">{g}</td>
                                        <td className="text-right">{n}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="space-y-1 text-genie-text-secondary">
                                <p>
                                  Rules: <span className="text-genie-text">{r.rules_file_name ?? '—'}</span>
                                </p>
                                <p>Cells read: {r.cells_read ?? '—'}</p>
                                <p>Removed by preprocessing: {r.cells_removed}</p>
                                {r.input_kind === 'per_cell_reports' && <p>Reports not converted: {r.cells_not_converted}</p>}
                                <p>Unassigned: {r.unassigned_count}</p>
                                <p>Rejected: {r.rejected_count}</p>
                                {r.input_kind === 'per_cell_reports' && (
                                  <p className="text-xs">
                                    {r.raw_input_path
                                      ? 'Saved input: the converted batch (machine layout), and the raw per-cell files as uploaded (Raw files, ZIP).'
                                      : 'Saved input: the converted batch (machine layout); the raw per-cell files were not stored for this run.'}
                                  </p>
                                )}
                              </div>
                              {r.input_file_names && r.input_file_names.length > 0 && (
                                <div className="min-w-[200px] flex-1">
                                  <p className="mb-1 font-medium text-genie-text">Files ({r.input_file_names.length})</p>
                                  <p className="max-h-32 overflow-auto text-xs text-genie-text-secondary">{r.input_file_names.join(', ')}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
