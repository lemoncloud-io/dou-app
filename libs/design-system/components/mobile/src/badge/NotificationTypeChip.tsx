import { cn } from '@chatic/ui-kit';

import { IconAtSign, IconThreadChip } from '@chatic/design-system-assets/icons';

export type NotificationTypeChipVariant = 'mention' | 'thread';

export interface NotificationTypeChipProps {
    variant: NotificationTypeChipVariant;
    label: string;
    className?: string;
}

const TONE: Record<NotificationTypeChipVariant, string> = {
    mention: 'text-point-orange',
    thread: 'text-point-blue',
};

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
