import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconClose } from '../../resources/icons';

export interface ModalTopBarProps {
    /** Centered title. */
    title?: string;
    /** Called when the close (X) button is pressed. Omit to hide the button. */
    onClose?: () => void;
    /** Optional content for the 44px left slot (e.g. a back button). */
    leftSlot?: React.ReactNode;
    /** Optional content for the 44px right slot (e.g. a more button). Overrides the close button. */
    rightSlot?: React.ReactNode;
    /** Draws a bottom hairline divider under the bar (design-guide TopBar). */
    divider?: boolean;
    /** Accessible label for the close button. */
    closeLabel?: string;
    /** Adds top padding for the status-bar / notch safe-area inset. */
    safeArea?: boolean;
    className?: string;
}

const SLOT = 'flex h-11 w-11 shrink-0 items-center justify-center';

/**
 * Modal / full-screen header — the design guide's "top bar": a 44px left slot, a
 * centered title, and a 44px right slot. Right slot defaults to a close (X)
 * button via `onClose`, or supply `rightSlot` (e.g. a more button). Both side
 * slots reserve width so the title stays optically centered. `divider` adds the
 * bottom hairline.
 */
export const ModalTopBar = ({
    title,
    onClose,
    leftSlot,
    rightSlot,
    divider = false,
    closeLabel = 'Close',
    safeArea = true,
    className,
}: ModalTopBarProps) => {
    return (
        <header
            className={cn(
                'flex w-full items-center justify-between bg-surface px-1.5 pb-2',
                // Keep at least the base 8px top padding, plus the safe-area inset.
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                divider && 'border-b border-avatar-ring',
                className
            )}
        >
            <div className={SLOT}>{leftSlot}</div>

            <div className="flex min-w-0 flex-1 items-center justify-center px-2">
                <p className="truncate text-center text-[16px] font-semibold leading-[26px] tracking-[-0.08px] text-foreground">
                    {title}
                </p>
            </div>

            <div className={SLOT}>
                {rightSlot ??
                    (onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={closeLabel}
                            className="flex h-11 w-11 items-center justify-center"
                        >
                            <IconClose className="h-[26px] w-[26px] text-foreground" />
                        </button>
                    ))}
            </div>
        </header>
    );
};
