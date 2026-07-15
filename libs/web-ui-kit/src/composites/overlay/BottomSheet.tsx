import * as React from 'react';

import { Sheet as Root, SheetContent, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';

import { cn } from '@chatic/lib/utils';

import { IconClose } from '../../resources/icons';

export interface BottomSheetProps {
    /** Controls visibility. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Title shown in the header bar. Always rendered (visually hidden if empty) for a11y. */
    title?: string;
    /** Shows the close (X) button in the header. */
    onClose?: () => void;
    /** Shows the top drag handle. */
    showHandle?: boolean;
    /** Scrollable body content. */
    children?: React.ReactNode;
    /** Pinned footer (e.g. a FloatingButton) below the scroll area. */
    footer?: React.ReactNode;
    closeLabel?: string;
    /** className applied to the sheet panel. */
    className?: string;
}

/**
 * Bottom sheet — the Figma "Bottom sheet" design system: a bottom-anchored panel
 * with a rounded top, an optional drag handle and title/close header, a
 * scrollable body, and a pinned footer. Built on the shared Radix Sheet
 * (side="bottom"); honors the bottom safe-area inset.
 */
export const BottomSheet = ({
    open,
    onOpenChange,
    title,
    onClose,
    showHandle = false,
    children,
    footer,
    closeLabel = 'Close',
    className,
}: BottomSheetProps) => {
    const handleClose = () => {
        onClose?.();
        onOpenChange(false);
    };

    return (
        <Root open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                hideClose
                className={cn(
                    'flex max-h-[90vh] flex-col gap-0 rounded-t-[16px] border-0 bg-surface p-0 pb-safe-bottom',
                    className
                )}
            >
                {showHandle && <span className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-input-border" />}

                <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
                    <SheetTitle
                        className={cn(
                            'truncate text-[17px] font-semibold leading-6 text-foreground',
                            !title && 'sr-only'
                        )}
                    >
                        {title}
                    </SheetTitle>
                    {onClose && (
                        <button
                            type="button"
                            onClick={handleClose}
                            aria-label={closeLabel}
                            className="flex size-6 shrink-0 items-center justify-center"
                        >
                            <IconClose className="size-[18px] text-foreground" />
                        </button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

                {footer && <div className="shrink-0">{footer}</div>}
            </SheetContent>
        </Root>
    );
};
