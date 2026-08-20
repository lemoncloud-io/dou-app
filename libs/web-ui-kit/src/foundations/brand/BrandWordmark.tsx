import { cn } from '@chatic/lib/utils';

import { douWordmarkLime, douWordmarkNavy } from '../../resources/assets';

export interface BrandWordmarkProps {
    /** Wordmark height in pixels; the width follows the artwork's aspect ratio. */
    height?: number;
    /**
     * Set when an enclosing element already names the brand (e.g. `BrandMark`), so assistive tech
     * doesn't announce "DoU" twice.
     */
    decorative?: boolean;
    className?: string;
}

/**
 * The "D.U" wordmark on its own, in the brand colour that suits the theme: navy on light surfaces,
 * lime on dark ones (navy on a dark background reads as a smudge).
 *
 * Both colours stay in the DOM and CSS hides one, so the swap needs no theme hook and no re-render.
 * The accessible name sits on the wrapper for that reason — an `alt` on the visible image would
 * vanish with it whenever the theme flipped.
 */
export const BrandWordmark = ({ height = 25, decorative = false, className }: BrandWordmarkProps) => (
    <span
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'DoU' })}
        className={cn('inline-flex shrink-0', className)}
        style={{ height }}
    >
        <img src={douWordmarkNavy} alt="" className="h-full w-auto dark:hidden" />
        <img src={douWordmarkLime} alt="" className="hidden h-full w-auto dark:block" />
    </span>
);
