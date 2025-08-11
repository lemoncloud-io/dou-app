import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const chatButtonVariants = cva(
    'inline-flex items-center justify-center w-[140px] h-[41px] rounded-full font-semibold text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:bg-chatic-300',
    {
        variants: {
            variant: {
                default: 'bg-chatic-primary text-white',
                outline: 'border border-chatic-primary bg-white',
                ghost: 'text-chatic-text-800 hover:bg-chatic-neutral-50',
            },
            size: {
                default: '',
                sm: 'px-3 py-1.5 text-[13px] rounded-lg',
                lg: 'px-6 py-3 text-base rounded-xl',
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
