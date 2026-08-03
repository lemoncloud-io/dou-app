import { type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { useChromeInsets } from '../hooks/useChromeInsets';
import { keyboardSafeBottom } from './KeyboardSafeAreaSpacer';

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
 *
 * The scaffold is tagged `data-chrome-root` and its two overlays `data-chrome-overlay`, so
 * `useAutoScrollOnFocus` can subtract them from the visible band — a focused field sitting behind
 * the docked CTA is inside the viewport but not actually readable.
 */
export const KeyboardAwareLayout = ({ header, footer, children, className }: KeyboardAwareLayoutProps) => {
    const { headerRef, footerRef, headerHeight, footerHeight } = useChromeInsets();

    return (
        <div data-chrome-root className={cn('relative flex h-full flex-col overflow-hidden bg-background', className)}>
            {header && (
                <div ref={headerRef} data-chrome-overlay="top" className="absolute inset-x-0 top-0 z-20 pt-safe-top">
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
                    {/* Lifts the docked CTA above the on-screen keyboard so it stays reachable while
                        typing. No base padding is subtracted here: the footer is a caller-provided
                        slot, so its own bottom padding (if any) is not assumed. */}
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
