import { type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { useChromeInsets } from '../hooks/useChromeInsets';

interface KeyboardAwareLayoutProps {
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}

/**
 * Full-screen scaffold: header and footer float as z-index overlays above a
 * full-bleed scrollable body, instead of being column siblings that push the
 * body down with their own height. This lets a translucent header/footer
 * (Figma 3421-59848) show the scrolled content underneath instead of an
 * opaque gap. The body is compensated with padding equal to the header/footer's
 * measured height (via ResizeObserver) so content starts below the fold on
 * first paint and simply scrolls underneath the overlay afterwards.
 */
export const KeyboardAwareLayout = ({ header, footer, children, className }: KeyboardAwareLayoutProps) => {
    const { headerRef, footerRef, headerHeight, footerHeight } = useChromeInsets();

    return (
        <div className={cn('relative flex h-full flex-col overflow-hidden bg-background', className)}>
            {header && (
                <div ref={headerRef} className="absolute inset-x-0 top-0 z-20 pt-safe-top">
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
                <div ref={footerRef} className="absolute inset-x-0 bottom-0 z-20 flex flex-col">
                    {footer}
                    {/* Reserves the home-indicator inset only. The keyboard is deliberately not
                        reserved for — the docked CTA stays put and the keyboard overlays it, so the
                        gap below it does not grow as the keyboard rises. */}
                    <div
                        className="shrink-0 touch-none bg-background"
                        style={{ height: 'var(--safe-bottom, 0px)' }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </div>
            )}
            {!footer && <div className="pb-safe-bottom" />}
        </div>
    );
};
