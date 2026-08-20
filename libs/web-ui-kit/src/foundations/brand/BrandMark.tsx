import { cn } from '@chatic/lib/utils';

import { douLogo } from '../../resources/assets';
import { BrandWordmark } from './BrandWordmark';

export interface BrandMarkProps {
    /** Height of the character in pixels; the wordmark and the gap scale with it. */
    height?: number;
    className?: string;
}

// Proportions of the designer's combined mark (dou-mark.svg, 300×97): the character fills the whole
// height, the wordmark is 62/97 of it, and a 20/97 gap sits between them. Keeping the ratios here
// means this two-asset composition lines up with the single-asset mark it replaces at any size.
// Derived lengths round to whole pixels so the wordmark's stems stay crisp.
const WORDMARK_RATIO = 62 / 97;
const GAP_RATIO = 20 / 97;

/**
 * DoU brand mark — the cloud character followed by the "D.U" wordmark.
 *
 * Composed from the two assets rather than the baked `douMark` raster, because the wordmark has to
 * follow the theme (see `BrandWordmark`) while the character stays as it is on either surface.
 */
export const BrandMark = ({ height = 38, className }: BrandMarkProps) => (
    <span
        role="img"
        aria-label="DoU"
        className={cn('flex shrink-0 items-center', className)}
        style={{ height, gap: Math.round(height * GAP_RATIO) }}
    >
        <img src={douLogo} alt="" className="w-auto" style={{ height }} />
        <BrandWordmark height={Math.round(height * WORDMARK_RATIO)} decorative />
    </span>
);
