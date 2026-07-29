import { cn } from '@chatic/lib/utils';

export interface UnreadBadgeProps {
    /** Unread count. Values above `max` render as "+max". */
    count: number;
    max?: number;
    /**
     * `accent` (default) = the bare accent-colored number next to a timestamp.
     * `pill` = a filled accent pill with white text — the chat-list count badge.
     */
    variant?: 'accent' | 'pill';
    /**
     * Accessible label (e.g. a localized "3개 안 읽음"). Supplied by the host so
     * a screen reader announces context, not a bare number. Kept i18n-agnostic.
     */
    label?: string;
    className?: string;
}

/**
 * Unread message count — either the accent-colored number shown next to a
 * timestamp (`accent`) or a filled pill used in the chat list (`pill`).
 * Renders nothing when count is 0.
 *
 * The two variants intentionally use different colors: the chat-list pill is Figma
 * `Colors/Pink` (#FF2D55, node 3410-51128), while the inline `accent` number stays on the
 * green main accent.
 */
export const UnreadBadge = ({ count, max = 999, variant = 'accent', label, className }: UnreadBadgeProps) => {
    if (count <= 0) return null;
    const text = count > max ? `+${max}` : count;
    return (
        <span
            role="status"
            aria-label={label}
            className={cn(
                variant === 'pill'
                    ? // Figma 3410-51145: 8px/6px padding, 12px semibold, fully rounded.
                      'inline-flex items-center justify-center rounded-full bg-point-pink px-2 py-1.5 text-[12px] font-semibold leading-[11px] tracking-[-0.12px] text-white'
                    : 'text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent',
                className
            )}
        >
            {text}
        </span>
    );
};
