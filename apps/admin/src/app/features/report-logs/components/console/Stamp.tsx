/**
 * `components/report-logs/console/Stamp.tsx`
 * - A moment shown both ways: the absolute time in Korean time, and how long ago.
 *
 * Either alone misleads somebody — "3시간 전" is useless in a screenshot pasted tomorrow, and
 * "14:03" leaves the reader to work out whether that was this afternoon. The seconds sit in the
 * tooltip for whoever needs to line it up with another system.
 */
import { useT } from '../../../../i18n';
import { formatAgo, formatDateTime } from '../../lib/timeFormat';

interface StampProps {
    ms?: number;
    /** Put the relative time first, for lists sorted by recency. */
    agoFirst?: boolean;
    className?: string;
}

export const Stamp = ({ ms, agoFirst = false, className = '' }: StampProps) => {
    const { lng } = useT('common');
    if (ms === undefined) return <span className={className}>-</span>;
    const absolute = formatDateTime(ms, lng);
    const ago = formatAgo(ms, lng);
    return (
        <time
            dateTime={new Date(ms).toISOString()}
            title={formatDateTime(ms, lng, { seconds: true })}
            className={`whitespace-nowrap ${className}`}
        >
            {agoFirst ? `${ago} · ${absolute}` : `${absolute} · ${ago}`}
        </time>
    );
};
