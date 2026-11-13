import { cn } from '@chatic/lib/utils';

export interface SelectionActionBarAction {
    /** Button text, count included (e.g. a localized "Mark as read 2"). */
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

export interface SelectionActionBarProps {
    /** The left, soft button — "mark as read". */
    secondary: SelectionActionBarAction;
    /** The right, red button — "delete". */
    destructive: SelectionActionBarAction;
    className?: string;
}

/**
 * Selection action bar — the two-button bar that replaces the bottom navigation while notifications
 * are being selected (Figma "선택 액션 바" 6026:19945): a soft "mark as read" and a red "delete",
 * each half the width. Pinned to the bottom of the screen above the safe-area inset.
 *
 * Stateless: labels (with their counts) and enabled state come from the host.
 */
export const SelectionActionBar = ({ secondary, destructive, className }: SelectionActionBarProps) => (
    <div
        className={cn(
            'fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[var(--app-width,430px)] gap-2 border-t border-input-border bg-background px-4 pt-3',
            className
        )}
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' }}
    >
        <button
            type="button"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            className="h-12 flex-1 rounded-xl bg-action-soft text-[15px] font-semibold text-nav-ink disabled:opacity-40"
        >
            {secondary.label}
        </button>
        <button
            type="button"
            onClick={destructive.onClick}
            disabled={destructive.disabled}
            className="h-12 flex-1 rounded-xl bg-alert-red text-[15px] font-semibold text-white disabled:opacity-40"
        >
            {destructive.label}
        </button>
    </div>
);
