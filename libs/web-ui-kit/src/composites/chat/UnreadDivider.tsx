import { cn } from '@chatic/ui-kit';

export interface UnreadDividerProps {
    /** Localized label, count included (e.g. "여기부터 안 읽은 메시지 26개"). */
    label: string;
    className?: string;
}

/**
 * The line above the first message the reader had not read when they entered the room (Figma
 * 6170:26376): a red label between two light-red rules. Presentational — where it goes and what it
 * counts are the host's.
 */
export const UnreadDivider = ({ label, className }: UnreadDividerProps) => (
    <div role="separator" aria-label={label} className={cn('flex w-full items-center gap-2 px-4 py-2.5', className)}>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-alert-red/25" />
        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold tracking-[-0.22px] text-alert-red">
            {label}
        </span>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-alert-red/25" />
    </div>
);
