import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const chatButtonVariants = cva(
    'inline-flex items-center justify-center font-chatic font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-chatic-text-accent text-white hover:bg-chatic-text-accent/90',
                outline:
                    'border border-chatic-neutral-300 bg-white text-chatic-text-primary hover:bg-chatic-neutral-50',
                ghost: 'text-chatic-text-primary hover:bg-chatic-neutral-50',
            },
            size: {
                default: 'px-4 py-2 text-chatic-base rounded-xl',
                sm: 'px-3 py-1.5 text-chatic-sm rounded-lg',
                lg: 'px-6 py-3 text-chatic-md rounded-xl',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

interface ChatButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof chatButtonVariants> {}

const ChatButton = React.forwardRef<HTMLButtonElement, ChatButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return <button className={cn(chatButtonVariants({ variant, size }), className)} ref={ref} {...props} />;
    }
);
ChatButton.displayName = 'ChatButton';

export { ChatButton, chatButtonVariants };
export type { ChatButtonProps };
