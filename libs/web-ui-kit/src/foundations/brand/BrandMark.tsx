import { cn } from '@chatic/ui-kit';

import { douLogo } from '../../resources/assets';
import { BrandWordmark } from './BrandWordmark';

export interface BrandMarkProps {
    height?: number;
    className?: string;
}

const WORDMARK_RATIO = 62 / 97;
const GAP_RATIO = 20 / 97;

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
