import { cn } from '@chatic/ui-kit';

import { IconAtSign, IconJumpArrow } from '@chatic/design-system-assets/icons';

export type JumpPillVariant = 'mention' | 'latest';

export interface JumpPillProps {
    variant: JumpPillVariant;
    label: string;
    onClick: () => void;
    className?: string;
}

export const JumpPill = ({ variant, label, onClick, className }: JumpPillProps) => {
    const isMention = variant === 'mention';
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-[20px] py-2 pl-3 pr-3.5 text-[13px] font-bold leading-4 tracking-[-0.26px] transition-transform active:scale-95',
                'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-95 motion-reduce:animate-none',
                isMention
                    ? 'border border-point-orange bg-background text-point-orange shadow-[0_4px_12px_0_rgba(0,0,0,0.12)]'
                    : 'bg-chip-ink text-white shadow-[0_4px_12px_0_rgba(0,0,0,0.15)]',
                className
            )}
        >
            {isMention && <IconAtSign size={16} strokeWidth={2} aria-hidden />}
            <span className="whitespace-nowrap">{label}</span>
            <IconJumpArrow className={cn(!isMention && 'rotate-180')} />
        </button>
    );
};
