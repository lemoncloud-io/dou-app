import { useT } from '../../../i18n';
import { formatNumber } from '../lib/timeFormat';

interface NewLogsBannerProps {
    count: number;
    overflowed?: boolean;
    onAccept: () => void;
}

export const NewLogsBanner = ({ count, overflowed = false, onAccept }: NewLogsBannerProps) => {
    const { t, lng } = useT('allLogs');
    if (count <= 0 && !overflowed) return null;

    return (
        <button
            type="button"
            onClick={onAccept}
            title={overflowed ? t('banner.overflowTitle') : undefined}
            className="flex items-center gap-2 self-start rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
        >
            <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
            {t(overflowed ? 'banner.overflowed' : 'banner.load', { n: formatNumber(count, lng) })}
        </button>
    );
};
