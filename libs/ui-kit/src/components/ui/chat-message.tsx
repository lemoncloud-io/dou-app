import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const chatMessageVariants = cva('flex font-chatic text-sm leading-6', {
    variants: {
        type: {
            system: 'justify-start',
            user: 'justify-end',
        },
        size: {
            default: 'text-sm',
            sm: 'text-[13px]',
            lg: 'text-base',
        },
    },
    defaultVariants: {
        type: 'system',
        size: 'default',
    },
});

const chatMessageBubbleVariants = cva('text-sm leading-relaxed', {
    variants: {
        type: {
            system: 'text-chatic-text-800',
            user: 'border-[0.5px] border-chatic-100 bg-chatic-50 text-chatic-text-800 rounded-xl px-3 py-[6px]',
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
                    <div className={cn('leading-relaxed text-chatic-text-800', bubbleClassName)}>
                        <span
                            className="bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent font-semibold"
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
                            wordBreak: 'break-all',
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
