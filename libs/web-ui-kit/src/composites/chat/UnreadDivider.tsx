import { cn } from '@chatic/ui-kit';

export interface UnreadDividerProps {
    label: string;
    className?: string;
}

export const UnreadDivider = ({ label, className }: UnreadDividerProps) => (
    <div role="separator" aria-label={label} className={cn('flex w-full items-center gap-2 px-4 py-2.5', className)}>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-alert-red/25" />
        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold tracking-[-0.22px] text-alert-red">
            {label}
        </span>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-alert-red/25" />
    </div>
);
