import { cn } from '@chatic/lib/utils';

export interface SheetOptionProps {
    /** Option label. */
    label: string;
    /** Selected (radio filled) state. */
    selected?: boolean;
    onSelect?: () => void;
    /** Draws a bottom divider. */
    showDivider?: boolean;
    className?: string;
}

/**
 * Single-select row for a bottom sheet — the Figma report-reason list item: a
 * label with a trailing radio, and an optional bottom divider.
 */
export const SheetOption = ({ label, selected = false, onSelect, showDivider = true, className }: SheetOptionProps) => {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'flex w-full items-center justify-between px-4 py-3.5',
                showDivider && 'border-b border-input-border',
                className
            )}
        >
            <span className="text-[16px] leading-6 tracking-[-0.08px] text-foreground">{label}</span>
            <span
                className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-main-accent' : 'border-placeholder'
                )}
            >
                {selected && <span className="size-2.5 rounded-full bg-main-accent" />}
            </span>
        </button>
    );
};
