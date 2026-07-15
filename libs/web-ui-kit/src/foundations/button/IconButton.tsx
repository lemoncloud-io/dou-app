import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Icon node (from the icon set). */
    icon: React.ReactNode;
    /** Accessible label — required for icon-only buttons. */
    label: string;
    /** `ghost` (no border) or `outline` (bordered circle). */
    variant?: 'ghost' | 'outline';
    /** Diameter in pixels. */
    size?: number;
}

/**
 * Icon-only circular button — consolidates the inline header actions (search,
 * back, more, close). `outline` draws the bordered circle used in the home
 * header; `ghost` is borderless for in-bar actions.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ icon, label, variant = 'ghost', size = 44, type = 'button', className, ...props }, ref) => {
        return (
            <button
                ref={ref}
                type={type}
                aria-label={label}
                className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-full text-foreground transition-colors disabled:opacity-50',
                    variant === 'outline' && 'border border-input-border',
                    className
                )}
                style={{ width: size, height: size }}
                {...props}
            >
                {icon}
            </button>
        );
    }
);
IconButton.displayName = 'IconButton';
