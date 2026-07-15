import * as React from 'react';

import { cn } from '@chatic/lib/utils';

const SOLID = {
    default: 'bg-secondary text-secondary-foreground',
    accent: 'bg-primary text-primary-foreground',
    muted: 'bg-muted text-muted-foreground',
    dark: 'bg-foreground text-background',
} as const;

const OUTLINE = {
    default: 'border-input-border',
    accent: 'border-main-accent',
    muted: 'border-input-border',
    dark: 'border-input-border',
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** `solid` filled pill or `outline` bordered pill. */
    variant?: 'solid' | 'outline';
    /** Color tone (fill for solid, border for outline). */
    tone?: keyof typeof SOLID;
    /** Leading icon node. */
    icon?: React.ReactNode;
}

/**
 * Base pill badge — the foundation for tag/badge presets. `solid` fills, `outline`
 * borders; presets (PlanBadge, StatusBadge) lock the variant/tone and sizing.
 */
export const Badge = ({ variant = 'solid', tone = 'default', icon, className, children, ...props }: BadgeProps) => {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full font-semibold',
                variant === 'outline' ? cn('border text-foreground', OUTLINE[tone]) : SOLID[tone],
                className
            )}
            {...props}
        >
            {icon}
            {children}
        </span>
    );
};
