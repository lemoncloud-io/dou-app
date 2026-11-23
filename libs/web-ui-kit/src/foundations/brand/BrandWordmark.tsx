import { cn } from '@chatic/ui-kit';

import { douWordmarkLime, douWordmarkNavy } from '../../resources/assets';

export interface BrandWordmarkProps {
    height?: number;
    decorative?: boolean;
    className?: string;
}

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
