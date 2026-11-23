import { AlertCircle, Clock, History, RefreshCw } from 'lucide-react';
import {
  formatAuditTimestamp,
  type AuditEventRecord,
  type AuditResult,
} from '../domain/accountTypes';

interface AuditHistoryListProps {
  events: AuditEventRecord[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  displayTimezone?: string;
  projectTimezoneNote?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  filterLabel?: string | null;
  onClearFilter?: () => void;
}

function resultBadgeClasses(result: AuditResult): string {
  switch (result) {
    case 'success':
      return 'border-[#166534]/25 bg-[#DCFCE7] text-[#166534]';
    case 'pending':
      return 'border-[#D4652F]/35 bg-[#FFF3EB] text-[#A64011]';
    case 'rejected':
    case 'failed':
      return 'border-[#B42318]/30 bg-[#FEF3F2] text-[#B42318]';
  }
}

function formatDiffEntries(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Array<{ field: string; beforeVal: string; afterVal: string }> {
  if (!before && !after) return [];
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const rows: Array<{ field: string; beforeVal: string; afterVal: string }> = [];
  for (const key of keys) {
    const bVal = before?.[key];
    const aVal = after?.[key];
    if (bVal === aVal) continue;
    rows.push({
      field: key,
      beforeVal: bVal === undefined || bVal === null || bVal === '' ? '—' : String(bVal),
      afterVal: aVal === undefined || aVal === null || aVal === '' ? '—' : String(aVal),
    });
  }
  return rows;
}

export function AuditHistoryList({
  events,
  loading = false,
  error = null,
  onRetry,
  displayTimezone = 'Asia/Jakarta',
  projectTimezoneNote,
  emptyTitle = 'No recorded history yet',
  emptyDescription = 'Recorded changes, access updates, and operational events will appear here in chronological order.',
  filterLabel,
  onClearFilter,
}: AuditHistoryListProps) {
  return (
    <div className="space-y-3">
      {(filterLabel || projectTimezoneNote) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px] text-[#4F5C67]">
          <div className="flex flex-wrap items-center gap-2">
            {filterLabel && (
              <span className="inline-flex items-center gap-2 rounded-md border border-[#D4652F]/40 bg-[#FFF3EB] px-2.5 py-1 font-medium text-[#A64011]">
                Filtered by: {filterLabel}
                {onClearFilter && (
                  <button
                    type="button"
                    onClick={onClearFilter}
                    className="underline underline-offset-2 hover:text-[#1B2A4A]"
                  >
                    Show all
                  </button>
                )}
              </span>
            )}
          </div>
          {projectTimezoneNote && (
            <span className="inline-flex items-center gap-1.5 text-[#4F5C67]">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {projectTimezoneNote}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 px-4 py-8 text-center text-[14px] text-[#4F5C67]">
          Loading history…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] px-4 py-3 text-[14px] text-[#B42318]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#B42318]/30 bg-white px-3 text-[13px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      ) : events.length === 0 ? (
        <div
          data-testid="audit-history-empty"
          className="rounded-lg border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/40 px-5 py-8 text-center"
        >
          <History className="mx-auto h-5 w-5 text-[#4F5C67]" aria-hidden="true" />
          <div className="mt-2 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
            {emptyTitle}
          </div>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-[18px] text-[#4F5C67]">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <ul
          data-testid="audit-history-list"
          className="divide-y divide-[#D9DEE2] rounded-lg border border-[#D9DEE2] bg-white"
        >
          {events.map((ev) => {
            const diffRows = formatDiffEntries(ev.beforeSummary, ev.afterSummary);
            return (
              <li key={ev.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                        {ev.action}
                      </span>
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[12px] leading-[16px] font-medium capitalize ${resultBadgeClasses(
                          ev.result
                        )}`}
                      >
                        {ev.result}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                      <span>{ev.actorName}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="capitalize">{ev.objectType.replace('_', ' ')}</span>:{' '}
                      <span className="font-medium text-[#1B2A4A]">{ev.objectLabel}</span>
                    </div>
                  </div>
                  <time
                    dateTime={ev.occurredAt}
                    className="shrink-0 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums"
                  >
                    {formatAuditTimestamp(ev.occurredAt, displayTimezone)}
                  </time>
                </div>

                {ev.reason && (
                  <p className="mt-2 text-[13px] leading-[18px] text-[#4F5C67]">
                    Reason: <span className="text-[#1B2A4A]">{ev.reason}</span>
                  </p>
                )}

                {diffRows.length > 0 && (
                  <dl className="mt-2.5 grid grid-cols-1 gap-1.5 rounded-lg bg-[#F4F3EF]/70 px-3 py-2 text-[13px] leading-[18px] sm:grid-cols-2">
                    {diffRows.map((row) => (
                      <div key={row.field} className="min-w-0">
                        <dt className="text-[#4F5C67]">{row.field}</dt>
                        <dd className="truncate font-medium text-[#1B2A4A]">
                          <span className="text-[#4F5C67] line-through">{row.beforeVal}</span>
                          <span aria-hidden="true" className="mx-1.5 text-[#4F5C67]">
                            →
                          </span>
                          <span>{row.afterVal}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
