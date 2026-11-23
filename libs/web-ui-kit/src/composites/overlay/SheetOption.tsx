import { cn } from '@chatic/ui-kit';

export interface SheetOptionProps {
    label: string;
    selected?: boolean;
    onSelect?: () => void;
    showDivider?: boolean;
    className?: string;
}

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
