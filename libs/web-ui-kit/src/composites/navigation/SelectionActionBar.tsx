import { cn } from '@chatic/ui-kit';

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
    /**
     * `screen` (default) pins the bar to the bottom of the screen in the bottom nav's place, above the
     * safe-area inset. `inline` lays it out where the host puts it — a sheet's pinned footer, which
     * already sits above the inset and would otherwise be covered by a bar fixed to the screen.
     */
    placement?: 'screen' | 'inline';
    className?: string;
}

/**
 * Selection action bar — the two-button bar that replaces the bottom navigation while notifications
 * are being selected (Figma "선택 액션 바" 6026:19945): a soft "mark as read" and a red "delete",
 * each half the width. Pinned to the bottom of the screen above the safe-area inset.
 *
 * Stateless: labels (with their counts) and enabled state come from the host.
 */
export const SelectionActionBar = ({
    secondary,
    destructive,
    placement = 'screen',
    className,
}: SelectionActionBarProps) => (
    <div
        data-placement={placement}
        className={cn(
            'flex gap-2 border-t border-input-border bg-background px-4 pt-3',
            placement === 'screen'
                ? 'fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[var(--app-width,430px)]'
                : 'w-full bg-surface pb-3',
            // It takes the bottom nav's place (or the sheet's foot), so it rises from there.
            'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-4 motion-reduce:animate-none',
            className
        )}
        style={placement === 'screen' ? { paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' } : undefined}
    >
        <button
            type="button"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            className="h-12 flex-1 rounded-xl bg-action-soft text-[15px] font-semibold text-nav-ink transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none"
        >
            {secondary.label}
        </button>
        <button
            type="button"
            onClick={destructive.onClick}
            disabled={destructive.disabled}
            className="h-12 flex-1 rounded-xl bg-alert-red text-[15px] font-semibold text-white transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none"
        >
            {destructive.label}
        </button>
    </div>
);
