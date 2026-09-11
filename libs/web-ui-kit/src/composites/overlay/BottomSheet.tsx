import * as React from 'react';

import { Sheet as Root, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';

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
    /**
     * Screen-reader description of the sheet's purpose. Radix warns when a dialog has neither a
     * description nor an explicit opt-out, so omitting this opts out deliberately rather than by
     * accident. Host supplies a localized string.
     */
    description?: string;
    /** Shows the top drag handle. */
    showHandle?: boolean;
    /**
     * Drops the title / close header entirely, leaving the drag handle as the only chrome
     * (Figma "_Activity View", 4712:16421). For sheets whose content names itself — a row of
     * emoji, a list of faces — where a title bar spends 50px restating it and the close button
     * duplicates the swipe-down and the backdrop tap.
     *
     * `title` and `description` are still required for a11y and are moved into the panel's
     * accessible name instead of being drawn.
     */
    hideHeader?: boolean;
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
 *
 * Keyboard-aware: focusing a field inside the body lifts the whole panel above the soft keyboard and
 * shrinks its max height by the same amount, so the focused field and the footer CTA both stay
 * reachable instead of sitting behind the keyboard. See the `--keyboard-height` classes below.
 */
export const BottomSheet = ({
    open,
    onOpenChange,
    title,
    description,
    onClose,
    showHandle = false,
    hideHeader = false,
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
                // Radix links its own Description automatically, but warns when a dialog has neither
                // one nor an explicit opt-out — so pass the key (with no value) only when there is
                // nothing to link. Spreading it unconditionally would suppress the auto-link too.
                {...(description ? {} : { 'aria-describedby': undefined })}
                className={cn(
                    // overflow-hidden is what makes rounded-t actually visible: the glass header below
                    // paints its own square backdrop-filter box and would otherwise cover the corners.
                    'flex flex-col gap-0 overflow-hidden rounded-t-[16px] border-0 bg-surface p-0',
                    // Keyboard: ride above the soft keyboard rather than being buried under it, and
                    // give back exactly the height gained so the lifted panel cannot run off the top
                    // of the screen — the body scroll area absorbs the difference. `--keyboard-height`
                    // is injected by the native WebView (absent in a browser, where the keyboard never
                    // rises and both terms collapse to `bottom-0` / `90vh`).
                    'max-h-[calc(90vh-var(--keyboard-height,0px))]',
                    '[transform:translateY(calc(-1*var(--keyboard-height,0px)))]',
                    // Home-indicator inset, dropped while the keyboard is up: the keyboard already
                    // covers it and the panel has been lifted clear of both, so keeping it would just
                    // float the footer CTA above the keyboard by a stray 34px.
                    'pb-[max(0px,calc(var(--safe-bottom,0px)-var(--keyboard-height,0px)))]',
                    className
                )}
            >
                {/* Grabber (Figma 4712:16481): 36×5 at 5px from the top, over the content rather
                    than above it — which is why it is absolute and the body carries no offset for
                    it. `Labels/Tertiary` is an iOS system color with no token of its own. */}
                {showHandle && (
                    <span
                        aria-hidden
                        className="absolute left-1/2 top-[5px] z-10 h-[5px] w-9 -translate-x-1/2 rounded-[2.5px] bg-[rgba(60,60,67,0.3)] dark:bg-white/30"
                    />
                )}

                {hideHeader ? (
                    // Still named for assistive tech — just not drawn.
                    <>
                        <SheetTitle className="sr-only">{title}</SheetTitle>
                        {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
                    </>
                ) : (
                    /* Glass overlay header (Figma 3421-59848), same translucent treatment as ModalTopBar. */
                    <div className="flex shrink-0 items-center justify-between bg-white/[0.32] px-4 py-3.5 backdrop-blur-xl dark:bg-black/[0.32]">
                        <SheetTitle
                            className={cn(
                                'truncate text-[17px] font-semibold leading-6 text-foreground',
                                !title && 'sr-only'
                            )}
                        >
                            {title}
                        </SheetTitle>
                        {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
                        {onClose && (
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label={closeLabel}
                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted p-1"
                            >
                                <IconClose className="size-[18px] text-foreground" />
                            </button>
                        )}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

                {footer && <div className="shrink-0">{footer}</div>}
            </SheetContent>
        </Root>
    );
};
