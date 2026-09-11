/**
 * `components/report-logs/ReportDetailPanel.tsx`
 * - The right-hand column: header, tracking affordances, and the detail body.
 *
 * This replaces the overlay drawer it grew out of (ADR-0083). The drawer put a backdrop
 * over the list, so every step of "check this row, then the next" cost an open and a
 * close; tracking is exactly that loop, repeated. As a column it stays open while the
 * operator walks the list.
 *
 * The column form needs `xl` (1280px), not `lg`. At 1024px the rail takes 256px and this
 * panel 416px, leaving 352px for a list whose declared columns already sum past 800px —
 * the middle column degrades into a horizontal scroller nested inside another scroller.
 * Below `xl` the panel is therefore the overlay it used to be.
 *
 * That switch is CSS, not a JS breakpoint: a measured viewport would have to re-measure on
 * resize and would render the wrong shape on first paint.
 */
import { useEffect } from 'react';

import { X } from 'lucide-react';

import { rowBadge } from '../lib/badgeClass';
import { eventAt, hasNoticeableLag, ingestLagMs } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import type { PinKey } from '../lib/pinAxes';
import { formatAbsolute } from '../lib/reportLogFormat';
import { PinButton } from './PinButton';
import { ReportDetailBody, rawRecordText } from './ReportDetailBody';

interface ReportDetailPanelProps {
    row: ReportLogRow | null;
    onClose: () => void;
    /** Jump to socket-lab Observe for the report's user (when a uid is present). */
    onObserve?: (uid: string) => void;
    onPin: (axis: PinKey, value: string) => void;
    onUnpin: (axis: PinKey) => void;
    /** Axes already pinned, so the header's buttons can offer to unpin instead. */
    pinned: Partial<Record<PinKey, string>>;
}

/** Human-readable lag, for the badge tooltip. Sub-minute lags are never shown. */
const formatLag = (ms: number): string => {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    return `${hours}시간 ${minutes % 60}분`;
};

export const ReportDetailPanel = ({ row, onClose, onObserve, onPin, onUnpin, pinned }: ReportDetailPanelProps) => {
    /**
     * Escape closes the panel.
     *
     * Below `xl` this is an overlay over the list, and an overlay with no keyboard
     * dismissal is a trap — the only other way out is clicking a backdrop, which is not
     * focusable. `ui-kit`'s `Sheet` would bring this plus a focus trap, but it is always a
     * modal dialog and this panel is a layout column at desktop widths, so the behaviour
     * is added here instead. The listener is harmless in column state, where Escape simply
     * clears the selection.
     *
     * Declared before the empty-state return so the hook order stays stable.
     */
    useEffect(() => {
        if (!row) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [row, onClose]);

    if (!row) {
        return (
            <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-card xl:flex">
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                    행을 선택하면 상세가 여기에 열립니다.
                </p>
            </aside>
        );
    }

    const badge = rowBadge(row);
    const uid = row.userId;
    const lag = ingestLagMs(row);
    const occurredAt = eventAt(row);

    const header = (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${badge.className}`}>
                        {badge.label}
                    </span>
                    {row.tag && <span className="text-xs text-muted-foreground">[{row.tag}]</span>}
                    {row.app && <span className="text-xs text-muted-foreground">{row.app}</span>}
                    {row.env && <span className="text-xs text-muted-foreground">· {row.env}</span>}
                    {(row.appVersion || row.webVersion) && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                            {row.appVersion ?? row.webVersion}
                        </span>
                    )}
                </div>
                <h2 className="break-words text-sm font-semibold text-foreground">{row.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {/* Occurrence time leads; arrival is shown only when it differs enough
                        to matter, so the reader is not asked to reconcile two clocks on
                        every row. */}
                    <time dateTime={occurredAt === undefined ? undefined : new Date(occurredAt).toISOString()}>
                        {formatAbsolute(occurredAt)}
                    </time>
                    {hasNoticeableLag(row) && lag !== undefined && (
                        <span
                            className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
                            title={`기기에서 발생한 뒤 서버 도달까지 ${formatLag(lag)} 지연 · 도달 ${formatAbsolute(row.createdAt)}`}
                        >
                            +{formatLag(lag)} 지연
                        </span>
                    )}
                </div>
                {/* The tracking axes, pinnable straight from the detail — this is the hop
                    from "a user reported something" to "show me that user's logs". */}
                <div className="flex flex-wrap items-center gap-1">
                    <PinButton
                        axis="uid"
                        value={uid}
                        active={!!uid && pinned.uid === uid}
                        onPin={onPin}
                        onUnpin={onUnpin}
                        withLabel
                    />
                    <PinButton
                        axis="cid"
                        value={row.cid}
                        active={!!row.cid && pinned.cid === row.cid}
                        onPin={onPin}
                        onUnpin={onUnpin}
                        withLabel
                    />
                    <PinButton
                        axis="runId"
                        value={row.runId}
                        active={!!row.runId && pinned.runId === row.runId}
                        onPin={onPin}
                        onUnpin={onUnpin}
                        withLabel
                    />
                </div>
                {row.userName && <span className="text-xs text-muted-foreground">{row.userName}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {uid && onObserve && (
                    <button
                        type="button"
                        onClick={() => onObserve(uid)}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={`socket-lab에서 유저 ${uid} 관측`}
                    >
                        관측
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(rawRecordText(row))}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    복사
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </header>
    );

    const content = (
        <div className="flex flex-1 flex-col gap-5 overflow-auto p-4">
            <ReportDetailBody row={row} />
        </div>
    );

    return (
        <>
            {/* Backdrop only while the panel is an overlay; it is inert once it is a column. */}
            <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={onClose} aria-hidden />
            <aside
                // `dialog` only describes the overlay form; at `xl` this is a column, and
                // the role is left off there rather than lying about it.
                aria-label="로그 상세"
                className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,32rem)] shrink-0 flex-col border-l border-border bg-card shadow-xl xl:static xl:z-auto xl:w-[26rem] xl:shadow-none"
            >
                {header}
                {content}
            </aside>
        </>
    );
};
