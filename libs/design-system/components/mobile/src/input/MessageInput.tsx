import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconSend } from '@chatic/design-system-assets/icons';

export interface MessageInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend?: (value: string) => void;
    sendReady?: boolean;
    placeholder?: string;
    disabled?: boolean;
    maxHeight?: number;
    label?: string;
    sendLabel?: string;
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    leadingSlot?: React.ReactNode;
    className?: string;
}

const PILL_MAX_HEIGHT = 48;

export const MessageInput = ({
    value,
    onChange,
    onSend,
    placeholder = 'Enter a message',
    disabled = false,
    maxHeight = 279,
    label,
    sendLabel = 'Send',
    onKeyDown,
    inputRef,
    leadingSlot,
    sendReady = false,
    className,
}: MessageInputProps) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const setTextareaRef = React.useCallback(
        (node: HTMLTextAreaElement | null) => {
            textareaRef.current = node;
            if (inputRef) inputRef.current = node;
        },
        [inputRef]
    );

    React.useLayoutEffect(() => {
        const el = textareaRef.current;
        const box = containerRef.current;
        if (!el || !box) return;
        el.style.height = 'auto';
        const next = Math.min(el.scrollHeight, maxHeight);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
        box.dataset.multiline = String(next > PILL_MAX_HEIGHT);
    }, [value, maxHeight]);

    const hasText = !disabled && value.trim().length > 0;
    const canSend = hasText || (!disabled && sendReady);

    const keepCaretOnTextarea = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        if (event.target !== textareaRef.current) event.preventDefault();
    };

    const handleSend = () => {
        if (!canSend) return;
        onSend?.(value.trim());
    };

    return (
        <div
            ref={containerRef}
            data-multiline="false"
            data-no-autoscroll
            onPointerDown={keepCaretOnTextarea}
            onMouseDown={keepCaretOnTextarea}
            className={cn(
                'touch-manipulation',
                'flex w-full items-center gap-1.5 rounded-[100px] border bg-white/[0.92] px-1.5 py-2 backdrop-blur-[4px] transition-[border-radius,border-color] dark:bg-black/[0.92]',
                'data-[multiline=true]:items-end data-[multiline=true]:rounded-2xl data-[multiline=true]:py-3',
                hasText ? 'border-focus-border' : 'border-input-border',
                className
            )}
        >
            {leadingSlot}
            <textarea
                ref={setTextareaRef}
                rows={1}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={label}
                onChange={event => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                className="mt-0.5 min-w-0 flex-1 resize-none self-center bg-transparent pl-1.5 text-[16px] leading-[1.45] tracking-[-0.08px] text-foreground outline-none placeholder:text-description disabled:cursor-not-allowed"
            />
            <button
                type="button"
                onClick={handleSend}
                disabled={disabled}
                aria-disabled={!canSend}
                aria-label={sendLabel}
                className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full p-[9px] transition-colors',
                    canSend ? 'bg-brand-ink' : 'bg-control-idle',
                    !canSend && 'cursor-not-allowed'
                )}
            >
                <IconSend className="size-[18px] text-white" strokeWidth={2.5} />
            </button>
        </div>
    );
};
