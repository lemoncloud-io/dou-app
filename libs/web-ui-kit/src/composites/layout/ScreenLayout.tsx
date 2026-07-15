import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface ScreenLayoutProps {
    /** Fixed header (e.g. ModalTopBar / ChatRoomHeader / AppHeader). */
    header?: React.ReactNode;
    /** Pinned footer below the scroll area (e.g. a FloatingButton). */
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
 * Responsive: fluid full-width on mobile, centered to a comfortable max width on
 * larger viewports. Honors the bottom safe-area inset when there is no footer.
 * Requires a height-constrained parent (e.g. `h-screen`).
 */
export const ScreenLayout = ({ header, footer, children, className }: ScreenLayoutProps) => {
    return (
        <div className={cn('mx-auto flex h-full w-full max-w-screen-sm flex-col bg-background', className)}>
            {header && <div className="shrink-0">{header}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer ? <div className="shrink-0">{footer}</div> : <div className="shrink-0 pb-safe-bottom" />}
        </div>
    );
};
