import { cn } from '@chatic/ui-kit';

export interface FileSelectionHeaderProps {
    title: string;
    onCancel: () => void;
    cancelLabel?: string;
    toggleAllLabel?: string;
    onToggleAll: () => void;
    toggleAllDisabled?: boolean;
    safeArea?: boolean;
    className?: string;
}

export const FileSelectionHeader = ({
    title,
    onCancel,
    cancelLabel = 'Cancel',
    toggleAllLabel = 'Select all',
    onToggleAll,
    toggleAllDisabled = false,
    safeArea = true,
    className,
}: FileSelectionHeaderProps) => (
    <header className={cn('w-full bg-surface', safeArea && 'pt-[var(--safe-top,0px)]', className)}>
        <div className="flex h-14 items-center justify-between gap-2 px-4">
            <button
                type="button"
                onClick={onCancel}
                className="min-w-[72px] shrink-0 whitespace-nowrap text-left text-[15px] font-semibold leading-normal text-foreground transition-opacity active:opacity-60"
            >
                {cancelLabel}
            </button>
            <p
                aria-live="polite"
                className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold leading-normal text-foreground"
            >
                {title}
            </p>
            <button
                type="button"
                onClick={onToggleAll}
                disabled={toggleAllDisabled}
                className="min-w-[72px] shrink-0 whitespace-nowrap text-right text-[15px] font-semibold leading-normal text-brand-ink transition-opacity active:opacity-60 disabled:opacity-40 dark:text-foreground"
            >
                {toggleAllLabel}
            </button>
        </div>
    </header>
);
