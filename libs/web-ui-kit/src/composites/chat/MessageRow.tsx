import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { UnreadBadge } from '../../foundations/badge/UnreadBadge';

export interface MessageRowProps {
    /** `mine` aligns right (no avatar); `other` aligns left with an avatar. */
    variant?: 'mine' | 'other';
    /** Avatar node for `other` rows (e.g. a ProfileAvatar / <img>). */
    avatar?: React.ReactNode;
    /** One or more MessageBubble nodes from the same sender. */
    children: React.ReactNode;
    /** Formatted timestamp (e.g. "오전 11:58"). */
    time?: string;
    /** Unread count shown next to the time. */
    unread?: number;
    /**
     * Status node shown alongside the time (e.g. a `ReadReceipt`, or a sending /
     * failed indicator). On `mine` rows the meta line is mirrored so the time
     * sits on the outer edge and the status toward the bubble.
     */
    status?: React.ReactNode;
    /**
     * Let the content column use the full row width instead of the 75% bubble cap.
     *
     * For content that lays itself out and has no bubble — a Block Kit message draws a
     * header, fields and rules of its own, and 75% of a phone viewport is not enough
     * room for any of it. Off by default: an ordinary bubble still needs the cap so a
     * long line wraps well short of the opposite edge.
     */
    wide?: boolean;
    className?: string;
}

/**
 * A message row layout — composes an optional avatar, a stack of MessageBubbles,
 * and a time/status meta line. Stateless; assembled from MessageBubble +
 * UnreadBadge so screens compose rows without re-implementing alignment.
 */
export const MessageRow = ({
    variant = 'other',
    avatar,
    children,
    time,
    unread,
    status,
    wide = false,
    className,
}: MessageRowProps) => {
    const mine = variant === 'mine';

    const meta = (time || unread != null || status) && (
        <div
            className={cn(
                'flex items-center gap-2 text-[12px] leading-4 tracking-[-0.18px] text-description',
                // Mirror the meta on my rows so the time sits on the outer edge.
                mine && 'flex-row-reverse'
            )}
        >
            {time && <span>{time}</span>}
            {status}
            {unread != null && <UnreadBadge count={unread} />}
        </div>
    );

    return (
        <div className={cn('flex w-full gap-[5px] px-4', mine ? 'justify-end' : 'items-start', className)}>
            {!mine && <span className="shrink-0">{avatar}</span>}
            {/* Cap the bubble column so long messages wrap instead of overflowing the row. */}
            <div
                className={cn(
                    'flex min-w-0 flex-col gap-1.5',
                    wide ? 'flex-1' : 'max-w-[75%]',
                    mine ? 'items-end' : 'items-start'
                )}
            >
                {children}
                {meta}
            </div>
        </div>
    );
};
