import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { COLUMN_INSET, FORM_COLUMN } from '../../foundations/formColumn';

export interface ScreenLayoutProps {
    /** Fixed header (e.g. ModalTopBar / ChatRoomHeader / AppHeader). */
    header?: React.ReactNode;
    /** Pinned footer below the scroll area (e.g. a FloatingButton). */
    footer?: React.ReactNode;
    /** Scrollable body content. */
    children: React.ReactNode;
    /**
     * `form` keeps the body in the centred form column (`FORM_COLUMN`) and hands its width to a
     * docked CTA, for a screen of a few fields and one action. Default `app` fills the app column.
     */
    width?: 'app' | 'form';
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
 */
export const ScreenLayout = ({ header, footer, children, width = 'app', className }: ScreenLayoutProps) => {
    return (
        <div
            className={cn(
                'mx-auto flex h-full w-full max-w-[var(--app-width,40rem)] flex-col bg-background',
                width === 'form' && FORM_COLUMN,
                className
            )}
        >
            {header && <div className="shrink-0">{header}</div>}
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', width === 'form' && COLUMN_INSET)}>
                {children}
            </div>
            {footer ? <div className="shrink-0">{footer}</div> : <div className="shrink-0 pb-safe-bottom" />}
        </div>
    );
};
