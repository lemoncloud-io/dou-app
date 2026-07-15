import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconSend } from '../../resources/icons';

export interface MessageInputProps {
    /** Controlled value. */
    value: string;
    /** Controlled change handler — receives the raw string. */
    onChange: (value: string) => void;
    /** Fired when the send button is pressed with a non-empty, trimmed value. */
    onSend?: (value: string) => void;
    placeholder?: string;
    /** Disables typing and sending. */
    disabled?: boolean;
    /**
     * Height (px) at which the field stops growing and starts scrolling.
     * Matches the Figma "Max Height" case; override for shorter viewports.
     */
    maxHeight?: number;
    /** Accessible label for the textarea. Host supplies a localized string. */
    label?: string;
    className?: string;
}

// Height (px) below which the field stays a single-line pill; above it the field
// reads as multi-line and switches to the rounded-rectangle treatment.
const PILL_MAX_HEIGHT = 48;

/**
 * Chat message composer — the Figma "Text Area" component. Auto-grows with its
 * content from a single-line pill up to `maxHeight`, then scrolls internally and
 * switches to a rounded rectangle. The send button is idle while empty/disabled
 * and becomes active (brand ink) once there is trimmed text to send.
 *
 * Stateless: `value` is fully controlled by the host and the component holds no
 * React state. Auto-sizing is a layout effect that sizes the textarea and flags
 * the multi-line treatment via a `data-multiline` attribute (no re-render state).
 */
export const MessageInput = ({
    value,
    onChange,
    onSend,
    placeholder = '메시지를 입력해 주세요',
    disabled = false,
    maxHeight = 279,
    label,
    className,
}: MessageInputProps) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Size the textarea to its content up to maxHeight (scroll past it) and flag
    // the pill<->rect switch on the container. Runs on every value change.
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

    const canSend = !disabled && value.trim().length > 0;

    const handleSend = () => {
        if (!canSend) return;
        // Emit the trimmed value to match the onSend contract (non-empty, trimmed).
        onSend?.(value.trim());
    };

    return (
        <div
            ref={containerRef}
            data-multiline="false"
            className={cn(
                'flex w-full items-center gap-1.5 rounded-[100px] border bg-surface/90 px-1.5 py-2 backdrop-blur-[4px] transition-[border-radius,border-color]',
                'data-[multiline=true]:items-end data-[multiline=true]:rounded-2xl data-[multiline=true]:py-3',
                canSend ? 'border-focus-border' : 'border-input-border',
                className
            )}
        >
            <textarea
                ref={textareaRef}
                rows={1}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={label}
                onChange={event => onChange(event.target.value)}
                className="mt-0.5 min-w-0 flex-1 resize-none self-center bg-transparent pl-1.5 text-[16px] leading-[1.45] tracking-[-0.08px] text-foreground outline-none placeholder:text-description disabled:cursor-not-allowed"
            />
            <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send"
                className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full p-[9px] transition-colors',
                    canSend ? 'bg-brand-ink' : 'bg-control-idle'
                )}
            >
                <IconSend className="size-[18px] text-white" strokeWidth={2.5} />
            </button>
        </div>
    );
};
