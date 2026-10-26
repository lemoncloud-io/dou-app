/**
 * `components/report-logs/CorpusProgress.tsx`
 * - Says how much of the filtered range is actually in front of the operator.
 *
 * Every count, facet and chart on this screen is computed over the collected corpus, not
 * over the server's full result set. When the two differ, saying so is not a disclaimer —
 * it is the difference between "no errors on the new version" and "no errors in the
 * 5,000 rows I happened to read". So the truncated state names the fix (narrow the range)
 * rather than just flagging a limit.
 */
import { useT } from '../../../i18n';
import type { CorpusPhase } from '../hooks/use-log-corpus';
import { formatAgo, formatDateTime, formatNumber } from '../lib/timeFormat';

interface CorpusProgressProps {
    phase: CorpusPhase;
    loaded: number;
    total: number;
    cap: number;
    error: Error | null;
    /**
     * When the rows on screen were fetched. Only surfaced once they are old enough to
     * matter: a count read as "now" when it is ten minutes old is the kind of quiet
     * wrongness this screen is built to avoid, but stamping an age on rows that just
     * arrived is noise.
     */
    fetchedAt?: number;
    onRetry: () => void;
}

/** Below this the rows are current enough that stamping an age on them is just noise. */
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
        // The denominator is the server's total, so the operator can see how much is left
        // before deciding whether to wait or narrow the range now.
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

    // Appended to a settled state rather than replacing it: what was collected is still
    // what is on screen, the only extra fact is when.
    const isHeld = fetchedAt !== undefined && Date.now() - fetchedAt >= HELD_NOTICE_MS;
    const held = isHeld ? t('progress.held', { ago: formatAgo(fetchedAt, lng) }) : '';
    // The age is relative, so the instant it stands for sits in the tooltip.
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
