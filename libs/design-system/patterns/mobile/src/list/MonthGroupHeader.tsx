import { cn } from '@chatic/ui-kit';

export interface MonthGroupHeaderProps {
    label: string;
    sticky?: boolean;
    className?: string;
}

export const MonthGroupHeader = ({ label, sticky = false, className }: MonthGroupHeaderProps) => (
    <h3
        data-sticky={sticky || undefined}
        className={cn(
            'flex w-full items-start pb-1.5 pl-4 pr-4 pt-3.5 text-[13px] font-semibold leading-normal text-description',
            sticky && 'sticky top-0 z-[1] bg-surface',
            className
        )}
    >
        {label}
    </h3>
);
