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
    /**
     * Optional key handler on the textarea — e.g. the host wiring Enter-to-send on
     * desktop while leaving Enter as a newline on mobile.
     */
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    /**
     * Optional ref to the underlying textarea (e.g. so the host can re-anchor a
     * scroll view on focus). Merged with the component's own auto-sizing ref.
     */
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
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
    onKeyDown,
    inputRef,
    className,
}: MessageInputProps) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Merge the auto-sizing ref with the optional host ref onto the one textarea.
    const setTextareaRef = React.useCallback(
        (node: HTMLTextAreaElement | null) => {
            textareaRef.current = node;
            if (inputRef) inputRef.current = node;
        },
        [inputRef]
    );

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

    // Keep the mobile keyboard open when the composer chrome — the pill padding, the
    // gap next to the textarea, or the send button — is tapped instead of the textarea.
    // Only the textarea itself should take/hold the caret; any other target inside the
    // pill preventDefaults so focus never leaves the textarea (a finger slipping a few
    // px off the send button no longer blurs it and drops the keyboard).
    const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.target !== textareaRef.current) {
            event.preventDefault();
        }
    };

    const handleSend = () => {
        if (!canSend) return;
        // Emit the trimmed value to match the onSend contract (non-empty, trimmed).
        onSend?.(value.trim());
    };

    return (
        <div
            ref={containerRef}
            data-multiline="false"
            onPointerDown={handleContainerPointerDown}
            className={cn(
                'flex w-full items-center gap-1.5 rounded-[100px] border bg-surface/90 px-1.5 py-2 backdrop-blur-[4px] transition-[border-radius,border-color]',
                'data-[multiline=true]:items-end data-[multiline=true]:rounded-2xl data-[multiline=true]:py-3',
                canSend ? 'border-focus-border' : 'border-input-border',
                className
            )}
        >
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
