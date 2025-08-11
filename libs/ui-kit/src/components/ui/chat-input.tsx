import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@lemon/lib/utils';
import { ArrowUp, Plus } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@lemon/ui-kit';

const chatInputVariants = cva('transition-all duration-200 ease-in-out', {
    variants: {
        variant: {
            default: 'rounded-[16px] border-t border-[#3968C3] rounded-[16px] px-4 pt-1 pb-[18px]',
            outlined: 'border border-chatic-400 focus-within:border-chatic-primary rounded-[8px] px-4 py-2',
        },
        size: {
            default: 'px-5 text-base',
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
    'flex items-center justify-center transition-all duration-200 ease-in-out rounded-[16px] sticky top-0',
    {
        variants: {
            variant: {
                default: 'disabled:bg-chatic-100 enabled:bg-chatic-primary enabled:hover:bg-chatic-primary/90',
                ghost: 'disabled:text-chatic-text-400 enabled:text-chatic-text-800 enabled:hover:bg-chatic-primary/10',
            },
            size: {
                default: 'w-5 h-5',
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

interface ChatInputProps
    extends React.InputHTMLAttributes<HTMLTextAreaElement>,
        VariantProps<typeof chatInputVariants> {
    onSend?: (message: string) => void;
    sendButtonVariant?: VariantProps<typeof chatInputButtonVariants>['variant'];
    sendButtonSize?: VariantProps<typeof chatInputButtonVariants>['size'];
    containerClassName?: string;
    validationSlot?: React.ReactNode;
}

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
    (
        {
            className,
            variant,
            size,
            onSend,
            sendButtonVariant,
            sendButtonSize,
            containerClassName,
            disabled,
            validationSlot,
            ...props
        },
        ref
    ) => {
        const [value, setValue] = React.useState('');
        const textareaRef = React.useRef<HTMLTextAreaElement>(null);

        // 자동 높이 조절
        React.useEffect(() => {
            const el = textareaRef.current;
            if (el) {
                el.style.height = '21px';
                el.style.height = `${Math.min(el.scrollHeight, 105)}px`;
            }
        }, [value]);

        const handleSend = () => {
            if (value.trim() && onSend && !disabled) {
                onSend(value);
                setValue('');
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !disabled) {
                e.preventDefault();
                handleSend();
            }
        };

        return (
            <div
                className={cn(
                    chatInputVariants({ variant, size }),
                    disabled && 'opacity-50 cursor-not-allowed',
                    containerClassName
                )}
            >
                {validationSlot && (
                    <div className="pt-1 pb-[6px] border-b border-chatic-50 flex items-center gap-[6px]">
                        {validationSlot}
                    </div>
                )}

                <div className="flex gap-3 max-h-[63px] overflow-auto mt-[10px]">
                    <DropdownMenu>
                        <DropdownMenuTrigger className="rounded-full w-5 h-5 bg-chatic-100 flex items-center justify-center transition-transform duration-200 data-[state=open]:rotate-45">
                            <Plus className="w-4 h-4 text-chatic-400" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-[6px]">
                            <DropdownMenuItem className="p-1 text-xs text-chatic-primary">카메라</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="p-1 text-xs text-chatic-primary">사진</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={e => !disabled && setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        className={cn(
                            'flex-1 bg-transparent focus:outline-none text-sm text-chatic-base leading-6 text-chatic-primary placeholder:text-chatic-600 resize-none',
                            disabled && 'cursor-not-allowed',
                            className
                        )}
                        {...props}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!value.trim() || disabled}
                        className={cn(
                            chatInputButtonVariants({
                                variant: sendButtonVariant || 'default',
                                size: sendButtonSize || size || 'default',
                            })
                        )}
                        type="button"
                    >
                        <ArrowUp size={16} stroke={value.trim() ? '#FFFFFF' : '#BABCC0'} />
                    </button>
                </div>
            </div>
        );
    }
);
ChatInput.displayName = 'ChatInput';

export { ChatInput, chatInputVariants, chatInputButtonVariants };
export type { ChatInputProps };
