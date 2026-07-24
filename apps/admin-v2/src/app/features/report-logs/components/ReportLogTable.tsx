/**
 * `components/report-logs/ReportLogTable.tsx`
 * - Summary table of report rows. No shared table component exists in admin-v2,
 *   so it is hand-rolled with Tailwind utilities + theme tokens.
 */
import type { ReportLogRow } from '../lib/parseReportLog';
import { formatRelative } from '../lib/reportLogFormat';

interface ReportLogTableProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
}

const TYPE_BADGE: Record<ReportLogRow['type'], string> = {
    error: 'bg-destructive text-destructive-foreground',
    issue: 'bg-primary text-primary-foreground',
    unknown: 'bg-muted text-muted-foreground',
};

const absoluteTime = (ms?: number): string => (ms ? new Date(ms).toLocaleString() : '-');

export const ReportLogTable = ({ rows, onSelect, selectedId }: ReportLogTableProps) => {
    if (rows.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">표시할 리포트가 없습니다.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">제목</th>
                        <th className="px-3 py-2 font-medium">메시지</th>
                        <th className="px-3 py-2 font-medium">사용자</th>
                        <th className="px-3 py-2 font-medium">App</th>
                        <th className="px-3 py-2 font-medium">시각</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr
                            key={row.id || row.title + row.createdAt}
                            onClick={() => onSelect(row)}
                            className={`cursor-pointer border-b border-border/60 hover:bg-muted/50 ${
                                selectedId && selectedId === row.id ? 'bg-muted' : ''
                            }`}
                        >
                            <td className="px-3 py-2">
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${TYPE_BADGE[row.type]}`}
                                >
                                    {row.type}
                                </span>
                            </td>
                            <td className="max-w-[16rem] px-3 py-2">
                                <span className="block truncate text-foreground" title={row.title}>
                                    {row.title}
                                </span>
                            </td>
                            <td className="max-w-[20rem] px-3 py-2">
                                <span className="block truncate text-muted-foreground" title={row.message}>
                                    {row.message ?? '-'}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                                <span
                                    className="block max-w-[10rem] truncate"
                                    title={row.userId ? `${row.userName ?? ''} (${row.userId})` : row.userName}
                                >
                                    {row.userName ?? row.userId ?? '-'}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{row.app ?? '-'}</td>
                            <td
                                className="whitespace-nowrap px-3 py-2 text-muted-foreground"
                                title={absoluteTime(row.createdAt)}
                            >
                                {formatRelative(row.createdAt)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
