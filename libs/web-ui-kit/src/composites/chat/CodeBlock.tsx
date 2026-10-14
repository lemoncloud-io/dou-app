import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconCheck, IconCopy } from '../../resources/icons';

export interface InlineCodeProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A short run of code inside a sentence — monospace on a tinted chip.
 *
 * `text-[0.9em]`, not a fixed size: the chip has to sit on the bubble's line without pushing the
 * line box open, and the two bubble variants set different colours around it. On my (navy) bubble the
 * chip is a light tint, read from MessageBubble's `data-variant` — a dark one vanished there.
 */
export const InlineCode = ({ children, className }: InlineCodeProps) => (
    <code
        className={cn(
            'rounded bg-black/[0.07] px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/15',
            'group-data-[variant=mine]/bubble:bg-white/15',
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
 * The block's ground and rules, per surface. Outside a bubble (the expand dialog, a thread root on
 * the page) and on the other person's bubble it is a faint dark tint; on my bubble, navy in both
 * themes, it is a light one — MessageBubble's `data-variant` says which, so the block needs no prop.
 * The border is what keeps the box's edge visible where the tint alone is close to the ground.
 */
const BLOCK_TONE =
    'border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/5 ' +
    'group-data-[variant=mine]/bubble:border-white/15 group-data-[variant=mine]/bubble:bg-white/10';
const HEADER_RULE = 'border-black/[0.06] dark:border-white/10 group-data-[variant=mine]/bubble:border-white/10';

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
    <span className={cn('my-1.5 block overflow-hidden rounded-lg border', BLOCK_TONE, className)}>
        {(lang || onCopy) && (
            // A header row ruled off from the code, so the tag and the button read as the block's
            // chrome rather than as a stray first line of it.
            <span
                className={cn(
                    'flex min-h-7 items-center justify-between gap-2 border-b pl-3 pr-1 text-[12px] leading-none',
                    HEADER_RULE
                )}
            >
                <span className="font-mono opacity-60">{lang ?? ''}</span>
                {onCopy && (
                    <button
                        type="button"
                        onClick={onCopy}
                        aria-label={copied ? copiedLabel : copyLabel}
                        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 opacity-70 hover:opacity-100"
                        {...buttonProps}
                    >
                        {copied ? (
                            <IconCheck aria-hidden className="size-3.5" />
                        ) : (
                            <IconCopy aria-hidden className="size-3.5" />
                        )}
                        <span>{copied ? copiedLabel : copyLabel}</span>
                    </button>
                )}
            </span>
        )}
        {/* `whitespace-pre` (not pre-wrap) so a long line scrolls instead of wrapping — wrapping
            code is what makes it unreadable without colour to fall back on. */}
        <span className="block overflow-x-auto px-3 py-2">
            <code className="block whitespace-pre font-mono text-[13px] leading-[1.5]">{code}</code>
        </span>
    </span>
);
