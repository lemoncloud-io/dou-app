import { cn } from '@chatic/ui-kit';

import { IconCheck } from '../../resources/icons';

export interface VerifiedBadgeProps {
    size?: number;
    label?: string;
    className?: string;
}

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
