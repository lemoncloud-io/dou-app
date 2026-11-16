import { cn } from '@chatic/ui-kit';

export interface FileSelectionHeaderProps {
    /**
     * The centre title, formatted by the host: "Select items" with nothing picked, "2 selected" after
     * (Figma 6082:23243 — "항목 선택" / "n개 선택").
     */
    title: string;
    /** Leaves selection mode. */
    onCancel: () => void;
    /** The left text button. */
    cancelLabel?: string;
    /** The right text button — "Select all", or "Deselect all" once everything is picked. */
    toggleAllLabel?: string;
    onToggleAll: () => void;
    /** Nothing to pick (an empty list): the right button stays visible but does nothing. */
    toggleAllDisabled?: boolean;
    /** Adds the status-bar inset above the 56px row, for a header that sits at the top of the screen. */
    safeArea?: boolean;
    className?: string;
}

/**
 * The room file list's header while picking files (Figma "대화방 파일 · 선택 헤더" 6082:23243): a
 * 56px row with "Cancel" on the left, the selection count in the centre and "Select all" /
 * "Deselect all" on the right, in navy.
 *
 * Both side buttons hold the same minimum width (72px in the design), so the title stays centred
 * whichever of "Select all" and "Deselect all" the right one says. The title is a polite live
 * region: picking a row changes nothing else a screen reader would announce.
 */
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
