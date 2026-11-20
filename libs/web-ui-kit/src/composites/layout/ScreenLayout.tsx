import * as React from 'react';

import { cn } from '@chatic/ui-kit';

/**
 * Height of the strip under a footer. Both variables are set by the native shell; a browser has
 * neither, and the `0px` fallbacks collapse the strip to nothing.
 */
const FOOTER_BOTTOM_CLEARANCE = 'max(var(--safe-bottom, 0px), var(--keyboard-height, 0px))';

export interface ScreenLayoutProps {
    /** Fixed header (e.g. ModalTopBar / ChatRoomHeader / AppHeader). */
    header?: React.ReactNode;
    /**
     * Pinned footer below the scroll area (e.g. a FloatingButton). The scaffold keeps it clear of the
     * bottom inset and the on-screen keyboard itself, so the footer pads only its own breathing room.
     */
    footer?: React.ReactNode;
    /** Scrollable body content. */
    children: React.ReactNode;
    className?: string;
}

/**
 * Full-height screen scaffold — composes a fixed header, a scrollable body and a
 * pinned footer. Screens are assembled by composing design-system components
 * into these slots, never authored as bespoke screen components.
 *
 * Responsive: fills the device and centers once past the host's own width cap.
 * That cap is the host's `--app-width`, the same value every other surface stops
 * at — a second number here would stop these screens somewhere no other screen
 * does. The `40rem` fallback is this scaffold's previous cap to the pixel, so a
 * host that declares nothing (a desktop one) is unaffected. Honors the bottom
 * safe-area inset when there is no footer. Requires a height-constrained parent
 * (e.g. `h-screen`).
 *
 * A footer rides on a tail spacer of `max(--safe-bottom, --keyboard-height)`: clear of the home
 * indicator or Android's navigation bar while the keyboard is down, and right on top of the keyboard
 * while it is up. The WebView does not shrink for the keyboard (the shell injects its height
 * instead), so without this a footer CTA sat behind both. `max()`, never a sum: the keyboard already
 * covers the bottom inset.
 */
export const ScreenLayout = ({ header, footer, children, className }: ScreenLayoutProps) => {
    return (
        <div
            className={cn(
                'mx-auto flex h-full w-full max-w-[var(--app-width,40rem)] flex-col bg-background',
                className
            )}
        >
            {header && <div className="shrink-0">{header}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer ? (
                <div className="flex shrink-0 flex-col">
                    {footer}
                    {/* `touch-none` + preventing touchmove: dragging on the strip must not rubber-band
                        the page behind it. */}
                    <div
                        data-testid="screen-layout-footer-inset"
                        aria-hidden
                        className="shrink-0 touch-none bg-background"
                        style={{ height: FOOTER_BOTTOM_CLEARANCE }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </div>
            ) : (
                <div className="shrink-0 pb-safe-bottom" />
            )}
        </div>
    );
};
