import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

import { useT } from '../../../i18n';
import type { PinKey } from '../hooks/use-log-console-state';
import { rowBadge } from '../lib/badgeClass';
import { eventAt, hasNoticeableLag, isOutsideRange } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import { formatAgo, formatDateTime } from '../lib/timeFormat';
import { PinButton } from './PinButton';

interface ReportLogTableProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
    onPin: (axis: PinKey, value: string) => void;
    onUnpin: (axis: PinKey) => void;
    pinned: Partial<Record<PinKey, string>>;
    range?: { fromMs?: number; toMs?: number };
}

export const ReportLogTable = ({ rows, onSelect, selectedId, onPin, onUnpin, pinned, range }: ReportLogTableProps) => {
    const { t, lng } = useT('allLogs');

    if (rows.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('table.empty')}</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide text-muted-foreground">
                    <TableHead className="w-20">{t('table.level')}</TableHead>
                    <TableHead className="w-32">{t('table.title')}</TableHead>
                    <TableHead>{t('table.message')}</TableHead>
                    <TableHead className="w-36">{t('table.user')}</TableHead>
                    <TableHead className="w-32">{t('table.run')}</TableHead>
                    <TableHead className="w-28">{t('table.version')}</TableHead>
                    <TableHead className="w-28">{t('table.time')}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row, index) => {
                    const badge = rowBadge(row);
                    return (
                        <TableRow
                            key={row.id || `row-${index}`}
                            onClick={() => onSelect(row)}
                            tabIndex={0}
                            onKeyDown={event => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                onSelect(row);
                            }}
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
                                    title={t('table.timeTitle', {
                                        occurred: formatDateTime(eventAt(row), lng, { seconds: true }),
                                        arrived: formatDateTime(row.createdAt, lng, { seconds: true }),
                                    })}
                                >
                                    {formatAgo(eventAt(row), lng)}
                                </span>
                                {hasNoticeableLag(row) && (
                                    <span
                                        className="ml-1 rounded bg-muted px-1 text-[10px]"
                                        title={t('table.lagTitle')}
                                    >
                                        {t('table.lag')}
                                    </span>
                                )}
                                {isOutsideRange(row, range?.fromMs, range?.toMs) && (
                                    <span
                                        className="ml-1 rounded bg-muted px-1 text-[10px]"
                                        title={t('table.outsideTitle')}
                                    >
                                        {t('table.outside')}
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
