import * as React from 'react';

import { cn } from '@chatic/ui-kit';

const FOOTER_BOTTOM_CLEARANCE = 'max(var(--safe-bottom, 0px), var(--keyboard-height, 0px))';

export interface ScreenLayoutProps {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

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
