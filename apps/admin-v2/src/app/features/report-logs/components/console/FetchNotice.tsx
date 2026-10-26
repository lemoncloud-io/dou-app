/**
 * `components/report-logs/console/FetchNotice.tsx`
 * - The one line that says whether what is on screen is everything: still loading, failed, or
 *   cut short at the fetch limit.
 *
 * A cut-short fetch is said in words a non-engineer can act on — "only the newest N, narrow the
 * period" — because the alternative is someone reading "no errors on the new version" off the
 * newest 500 records of everything.
 */
import { useT } from '../../../../i18n';
import type { LogCorpus } from '../../hooks/use-log-corpus';
import { formatNumber } from '../../lib/timeFormat';

interface FetchNoticeProps {
    corpus: Pick<LogCorpus, 'phase' | 'error' | 'loaded' | 'isTruncated' | 'reload'>;
}

export const FetchNotice = ({ corpus }: FetchNoticeProps) => {
    const { t, lng } = useT('common');
    if (corpus.phase === 'failed') {
        return (
            <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
                <span>{t('fetch.failed', { message: corpus.error?.message ?? '-' })}</span>
                <button
                    type="button"
                    onClick={corpus.reload}
                    className="rounded-md border border-destructive/40 px-2 py-0.5"
                >
                    {t('fetch.retry')}
                </button>
            </div>
        );
    }
    if (corpus.phase === 'collecting' && corpus.loaded === 0) {
        return <p className="text-sm text-muted-foreground">{t('fetch.loading')}</p>;
    }
    if (corpus.isTruncated) {
        return (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                {t('fetch.partial', { n: formatNumber(corpus.loaded, lng) })}
            </p>
        );
    }
    return null;
};
