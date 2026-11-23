import { useT } from '../../../i18n';
import type { CorpusPhase } from '../hooks/use-log-corpus';
import { formatAgo, formatDateTime, formatNumber } from '../lib/timeFormat';

interface CorpusProgressProps {
    phase: CorpusPhase;
    loaded: number;
    total: number;
    cap: number;
    error: Error | null;
    fetchedAt?: number;
    onRetry: () => void;
}

const HELD_NOTICE_MS = 60_000;

export const CorpusProgress = ({ phase, loaded, total, cap, error, fetchedAt, onRetry }: CorpusProgressProps) => {
    const { t, lng } = useT('allLogs');
    const n = (value: number): string => formatNumber(value, lng);

    if (phase === 'failed') {
        return (
            <div className="flex items-center gap-2 text-xs text-destructive">
                <span>{t('progress.failed', { message: error?.message ?? t('progress.unknownError') })}</span>
                <button type="button" onClick={onRetry} className="rounded border border-border px-2 py-0.5">
                    {t('progress.retry')}
                </button>
            </div>
        );
    }

    if (phase === 'collecting') {
        const pct = total > 0 ? Math.min(100, Math.round((loaded / Math.min(total, cap)) * 100)) : 0;
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1 w-24 overflow-hidden rounded bg-muted">
                    <span className="block h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                </span>
                <span>
                    {total > 0
                        ? t('progress.collectingOf', { loaded: n(loaded), total: n(Math.min(total, cap)) })
                        : t('progress.collecting', { loaded: n(loaded) })}
                </span>
            </div>
        );
    }

    const isHeld = fetchedAt !== undefined && Date.now() - fetchedAt >= HELD_NOTICE_MS;
    const held = isHeld ? t('progress.held', { ago: formatAgo(fetchedAt, lng) }) : '';
    const heldTitle = isHeld ? formatDateTime(fetchedAt, lng, { seconds: true }) : undefined;

    if (phase === 'truncated') {
        return (
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                    className="rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-700 dark:text-yellow-400"
                    title={heldTitle}
                >
                    {t('progress.capped', { cap: n(cap), total: n(total), held })}
                </span>
                <span className="text-muted-foreground">{t('progress.cappedHint', { loaded: n(loaded) })}</span>
            </div>
        );
    }

    if (phase === 'complete') {
        return (
            <span className="text-xs text-muted-foreground" title={heldTitle}>
                {loaded === 0
                    ? t('progress.empty')
                    : t(loaded === 1 ? 'progress.completeOne' : 'progress.completeOther', { n: n(loaded), held })}
            </span>
        );
    }

    return null;
};
