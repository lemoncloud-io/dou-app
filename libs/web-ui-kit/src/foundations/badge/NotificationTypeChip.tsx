import { cn } from '@chatic/lib/utils';

import { IconAtSign, IconThreadChip } from '../../resources/icons';

export type NotificationTypeChipVariant = 'mention' | 'thread';

export interface NotificationTypeChipProps {
    /** `mention` — the orange @ chip; `thread` — the blue bubble chip. */
    variant: NotificationTypeChipVariant;
    /** Chip text (e.g. a localized "Mention" / "Thread"). */
    label: string;
    className?: string;
}

const TONE: Record<NotificationTypeChipVariant, string> = {
    mention: 'text-point-orange',
    thread: 'text-point-blue',
};

/**
 * Notification type chip — the small outlined tag that opens a notification row's location line
 * (Figma "유형 칩" in the notification row 6023:19308): an orange @ for a mention, a blue bubble for
 * a thread reply. Reactions and new 1:1 messages carry no chip.
 */
export const NotificationTypeChip = ({ variant, label, className }: NotificationTypeChipProps) => (
    <span
        className={cn(
            'inline-flex shrink-0 items-center gap-[3px] rounded-md border border-input-border px-1 py-0.5 text-[11px] font-medium leading-[1.4]',
            TONE[variant],
            className
        )}
    >
        {variant === 'mention' ? <IconAtSign size={12} strokeWidth={2} aria-hidden /> : <IconThreadChip />}
        <span className="whitespace-nowrap">{label}</span>
    </span>
);
