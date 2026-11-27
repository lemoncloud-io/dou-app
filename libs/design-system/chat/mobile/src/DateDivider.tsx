import { cn } from '@chatic/ui-kit';

export interface DateDividerProps {
    label: string;
    className?: string;
}

export const DateDivider = ({ label, className }: DateDividerProps) => {
    return (
        <div className={cn('flex w-full items-center justify-center py-2', className)}>
            <span className="text-[13px] leading-4 tracking-[-0.065px] text-description">{label}</span>
        </div>
    );
};
