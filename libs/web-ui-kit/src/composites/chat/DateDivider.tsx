import { cn } from '@chatic/lib/utils';

export interface DateDividerProps {
    /** Preformatted date label (e.g. "Monday, January 1, 2025"). */
    label: string;
    className?: string;
}

/**
 * Centered date separator between message groups in a chat room.
 */
export const DateDivider = ({ label, className }: DateDividerProps) => {
    return (
        <div className={cn('flex w-full items-center justify-center py-2', className)}>
            <span className="text-[13px] leading-4 tracking-[-0.065px] text-description">{label}</span>
        </div>
    );
};
