import { type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { useChromeInsets } from '../hooks/useChromeInsets';
import { keyboardSafeBottom } from './KeyboardSafeAreaSpacer';

interface KeyboardAwareLayoutProps {
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    /**
     * Whether the scaffold pads the header wrapper by the notch inset. Defaults to
     * `true`, which suits a plain header that draws no background of its own.
     *
     * Set `false` when the header paints something — a glass bar — and takes the
     * inset itself. Applied out here the inset sits *above* that fill, leaving an
     * unpainted strip across the notch with content scrolling through it.
     */
    headerSafeArea?: boolean;
    className?: string;
}

/**
 * Class list for a route page that lifts itself out of the document flow — the pages whose keyboard
 * handling needs a viewport-anchored box rather than a scrolling one.
 *
 * `fixed` escapes the app shell, cap and all, so the page has to re-declare the shell's own width
 * here: `mx-auto max-w-app` puts it back over the same centred column every other screen occupies.
 * Without it these pages were the only ones that stretched to a desktop viewport while their
 * siblings stayed phone-width.
 */
export const fixedViewportScreen = 'fixed inset-0 mx-auto max-w-app overflow-hidden';

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
export const KeyboardAwareLayout = ({
    header,
    footer,
    children,
    headerSafeArea = true,
    className,
}: KeyboardAwareLayoutProps) => {
    const { headerRef, footerRef, headerHeight, footerHeight } = useChromeInsets();

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
