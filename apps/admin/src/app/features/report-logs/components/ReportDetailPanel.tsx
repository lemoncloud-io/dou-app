import { useEffect } from 'react';

import { X } from 'lucide-react';

import { useT } from '../../../i18n';
import { rowBadge } from '../lib/badgeClass';
import { eventAt, hasNoticeableLag, ingestLagMs } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import type { PinKey } from '../lib/pinAxes';
import { formatAgo, formatDateTime, formatDuration } from '../lib/timeFormat';
import { PinButton } from './PinButton';
import { ReportDetailBody, rawRecordText } from './ReportDetailBody';

interface ReportDetailPanelProps {
    row: ReportLogRow | null;
    onClose: () => void;
    onObserve?: (uid: string) => void;
    onPin?: (axis: PinKey, value: string) => void;
    onUnpin?: (axis: PinKey) => void;
    pinned?: Partial<Record<PinKey, string>>;
    actions?: React.ReactNode;
}

const roundToMinute = (ms: number): number => Math.round(ms / 60_000) * 60_000;

export const ReportDetailPanel = ({
    row,
    onClose,
    onObserve,
    onPin,
    onUnpin,
    pinned = {},
    actions,
}: ReportDetailPanelProps) => {
    const { t, lng } = useT('allLogs');

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
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t('detail.empty')}</p>
            </aside>
        );
    }

    const badge = rowBadge(row);
    const uid = row.userId;
    const lag = ingestLagMs(row);
    const occurredAt = eventAt(row);
    const lagText = lag === undefined ? '' : formatDuration(roundToMinute(lag), lng);

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
                    <time
                        dateTime={occurredAt === undefined ? undefined : new Date(occurredAt).toISOString()}
                        title={formatAgo(occurredAt, lng)}
                    >
                        {formatDateTime(occurredAt, lng, { seconds: true })}
                    </time>
                    {hasNoticeableLag(row) && lag !== undefined && (
                        <span
                            className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
                            title={t('detail.lagTitle', {
                                lag: lagText,
                                arrived: formatDateTime(row.createdAt, lng, { seconds: true }),
                            })}
                        >
                            {t('detail.lag', { lag: lagText })}
                        </span>
                    )}
                </div>
                {onPin && (
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
                )}
                {row.userName && <span className="text-xs text-muted-foreground">{row.userName}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {uid && onObserve && (
                    <button
                        type="button"
                        onClick={() => onObserve(uid)}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('detail.observeTitle', { uid })}
                    >
                        {t('detail.observe')}
                    </button>
                )}
                {actions}
                <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(rawRecordText(row))}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    {t('detail.copy')}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('detail.close')}
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
            <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={onClose} aria-hidden />
            <aside
                aria-label={t('detail.panelLabel')}
                className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,32rem)] shrink-0 flex-col border-l border-border bg-card shadow-xl xl:static xl:z-auto xl:w-[26rem] xl:shadow-none"
            >
                {header}
                {content}
            </aside>
        </>
    );
};
