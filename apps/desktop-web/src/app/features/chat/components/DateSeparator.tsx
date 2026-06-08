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

    return (
        <div className="flex items-center gap-3 py-2">
            <div className="h-px flex-1 bg-border" />
            <span className="rounded-full border border-border bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                {formatLabel()}
            </span>
            <div className="h-px flex-1 bg-border" />
        </div>
    );
};
