import { cn } from '@chatic/lib/utils';

export interface FloatingDateChipProps {
    /** Preformatted short date label (e.g. "7. 01 월"). */
    label: string;
    /**
     * Whether the chip is shown. Toggling fades it in/out; when hidden it also
     * stops catching pointer events. Defaults to `true`.
     */
    visible?: boolean;
    className?: string;
}

/**
 * Floating date chip — the Figma scroll-time date pill (node 3188:24204): a
 * frosted, semi-transparent pill that surfaces the date of the group currently
 * pinned to the top of the message list while scrolling, then fades out.
 * Purely presentational; the host owns the label, the visibility, and the
 * fade-out timer.
 */
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
