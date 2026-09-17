import { useTranslation } from 'react-i18next';

import { formatLongDate } from '../../../shared';

interface DateSeparatorProps {
    timestamp: number;
}

const isSameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Fixed pill height; the rule behind it is positioned from the same number. */
const PILL_HEIGHT_PX = 22;

export const DateSeparator = ({ timestamp }: DateSeparatorProps) => {
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

    // The pill sticks to the top of the feed while its day scrolls by (MessageList wraps
    // each day in its own block, so the next day's pill takes over at the boundary). The
    // rule is a separate, non-sticky line pulled up behind the pill, so it scrolls away
    // with the day instead of striking through the messages under a stuck pill.
    return (
        <>
            <div className="pointer-events-none sticky top-0 z-10 flex justify-center pt-2">
                <span
                    style={{ height: PILL_HEIGHT_PX }}
                    className="pointer-events-auto flex items-center rounded-full border border-hairline bg-background px-3 text-[12px] font-medium tabular-nums text-label shadow-raised"
                >
                    {formatLabel()}
                </span>
            </div>
            {/* Pulled up to the pill's vertical centre. Both numbers come from the one
                constant, so a type change can no longer strike the rule through the
                messages below. */}
            <div aria-hidden style={{ marginTop: -(PILL_HEIGHT_PX / 2 + 1) }} className="mb-3 h-px bg-hairline" />
        </>
    );
};
