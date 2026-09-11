/**
 * `components/report-logs/ReportLogTable.tsx`
 * - The list view: one row per record, with the tracking axes pinnable in place.
 *
 * Structure comes from the shared `Table` primitives so this screen matches the rest of
 * the console. The badge palette stays local (`lib/badgeClass`) because the shared `Badge`
 * variants only cover default/secondary/destructive/outline, and a `warn` level needs to
 * read as distinct from both `error` and `info` — collapsing them would lose the axis an
 * operator scans by.
 *
 * Time shown is occurrence time, with a lag badge when arrival trailed it noticeably.
 * See `eventTime.ts` for why the two clocks are not interchangeable.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

import type { PinKey } from '../hooks/use-log-console-state';
import { rowBadge } from '../lib/badgeClass';
import { eventAt, hasNoticeableLag, isOutsideRange } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import { formatAbsolute, formatRelative } from '../lib/reportLogFormat';
import { PinButton } from './PinButton';

interface ReportLogTableProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
    onPin: (axis: PinKey, value: string) => void;
    onUnpin: (axis: PinKey) => void;
    pinned: Partial<Record<PinKey, string>>;
    /**
     * Requested range in ms, so a row whose occurrence time falls outside it can say so.
     * The server matched the range on arrival time, so this happens legitimately at the
     * edges — marking the affected rows is more use than the blanket caveat in the rail.
     */
    range?: { fromMs?: number; toMs?: number };
}

export const ReportLogTable = ({ rows, onSelect, selectedId, onPin, onUnpin, pinned, range }: ReportLogTableProps) => {
    if (rows.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">표시할 로그가 없습니다.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide text-muted-foreground">
                    <TableHead className="w-20">Level</TableHead>
                    <TableHead className="w-32">태그/제목</TableHead>
                    <TableHead>메시지</TableHead>
                    <TableHead className="w-36">유저</TableHead>
                    <TableHead className="w-32">실행</TableHead>
                    <TableHead className="w-28">버전/화면</TableHead>
                    <TableHead className="w-28">시각</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row, index) => {
                    const badge = rowBadge(row);
                    return (
                        <TableRow
                            // `index` and not `title + createdAt`: both are optional, so two
                            // id-less rows with the same title collide on the literal string
                            // `"<title>undefined"` and React then reuses the wrong <tr>
                            // (visible as the selection highlight sticking to a stale row).
                            // Id-less rows are the ones that reach here — the corpus dedupe
                            // lets them through precisely because they cannot be told apart.
                            key={row.id || `row-${index}`}
                            onClick={() => onSelect(row)}
                            // A bare <tr> with onClick has no keyboard path, and the detail
                            // panel — the whole point of the column — would be unreachable
                            // without a pointer. `RunTimeline` renders real buttons; a table
                            // cannot, since a <button> may not wrap cells.
                            //
                            // No `role="button"` here: that would replace the row's own role
                            // and take the cells out of the table's structure, which is worse
                            // than the problem it solves. `tabIndex` + Enter/Space gives the
                            // keyboard path while the table stays a table.
                            tabIndex={0}
                            onKeyDown={event => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                // Space would scroll the list out from under the selection.
                                event.preventDefault();
                                onSelect(row);
                            }}
                            // The ui-kit row already styles this state; setting the attribute
                            // also tells assistive tech which row is open.
                            data-state={selectedId && selectedId === row.id ? 'selected' : undefined}
                            className="cursor-pointer"
                        >
                            <TableCell>
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${badge.className}`}
                                >
                                    {badge.label}
                                </span>
                            </TableCell>
                            <TableCell className="max-w-[8rem]">
                                <span className="block truncate font-mono text-xs text-foreground" title={row.title}>
                                    {row.title}
                                </span>
                            </TableCell>
                            <TableCell className="max-w-[24rem]">
                                <span className="block truncate text-muted-foreground" title={row.message}>
                                    {row.message ?? '-'}
                                </span>
                            </TableCell>
                            <TableCell className="max-w-[9rem]">
                                {/* Pinning from the row is the main path into user tracking —
                                    the value is right here, so the query should be one click. */}
                                <PinButton
                                    axis="uid"
                                    value={row.userId}
                                    active={!!row.userId && pinned.uid === row.userId}
                                    onPin={onPin}
                                    onUnpin={onUnpin}
                                />
                                {row.userName && (
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                        {row.userName}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="max-w-[8rem]">
                                <PinButton
                                    axis="runId"
                                    value={row.runId}
                                    active={!!row.runId && pinned.runId === row.runId}
                                    onPin={onPin}
                                    onUnpin={onUnpin}
                                />
                            </TableCell>
                            <TableCell className="max-w-[7rem] text-muted-foreground">
                                <span className="block truncate font-mono text-[11px]">
                                    {row.appVersion ?? row.webVersion ?? row.app ?? row.source ?? '-'}
                                </span>
                                {row.route && (
                                    <span className="block truncate font-mono text-[11px] opacity-70" title={row.route}>
                                        {row.route}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                                <span
                                    title={`발생 ${formatAbsolute(eventAt(row))} · 도달 ${formatAbsolute(row.createdAt)}`}
                                >
                                    {formatRelative(eventAt(row))}
                                </span>
                                {hasNoticeableLag(row) && (
                                    <span
                                        className="ml-1 rounded bg-muted px-1 text-[10px]"
                                        title="기기에서 발생한 뒤 서버 도달까지 1분 이상 지연됨"
                                    >
                                        지연
                                    </span>
                                )}
                                {isOutsideRange(row, range?.fromMs, range?.toMs) && (
                                    <span
                                        className="ml-1 rounded bg-muted px-1 text-[10px]"
                                        title="조회 기간은 서버 도달 시각 기준입니다. 이 행은 기간 밖에서 발생해 기간 안에 도달했습니다."
                                    >
                                        기간 밖
                                    </span>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};
