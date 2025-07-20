import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const chatMessageVariants = cva('flex font-chatic text-chatic-md leading-6', {
    variants: {
        type: {
            system: 'justify-start',
            user: 'justify-end',
        },
        size: {
            default: 'text-chatic-md',
            sm: 'text-chatic-sm',
            lg: 'text-chatic-lg',
        },
    },
    defaultVariants: {
        type: 'system',
        size: 'default',
    },
});

const chatMessageBubbleVariants = cva('max-w-[280px] font-chatic leading-relaxed', {
    variants: {
        type: {
            system: 'text-chatic-text-primary',
            user: 'border border-chatic-primary text-chatic-text-primary rounded-2xl px-4 py-3 bg-transparent',
        },
        gradient: {
            true: 'bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent',
            false: '',
        },
    },
    defaultVariants: {
        type: 'system',
        gradient: false,
    },
});

interface ChatMessageProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof chatMessageVariants> {
    message: string;
    gradient?: boolean;
    bubbleClassName?: string;
}

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
    ({ className, type, size, message, gradient = false, bubbleClassName, ...props }, ref) => {
        return (
            <div ref={ref} className={cn(chatMessageVariants({ type, size }), className)} {...props}>
                {type === 'system' && gradient ? (
                    <div
                        className={cn(
                            'max-w-[280px] font-chatic leading-relaxed text-chatic-text-primary',
                            bubbleClassName
                        )}
                    >
                        <span
                            className="bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent font-medium"
                            style={{ WebkitTextFillColor: 'transparent' }}
                        >
                            {message}
                        </span>
                    </div>
                ) : (
                    <div
                        className={cn(chatMessageBubbleVariants({ type, gradient: false }), bubbleClassName)}
                        style={{
                            whiteSpace: 'pre-line', // 줄바꿈 지원
                        }}
                    >
                        {message}
                    </div>
                )}
            </div>
        );
    }
);
ChatMessage.displayName = 'ChatMessage';

export { ChatMessage, chatMessageVariants, chatMessageBubbleVariants };
export type { ChatMessageProps };
