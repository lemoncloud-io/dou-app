import { type ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

import { useBottomChromeToastLift } from '../hooks/useBottomChromeToastLift';
import { useChromeInsets } from '../hooks/useChromeInsets';
import { keyboardSafeBottom } from './KeyboardSafeAreaSpacer';

interface KeyboardAwareLayoutProps {
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    headerSafeArea?: boolean;
    className?: string;
}

export const fixedViewportScreen = 'fixed inset-0 mx-auto max-w-app overflow-hidden';

export const KeyboardAwareLayout = ({
    header,
    footer,
    children,
    headerSafeArea = true,
    className,
}: KeyboardAwareLayoutProps) => {
    const { headerRef, footerRef, headerHeight, footerHeight } = useChromeInsets();
    useBottomChromeToastLift(footer ? footerHeight : null);

    return (
        <div data-chrome-root className={cn('relative flex h-full flex-col overflow-hidden bg-background', className)}>
            {header && (
                <div
                    ref={headerRef}
                    data-chrome-overlay="top"
                    className={cn('absolute inset-x-0 top-0 z-20', headerSafeArea && 'pt-safe-top')}
                >
                    {header}
                </div>
            )}

            <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-none"
                style={{ paddingTop: headerHeight || undefined, paddingBottom: footer ? footerHeight : undefined }}
            >
                {children}
            </div>

            {footer && (
                <div
                    ref={footerRef}
                    data-chrome-overlay="bottom"
                    className="absolute inset-x-0 bottom-0 z-20 flex flex-col"
                >
                    {footer}
                    <div
                        className="shrink-0 touch-none bg-background"
                        style={{ height: keyboardSafeBottom() }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </div>
            )}
            {!footer && <div className="pb-safe-bottom" />}
        </div>
    );
};
