import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAtSign } from '../../resources/icons';

export interface ThreadSummaryProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    /**
     * Replier faces, newest thread participants first. Host-built nodes (an `ImageAvatar` or a
     * `DefaultAvatar`) rather than urls, so the host keeps its own avatar-precedence rules —
     * the same arrangement `AvatarGroup` uses.
     */
    avatars?: React.ReactNode[];
    /** Repliers beyond the shown faces; rendered as a `+N` pill closing the stack. */
    overflowCount?: number;
    /** "20 replies" — the localized reply count. Always shown. */
    replyLabel: string;
    /** "3 new replies" — localized; omit when nothing is unseen. Opens the blue new-reply box. */
    newReplyLabel?: string;
    /** "Mentions me" — localized; set when an unseen reply calls the reader. Orange, with an @. */
    mentionLabel?: string;
    /** The newest reply as one line, "Name: text" — shown in the new-reply box, cut to fit. */
    preview?: string;
    /** Last reply time, e.g. "12:06 PM". Omit to drop the segment. */
    time?: string;
    /** Mirrors the row for my own (right-aligned) messages: text first, faces last. */
    align?: 'start' | 'end';
}

const TEXT = 'whitespace-nowrap text-[10px] leading-[14px] tracking-[-0.2px]';

/**
 * The reply summary under a thread root (Figma 5978:37669, "replies"). The first line is who
 * replied, how many replies there are and, when nothing is new, when the last one landed. While
 * replies are unseen a second line opens: a blue box with how many are new, "Mentions me" when
 * one of them calls the reader, and the newest reply as "Name: text", with the time beside the
 * box. Tapping anywhere opens the thread.
 *
 * Its own timestamp is the LAST REPLY's, not the root's — the root already carries its own time
 * next to the bubble, while "the conversation under this moved at 12:06" is the one fact the
 * collapsed thread cannot otherwise show. With a second line the time moves down to it, next to
 * the reply it dates.
 *
 * Presentational only — what counts as unseen, whether it mentions the reader and how the
 * preview reads are the host's.
 */
export const ThreadSummary = React.forwardRef<HTMLButtonElement, ThreadSummaryProps>(
    (
        {
            avatars = [],
            overflowCount = 0,
            replyLabel,
            newReplyLabel,
            mentionLabel,
            preview,
            time,
            align = 'start',
            className,
            ...props
        },
        ref
    ) => {
        const end = align === 'end';
        const faces =
            avatars.length > 0 || overflowCount > 0 ? (
                <span className="flex shrink-0 items-center">
                    {avatars.map((avatar, index) => (
                        // Overlapped by 4px. Keyed by position because the host hands over opaque
                        // nodes — it owns their identity, and re-keying here would fight it.
                        <span key={index} className="-mr-1 flex size-5 shrink-0 items-center last:mr-0">
                            {avatar}
                        </span>
                    ))}
                    {overflowCount > 0 && (
                        <span className="flex shrink-0 items-center justify-center rounded-3xl border border-background bg-input-border px-1 py-[3px] text-[10px] leading-none text-foreground">
                            +{overflowCount}
                        </span>
                    )}
                </span>
            ) : null;
        const timeLabel = time ? (
            <span className={cn(TEXT, 'shrink-0 font-medium text-description')}>{time}</span>
        ) : null;

        return (
            <button
                ref={ref}
                type="button"
                className={cn(
                    'flex w-fit max-w-full flex-col gap-1 px-1 text-left active:opacity-70',
                    end ? 'items-end' : 'items-start',
                    className
                )}
                {...props}
            >
                {/* Faces come first in the DOM either way; `flex-row-reverse` is what moves them
                    to the trailing edge, so a screen reader still hears who before how many. */}
                <span className={cn('flex max-w-full items-center gap-1.5', end && 'flex-row-reverse')}>
                    {faces}
                    <span className={cn(TEXT, 'shrink-0 font-medium text-foreground')}>{replyLabel}</span>
                    {!newReplyLabel && timeLabel}
                </span>
                {newReplyLabel && (
                    <span className={cn('flex max-w-full items-center gap-1.5', end && 'flex-row-reverse')}>
                        <span
                            data-new-replies
                            className="flex min-w-0 items-center gap-1 rounded bg-point-blue/[0.08] p-1"
                        >
                            <span className={cn(TEXT, 'shrink-0 font-semibold text-point-blue')}>{newReplyLabel}</span>
                            {mentionLabel && (
                                <span className="flex shrink-0 items-center gap-px text-point-orange">
                                    <IconAtSign size={10} strokeWidth={2.5} aria-hidden />
                                    <span className={cn(TEXT, 'font-semibold tracking-[-0.3px]')}>{mentionLabel}</span>
                                </span>
                            )}
                            {preview && (
                                <span className={cn(TEXT, 'min-w-0 truncate text-description')}>{preview}</span>
                            )}
                        </span>
                        {timeLabel}
                    </span>
                )}
            </button>
        );
    }
);
ThreadSummary.displayName = 'ThreadSummary';
