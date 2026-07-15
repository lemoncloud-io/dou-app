import { cn } from '@chatic/lib/utils';

export interface UnreadBadgeProps {
    /** Unread count. Values above `max` render as "+max". */
    count: number;
    max?: number;
    /**
     * Accessible label (e.g. a localized "3개 안 읽음"). Supplied by the host so
     * a screen reader announces context, not a bare number. Kept i18n-agnostic.
     */
    label?: string;
    className?: string;
}

/**
 * Unread message count — the accent-colored number shown next to a message
 * timestamp / chat row. Renders nothing when count is 0.
 */
export const UnreadBadge = ({ count, max = 999, label, className }: UnreadBadgeProps) => {
    if (count <= 0) return null;
    return (
        <span
            role="status"
            aria-label={label}
            className={cn('text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent', className)}
        >
            {count > max ? `+${max}` : count}
        </span>
    );
};
