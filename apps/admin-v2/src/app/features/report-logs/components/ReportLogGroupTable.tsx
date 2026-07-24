/**
 * `components/report-logs/ReportLogGroupTable.tsx`
 * - Aggregated view: one row per distinct message with occurrence count.
 */
import type { ReportLogGroup } from '../lib/groupReportLogs';
import type { ReportType } from '../lib/parseReportLog';

interface ReportLogGroupTableProps {
    groups: ReportLogGroup[];
    onSelect: (group: ReportLogGroup) => void;
}

const TYPE_BADGE: Record<ReportType, string> = {
    error: 'bg-destructive text-destructive-foreground',
    issue: 'bg-primary text-primary-foreground',
    unknown: 'bg-muted text-muted-foreground',
};

const formatTime = (ms?: number): string => (ms ? new Date(ms).toLocaleString() : '-');

export const ReportLogGroupTable = ({ groups, onSelect }: ReportLogGroupTableProps) => {
    if (groups.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">집계할 리포트가 없습니다.</p>;
    }

    const maxCount = groups[0]?.count ?? 1;

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">건수</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">메시지</th>
                        <th className="px-3 py-2 font-medium">App</th>
                        <th className="px-3 py-2 font-medium">최근</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map(group => (
                        <tr
                            key={group.key}
                            onClick={() => onSelect(group)}
                            className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                        >
                            <td className="w-40 px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
                                        {group.count}
                                    </span>
                                    {/* Relative bar for quick visual ranking. */}
                                    <span className="h-1.5 flex-1 rounded bg-muted">
                                        <span
                                            className="block h-full rounded bg-primary"
                                            style={{ width: `${Math.max(4, (group.count / maxCount) * 100)}%` }}
                                        />
                                    </span>
                                </div>
                            </td>
                            <td className="px-3 py-2">
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${TYPE_BADGE[group.type]}`}
                                >
                                    {group.type}
                                </span>
                            </td>
                            <td className="max-w-[28rem] px-3 py-2">
                                <span className="block truncate text-foreground" title={group.message}>
                                    {group.message}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{group.apps.join(', ') || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                {formatTime(group.latestAt)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
