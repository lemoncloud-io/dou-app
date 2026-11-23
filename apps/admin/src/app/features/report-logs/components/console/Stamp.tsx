import { useT } from '../../../../i18n';
import { formatAgo, formatDateTime } from '../../lib/timeFormat';

interface StampProps {
    ms?: number;
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
