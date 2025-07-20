import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';

const chatInputVariants = cva('flex items-center transition-all duration-200 ease-in-out', {
    variants: {
        variant: {
            default:
                'border-2 border-chatic-neutral-200 focus-within:border-chatic-primary rounded-chatic-lg px-5 py-3',
            outlined: 'border border-chatic-neutral-300 focus-within:border-chatic-primary rounded-chatic-sm px-4 py-2',
        },
        size: {
            default: 'px-5 py-3',
            sm: 'px-4 py-2',
            lg: 'px-6 py-4',
        },
    },
    defaultVariants: {
        variant: 'default',
        size: 'default',
    },
});

const chatInputButtonVariants = cva(
    'flex items-center justify-center transition-all duration-200 ease-in-out rounded-chatic-lg',
    {
        variants: {
            variant: {
                default:
                    'disabled:bg-chatic-neutral-100 disabled:opacity-40 enabled:bg-chatic-primary enabled:hover:bg-chatic-primary/90',
                ghost: 'disabled:text-chatic-neutral-400 enabled:text-chatic-primary enabled:hover:bg-chatic-primary/10',
            },
            size: {
                default: 'w-8 h-8 p-2',
                sm: 'w-6 h-6 p-1',
                lg: 'w-10 h-10 p-2',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

interface ChatInputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof chatInputVariants> {
    onSend?: (message: string) => void;
    sendButtonVariant?: VariantProps<typeof chatInputButtonVariants>['variant'];
    sendButtonSize?: VariantProps<typeof chatInputButtonVariants>['size'];
    containerClassName?: string;
}

const ChatInput = React.forwardRef<HTMLInputElement, ChatInputProps>(
    ({ className, variant, size, onSend, sendButtonVariant, sendButtonSize, containerClassName, ...props }, ref) => {
        const [value, setValue] = React.useState('');

        const handleSend = () => {
            if (value.trim() && onSend) {
                onSend(value);
                setValue('');
            }
        };

        const handleKeyPress = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };

        return (
            <div className={cn(chatInputVariants({ variant, size }), containerClassName)}>
                <input
                    ref={ref}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className={cn(
                        'flex-1 bg-transparent focus:outline-none font-chatic text-chatic-md leading-6 text-chatic-text-primary placeholder:text-chatic-text-secondary',
                        className
                    )}
                    {...props}
                />
                <div className="ml-3">
                    <button
                        onClick={handleSend}
                        disabled={!value.trim()}
                        className={cn(
                            chatInputButtonVariants({
                                variant: sendButtonVariant || 'default',
                                size: sendButtonSize || size || 'default',
                            })
                        )}
                        type="button"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M2 8L14 8M14 8L8 2M14 8L8 14"
                                stroke={value.trim() ? '#FFFFFF' : '#BABCC0'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }
);
ChatInput.displayName = 'ChatInput';

export { ChatInput, chatInputVariants, chatInputButtonVariants };
export type { ChatInputProps };
