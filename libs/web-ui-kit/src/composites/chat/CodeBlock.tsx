import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconCheck, IconCopy } from '../../resources/icons';

export interface InlineCodeProps {
    children: React.ReactNode;
    className?: string;
}

export const InlineCode = ({ children, className }: InlineCodeProps) => (
    <code
        className={cn(
            'rounded border border-black/10 bg-black/[0.07] px-1 py-0.5 font-mono text-[0.9em] text-code-inline',
            'dark:border-white/20 dark:bg-white/15',
            'group-data-[variant=mine]/bubble:border-white/25 group-data-[variant=mine]/bubble:bg-white/15',
            'group-data-[variant=mine]/bubble:text-inherit',
            '[overflow-wrap:anywhere]',
            className
        )}
    >
        {children}
    </code>
);

export interface CodeBlockProps {
    code: string;
    lang?: string;
    onCopy?: () => void;
    copyLabel?: string;
    copiedLabel?: string;
    copied?: boolean;
    buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    className?: string;
}

const BLOCK_TONE =
    'border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/5 ' +
    'group-data-[variant=mine]/bubble:border-white/15 group-data-[variant=mine]/bubble:bg-white/10';
const HEADER_RULE = 'border-black/[0.06] dark:border-white/10 group-data-[variant=mine]/bubble:border-white/10';

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
        <span className="block overflow-x-auto px-3 py-2">
            <code className="block whitespace-pre font-mono text-[13px] leading-[1.5]">{code}</code>
        </span>
    </span>
);
