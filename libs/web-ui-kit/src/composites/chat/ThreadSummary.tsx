import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface ThreadSummaryProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    /**
     * Replier faces, newest thread participants first. Host-built nodes (an `ImageAvatar` or a
     * `DefaultAvatar`) rather than urls, so the host keeps its own avatar-precedence rules —
     * the same arrangement `AvatarGroup` uses.
     */
    avatars?: React.ReactNode[];
    /** Repliers beyond the shown faces; rendered as a `+N` pill closing the stack. */
    overflowCount?: number;
    /** "댓글 20개" — the localized reply count. Always shown. */
    replyLabel: string;
    /** "새 댓글 3개" — localized; omit when nothing is unseen. Carries the point-blue accent. */
    newReplyLabel?: string;
    /** Last reply time, e.g. "오후 12:06". Omit to drop the segment. */
    time?: string;
    /** Mirrors the row for my own (right-aligned) messages: text first, faces last. */
    align?: 'start' | 'end';
}

/** `•` between segments — BK_300, so it separates without competing with the labels. */
const Dot = () => (
    <span aria-hidden className="text-[11px] leading-[26px] tracking-[0.055px] text-control-idle">
        •
    </span>
);

/**
 * The reply summary under a thread root: replier faces, then how many replies, how many are
 * new, and when the last one landed (Figma "댓글 케이스", 4703:43718). Tapping it opens the
 * thread.
 *
 * Its own timestamp is the LAST REPLY's, not the root's — that is the whole point of the
 * segment. The root already carries its own time next to the bubble, so repeating it here
 * would say nothing, while "the conversation under this moved at 12:06" is the one fact the
 * collapsed thread cannot otherwise show.
 *
 * The unseen state is a colored label ("새 댓글 3개") rather than a dot: a dot says only that
 * something is new, and by the time a row is worth interrupting for, how much is new is the
 * thing worth reading. Presentational only — what counts as unseen is the host's cursor
 * arithmetic, not this component's.
 */
export const ThreadSummary = React.forwardRef<HTMLButtonElement, ThreadSummaryProps>(
    (
        { avatars = [], overflowCount = 0, replyLabel, newReplyLabel, time, align = 'start', className, ...props },
        ref
    ) => {
        const faces = (
            <span className="flex shrink-0 items-center">
                {avatars.map((avatar, index) => (
                    // Overlapped by 4px. Keyed by position because the host hands over opaque
                    // nodes — it owns their identity, and re-keying here would fight it.
                    <span key={index} className="-mr-1 flex size-5 shrink-0 items-center last:mr-0">
                        {avatar}
                    </span>
                ))}
                {overflowCount > 0 && (
                    <span className="flex shrink-0 items-center justify-center rounded-3xl border border-background bg-input-border px-1 py-[3px] text-[11px] leading-none tracking-[0.055px] text-foreground">
                        +{overflowCount}
                    </span>
                )}
            </span>
        );

        const labels = (
            // Reversed on my own side too, not just the faces: the design reads
            // "오후 12:06 · 새 댓글 1개 · 댓글 3개" there, i.e. the whole row mirrors, with the
            // reply count landing nearest the bubble's trailing edge. The separator dots are
            // siblings of the labels, so reversing the row carries them along correctly.
            <span className={cn('flex min-w-0 items-center gap-px', align === 'end' && 'flex-row-reverse')}>
                <span className="whitespace-nowrap text-[11px] font-medium leading-[26px] tracking-[-0.22px] text-foreground">
                    {replyLabel}
                </span>
                {newReplyLabel && (
                    <>
                        <Dot />
                        <span className="whitespace-nowrap text-[11px] font-semibold leading-[26px] tracking-[-0.22px] text-point-blue">
                            {newReplyLabel}
                        </span>
                    </>
                )}
                {time && (
                    <>
                        <Dot />
                        <span className="whitespace-nowrap text-[11px] font-medium leading-[26px] tracking-[-0.22px] text-description">
                            {time}
                        </span>
                    </>
                )}
            </span>
        );

        return (
            <button
                ref={ref}
                type="button"
                className={cn(
                    'flex h-[26px] w-fit max-w-full items-center gap-1 active:opacity-70',
                    align === 'end' && 'flex-row-reverse',
                    className
                )}
                {...props}
            >
                {/* Faces come first in the DOM either way; `flex-row-reverse` is what moves them
                    to the trailing edge, so a screen reader still hears who before how many. */}
                {avatars.length > 0 || overflowCount > 0 ? faces : null}
                {labels}
            </button>
        );
    }
);
ThreadSummary.displayName = 'ThreadSummary';
