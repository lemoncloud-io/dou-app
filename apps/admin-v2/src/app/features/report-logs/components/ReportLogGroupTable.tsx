/**
 * `components/report-logs/ReportLogGroupTable.tsx`
 * - Aggregated view: one row per distinct message with occurrence count.
 *
 * Counts are over the collected corpus, not the server's full result set — the backend's
 * aggregation is fixed to `stereo` and takes no parameter, so there is no "count by
 * message" to ask it for (`logFacets.ts` explains the same constraint). The header above
 * this table states the scope.
 *
 * `최근` is occurrence time, matching the list, so a group's latest is the latest thing
 * that actually happened rather than the last upload to land.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

import { typeBadgeClass } from '../lib/badgeClass';
import type { ReportLogGroup } from '../lib/groupReportLogs';
import { formatAbsolute } from '../lib/reportLogFormat';

interface ReportLogGroupTableProps {
    groups: ReportLogGroup[];
    onSelect: (group: ReportLogGroup) => void;
}

export const ReportLogGroupTable = ({ groups, onSelect }: ReportLogGroupTableProps) => {
    if (groups.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">집계할 로그가 없습니다.</p>;
    }

    const maxCount = groups[0]?.count ?? 1;

    return (
        <Table>
            <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide text-muted-foreground">
                    <TableHead className="w-40">건수</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>메시지</TableHead>
                    <TableHead className="w-32">App</TableHead>
                    <TableHead className="w-40">최근 발생</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {groups.map(group => (
                    <TableRow
                        key={group.key}
                        onClick={() => onSelect(group)}
                        // Same reason as the list: without this the aggregate view's rows,
                        // and so the detail panel, are pointer-only. The row keeps its own
                        // role — see the note in `ReportLogTable`.
                        tabIndex={0}
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            onSelect(group);
                        }}
                        className="cursor-pointer"
                    >
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
                                    {group.count.toLocaleString()}
                                </span>
                                {/* Relative bar for quick visual ranking. */}
                                <span className="h-1.5 flex-1 rounded bg-muted">
                                    <span
                                        className="block h-full rounded bg-primary"
                                        style={{ width: `${Math.max(4, (group.count / maxCount) * 100)}%` }}
                                    />
                                </span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <span
                                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${typeBadgeClass(group.type)}`}
                            >
                                {group.type}
                            </span>
                        </TableCell>
                        <TableCell className="max-w-[28rem]">
                            <span className="block truncate text-foreground" title={group.message}>
                                {group.message}
                            </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{group.apps.join(', ') || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatAbsolute(group.latestAt)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
