import { cn } from '@chatic/ui-kit';

import { IconAtSign, IconThreadChip } from '../../resources/icons';

export interface ActivityCountBadgeProps {
    variant: 'mention' | 'thread';
    count: number;
    max?: number;
    label?: string;
    className?: string;
}

export const ActivityCountBadge = ({ variant, count, max = 99, label, className }: ActivityCountBadgeProps) => {
    if (count <= 0) return null;
    const text = count > max ? `+${max}` : String(count);
    return (
        <span
            role="status"
            aria-label={label}
            className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-muted py-0.5 pl-[5px] pr-1.5 text-[11px] font-semibold leading-none tracking-[-0.22px]',
                'duration-200 animate-in fade-in-0 zoom-in-75 motion-reduce:animate-none',
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
