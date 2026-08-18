import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface InlineCodeProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A short run of code inside a sentence — monospace on a tinted chip.
 *
 * `text-[0.9em]`, not a fixed size: the chip has to sit on the bubble's line without pushing the
 * line box open, and the two bubble variants set different colours around it.
 */
export const InlineCode = ({ children, className }: InlineCodeProps) => (
    <code
        className={cn(
            'rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/15',
            '[overflow-wrap:anywhere]',
            className
        )}
    >
        {children}
    </code>
);

export interface CodeBlockProps {
    code: string;
    /** Language tag from the fence. Shown as a label only — this component does not colourise. */
    lang?: string;
    /**
     * Copy handler. Omit it and no button renders — the expand dialog wants the block without one.
     * Clipboard access and any toast belong to the host, not here.
     */
    onCopy?: () => void;
    copyLabel?: string;
    copiedLabel?: string;
    /** Post-copy feedback state, owned by the host so it can clear on its own schedule. */
    copied?: boolean;
    /**
     * Pointer handlers forwarded to the copy button. The host uses these to stop the press from
     * reaching a long-press gesture wrapped around the whole bubble — see MessageCodeBlock.
     */
    buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    className?: string;
}

/**
 * A fenced code block inside a chat bubble — monospace, tinted, horizontally scrollable.
 *
 * There is no syntax highlighting by design: adding shiki/highlight.js to the mobile web bundle
 * costs more than the feature returns (ADR-0055). Monospace, the tint, and the ability to scroll a
 * long line carry the readability instead — so `overflow-x-auto` is load-bearing, not a fallback.
 *
 * A `<span className="block">` rather than `<pre>`: MessageBubble wraps its children in a `<span>`,
 * and a block element inside an inline one is invalid HTML. Line breaks survive anyway — the
 * bubble's `whitespace-pre-wrap` already preserves them.
 *
 * Purely presentational: no clipboard, no platform branching, no gesture knowledge.
 */
export const CodeBlock = ({
    code,
    lang,
    onCopy,
    copyLabel = 'Copy',
    copiedLabel = 'Copied',
    copied = false,
    buttonProps,
    className,
}: CodeBlockProps) => (
    <span className={cn('my-1 block overflow-hidden rounded-lg bg-black/10 dark:bg-white/10', className)}>
        {(lang || onCopy) && (
            <span className="flex items-center justify-between gap-2 px-3 pt-1.5 text-[11px] leading-none opacity-60">
                <span className="font-mono">{lang ?? ''}</span>
                {onCopy && (
                    <button
                        type="button"
                        onClick={onCopy}
                        aria-label={copied ? copiedLabel : copyLabel}
                        className="-my-1 shrink-0 rounded px-1.5 py-1 font-medium underline-offset-2 hover:underline"
                        {...buttonProps}
                    >
                        {copied ? copiedLabel : copyLabel}
                    </button>
                )}
            </span>
        )}
        {/* `whitespace-pre` (not pre-wrap) so a long line scrolls instead of wrapping — wrapping
            code is what makes it unreadable without colour to fall back on. */}
        <span className="block overflow-x-auto px-3 py-2">
            <code className="block whitespace-pre font-mono text-[13px] leading-[1.45]">{code}</code>
        </span>
    </span>
);
