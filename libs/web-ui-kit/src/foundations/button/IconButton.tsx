import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    label: string;
    variant?: 'ghost' | 'outline';
    size?: number;
}

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
