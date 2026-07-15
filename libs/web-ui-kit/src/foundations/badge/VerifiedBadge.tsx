import { cn } from '@chatic/lib/utils';

import { IconCheck } from '../../resources/icons';

export interface VerifiedBadgeProps {
    /** Diameter in pixels. Defaults to the Figma spec (18). */
    size?: number;
    /** Accessible label. */
    label?: string;
    className?: string;
}

/**
 * Blue verified/default check badge — the Figma "Check Circle" shown next to the
 * default place name. A filled blue circle with a white check.
 */
export const VerifiedBadge = ({ size = 18, label = 'Verified', className }: VerifiedBadgeProps) => {
    return (
        <span
            role="img"
            aria-label={label}
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-verified text-white',
                className
            )}
            style={{ width: size, height: size }}
        >
            <IconCheck className="size-[60%]" strokeWidth={3.5} />
        </span>
    );
};
