import { cn } from '@chatic/lib/utils';

import { IconAtSign, IconThreadChip } from '../../resources/icons';

export interface ActivityCountBadgeProps {
    /** `mention` — the orange @ with a count; `thread` — the blue bubble with a count. */
    variant: 'mention' | 'thread';
    /** How many. `<= 0` renders nothing; above `max` → "+max". */
    count: number;
    max?: number;
    /** Accessible announcement (e.g. a localized "2 unread mentions"). */
    label?: string;
    className?: string;
}

/**
 * Activity count — the small grey pill a chat-list row carries next to its unread count, saying how
 * many of the unread are mentions of me or replies in my threads (Figma "스레드" 5956:31633 in the
 * home row 5953:31283). Renders nothing at zero.
 */
export const ActivityCountBadge = ({ variant, count, max = 99, label, className }: ActivityCountBadgeProps) => {
    if (count <= 0) return null;
    const text = count > max ? `+${max}` : String(count);
    return (
        <span
            role="status"
            aria-label={label}
            className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-muted py-0.5 pl-[5px] pr-1.5 text-[11px] font-semibold leading-none tracking-[-0.22px]',
                variant === 'mention' ? 'text-point-orange' : 'text-point-blue',
                className
            )}
        >
            {variant === 'mention' ? (
                <IconAtSign size={13} strokeWidth={2} aria-hidden />
            ) : (
                <IconThreadChip size={13} />
            )}
            <span aria-hidden={label ? true : undefined}>{text}</span>
        </span>
    );
};
