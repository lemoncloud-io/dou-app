import { cn } from '@chatic/ui-kit';

export interface UnreadBadgeProps {
    count: number;
    max?: number;
    variant?: 'accent' | 'pill';
    label?: string;
    className?: string;
}

export const UnreadBadge = ({ count, max = 999, variant = 'accent', label, className }: UnreadBadgeProps) => {
    if (count <= 0) return null;
    const text = count > max ? `+${max}` : count;
    return (
        <span
            role="status"
            aria-label={label}
            className={cn(
                variant === 'pill'
                    ? 'inline-flex items-center justify-center rounded-full bg-point-pink px-2 py-1.5 text-[12px] font-semibold leading-[11px] tracking-[-0.12px] text-white'
                    : 'text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent',
                className
            )}
        >
            {text}
        </span>
    );
};
