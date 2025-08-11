import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const typingMessageVariants = cva('flex text-[15px] leading-6', {
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

interface TypingMessageProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof typingMessageVariants> {
    text: string;
    typingSpeed?: number;
    gradient?: boolean;
    onComplete?: () => void;
}

const TypingMessage = React.forwardRef<HTMLDivElement, TypingMessageProps>(
    ({ className, type, size, text, typingSpeed = 50, gradient = false, onComplete, ...props }, ref) => {
        const [displayedText, setDisplayedText] = React.useState('');
        const [isTypingComplete, setIsTypingComplete] = React.useState(false);

        React.useEffect(() => {
            if (!text || typeof text !== 'string' || text.length === 0) {
                setDisplayedText('');
                setIsTypingComplete(true);
                return;
            }

            let index = 0;
            let isCancelled = false;
            setDisplayedText('');
            setIsTypingComplete(false);

            const typeChar = () => {
                if (isCancelled) return;

                if (index < text.length) {
                    const char = text.charAt(index);
                    setDisplayedText(prev => prev + char);
                    index++;
                    setTimeout(typeChar, typingSpeed);
                } else {
                    setIsTypingComplete(true);
                    onComplete?.();
                }
            };

            const timer = setTimeout(typeChar, 300); // 초기 딜레이

            return () => {
                isCancelled = true;
                clearTimeout(timer);
            };
        }, [text, typingSpeed, onComplete]);

        return (
            <div ref={ref} className={cn(typingMessageVariants({ type, size }), className)} {...props}>
                {type === 'system' && gradient ? (
                    <div className="leading-relaxed text-chatic-text-800">
                        <span
                            className="bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent font-semibold"
                            style={{ WebkitTextFillColor: 'transparent' }}
                        >
                            {displayedText}
                            {!isTypingComplete && <span className="animate-pulse ml-1">|</span>}
                        </span>
                    </div>
                ) : type === 'user' ? (
                    <div className="border-2 border-chatic-primary text-chatic-text-800 rounded-2xl px-4 py-3 bg-transparent leading-relaxed">
                        {displayedText}
                        {!isTypingComplete && <span className="animate-pulse ml-1">|</span>}
                    </div>
                ) : (
                    <div className="text-chatic-text-800 leading-relaxed">
                        {displayedText}
                        {!isTypingComplete && <span className="animate-pulse ml-1">|</span>}
                    </div>
                )}
            </div>
        );
    }
);
TypingMessage.displayName = 'TypingMessage';

export { TypingMessage, typingMessageVariants };
export type { TypingMessageProps };
