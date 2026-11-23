import { useTranslation } from 'react-i18next';

import { formatLongDate } from '../../../shared';
import { FEED_GAP_PX } from './feedWindow';

interface DateSeparatorProps {
    timestamp: number;
    rowKey?: string;
}

const isSameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const PILL_HEIGHT_PX = 22;

export const DateSeparator = ({ timestamp, rowKey }: DateSeparatorProps) => {
    const { t } = useTranslation();

    const formatLabel = (): string => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        if (isSameDay(date, now)) return t('chat.today');
        if (isSameDay(date, yesterday)) return t('chat.yesterday');
        return formatLongDate(timestamp);
    };

    return (
        <>
            <div data-row-key={rowKey} className="pointer-events-none sticky -top-5 z-raised flex justify-center pt-2">
                <span
                    style={{ height: PILL_HEIGHT_PX }}
                    className="pointer-events-auto flex items-center rounded-full border border-hairline bg-background px-3 text-micro font-medium tabular-nums text-label shadow-raised"
                >
                    {formatLabel()}
                </span>
            </div>
            <div
                aria-hidden
                style={{ marginTop: -(PILL_HEIGHT_PX / 2 + 1 + FEED_GAP_PX) }}
                className="mb-3 h-px bg-hairline"
            />
        </>
    );
};
