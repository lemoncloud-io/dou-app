import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

export interface FileSelectionAction {
    /** Stable identifier, used as the React key. */
    key: string;
    /** A 24px glyph (e.g. `IconDownload`, `IconShare`, `IconTrash`). Coloured by the button. */
    icon: React.ReactNode;
    /** The word under the glyph; also the button's accessible name. */
    label: string;
    onPress: () => void;
    /** Faded to 30% and inert — nothing picked, or the pick contains something this action cannot take. */
    disabled?: boolean;
    /** The red action — delete. */
    destructive?: boolean;
}

export interface FileSelectionActionBarProps {
    /** Buttons, left to right, spread across the bar (Save · Share · Delete in the room file list). */
    actions: FileSelectionAction[];
    /**
     * A hint in a soft box above the buttons (Figma "대화방 파일 · 선택 안내" 6082:23537) — why some
     * actions are off, or a limit on how many files one action takes. Omitted, the bar is buttons only.
     */
    notice?: string;
    /** The toolbar's accessible name. */
    label?: string;
    className?: string;
}

/**
 * The room file list's bottom bar while picking files (Figma "대화방 파일 · 선택 하단 바" 6082:23364):
 * a row of glyph-over-word buttons on a white bar with a hairline above. Its three states — all off
 * (6082:23283), all on (6082:23323) and delete only (6082:23363) — are each action's own `disabled`,
 * set by the host from what is picked.
 *
 * Pinned to the bottom of the screen above the safe-area inset, like the notification list's
 * `SelectionActionBar`, and it publishes its height so the app's snackbar rests above it rather than
 * on its buttons.
 */
export const FileSelectionActionBar = ({
    actions,
    notice,
    label = 'Selection actions',
    className,
}: FileSelectionActionBarProps) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [height, setHeight] = React.useState<number | null>(null);

    // Measured after every render rather than once: the notice comes and goes with the selection,
    // and the snackbar has to clear whichever bar is on screen now.
    React.useLayoutEffect(() => {
        const next = ref.current?.offsetHeight || null;
        if (next !== height) setHeight(next);
    });
    useToastLift(height);

    return (
        <div
            ref={ref}
            className={cn(
                'fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[var(--app-width,430px)] border-t border-input-border bg-surface px-3 pt-4',
                // It takes the place of the screen's own bottom edge, so it rises from there.
                'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-4 motion-reduce:animate-none',
                className
            )}
            style={{ paddingBottom: 'max(24px, calc(var(--safe-bottom, 0px) + 8px))' }}
        >
            {notice && (
                <p className="mx-1 mb-4 rounded-[10px] bg-action-soft px-3 py-2.5 text-[13px] font-medium leading-normal text-label">
                    {notice}
                </p>
            )}
            <div role="toolbar" aria-label={label} className="flex items-start justify-between">
                {actions.map(action => (
                    <button
                        key={action.key}
                        type="button"
                        onClick={action.onPress}
                        disabled={action.disabled}
                        data-destructive={action.destructive || undefined}
                        className={cn(
                            'flex w-20 shrink-0 flex-col items-center gap-1 transition-opacity duration-150 active:opacity-60 disabled:opacity-30 motion-reduce:transition-none',
                            action.destructive ? 'text-alert-red' : 'text-foreground'
                        )}
                    >
                        <span aria-hidden className="flex size-6 items-center justify-center">
                            {action.icon}
                        </span>
                        <span
                            className={cn(
                                'whitespace-nowrap text-[12px] font-medium leading-normal',
                                !action.destructive && 'text-label'
                            )}
                        >
                            {action.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};
