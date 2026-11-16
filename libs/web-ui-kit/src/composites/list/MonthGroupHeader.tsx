import { cn } from '@chatic/ui-kit';

export interface MonthGroupHeaderProps {
    /** The month, already formatted by the host (e.g. a localized "November 2026"). */
    label: string;
    /**
     * Keeps the header pinned to the top of the scrolling list until the next month's header pushes
     * it away. It then needs a ground of its own, so the rows sliding under it do not show through.
     */
    sticky?: boolean;
    className?: string;
}

/**
 * Month header — the "2026년 11월" line above a month's rows in a room's file list (Figma 6067:22462
 * on the audio tab 6067:22415): 13px semibold grey, 14px above and 6px below, flush with the rows'
 * 16px inset.
 *
 * A heading, so a screen-reader user can jump month to month the way a sighted one scans the list.
 */
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
