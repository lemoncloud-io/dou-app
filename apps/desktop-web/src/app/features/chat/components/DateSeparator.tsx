import { useTranslation } from 'react-i18next';

interface DateSeparatorProps {
    timestamp: number;
}

const isSameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

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
        return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // The pill sticks to the top of the feed while its day scrolls by (MessageList wraps
    // each day in its own block, so the next day's pill takes over at the boundary). The
    // rule is a separate, non-sticky line pulled up behind the pill, so it scrolls away
    // with the day instead of striking through the messages under a stuck pill.
    return (
        <>
            <div className="pointer-events-none sticky top-0 z-10 flex justify-center pt-2">
                <span className="pointer-events-auto rounded-full border border-hairline bg-background px-3 py-0.5 text-[12px] font-medium tabular-nums text-label shadow-raised">
                    {formatLabel()}
                </span>
            </div>
            <div aria-hidden className="-mt-[19px] mb-3 h-px bg-hairline" />
        </>
    );
};
