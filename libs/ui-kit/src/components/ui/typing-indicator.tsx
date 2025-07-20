import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const typingIndicatorVariants = cva('flex items-center space-x-1', {
    variants: {
        size: {
            default: 'py-3 px-4',
            sm: 'py-2 px-3',
            lg: 'py-4 px-5',
        },
    },
    defaultVariants: {
        size: 'default',
    },
});

const dotVariants = cva('rounded-full bg-chatic-neutral-400 animate-typing-pulse', {
    variants: {
        size: {
            default: 'w-2 h-2',
            sm: 'w-1.5 h-1.5',
            lg: 'w-2.5 h-2.5',
        },
    },
    defaultVariants: {
        size: 'default',
    },
});

interface TypingIndicatorProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof typingIndicatorVariants> {}

const TypingIndicator = React.forwardRef<HTMLDivElement, TypingIndicatorProps>(({ className, size, ...props }, ref) => {
    return (
        <div ref={ref} className={cn(typingIndicatorVariants({ size }), className)} {...props}>
            <div className="flex items-center space-x-1">
                <div
                    className={cn(dotVariants({ size }))}
                    style={{
                        animationDelay: '0ms',
                        animationDuration: '1.4s',
                    }}
                />
                <div
                    className={cn(dotVariants({ size }))}
                    style={{
                        animationDelay: '160ms',
                        animationDuration: '1.4s',
                    }}
                />
                <div
                    className={cn(dotVariants({ size }))}
                    style={{
                        animationDelay: '320ms',
                        animationDuration: '1.4s',
                    }}
                />
            </div>
        </div>
    );
});
TypingIndicator.displayName = 'TypingIndicator';

export { TypingIndicator, typingIndicatorVariants };
export type { TypingIndicatorProps };
