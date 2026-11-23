import { cn } from '@chatic/ui-kit';

export interface FloatingDateChipProps {
    label: string;
    visible?: boolean;
    className?: string;
}

export const FloatingDateChip = ({ label, visible = true, className }: FloatingDateChipProps) => (
    <div
        aria-hidden={!visible}
        className={cn(
            'pointer-events-none rounded-[7px] bg-surface/80 px-2 py-1 backdrop-blur-[2px]',
            'text-[11px] font-semibold leading-none tracking-[-0.055px] text-foreground',
            'transition-opacity duration-200',
            visible ? 'opacity-100' : 'opacity-0',
            className
        )}
    >
        {label}
    </div>
);
