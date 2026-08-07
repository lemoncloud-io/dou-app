import type { JSX, KeyboardEvent } from 'react';

import { cn } from '@chatic/lib/utils';
import { DefaultAvatar, ImageAvatar } from '@chatic/web-ui-kit';

export interface InAppNotificationCardProps {
    title: string;
    body?: string;
    /** Sender/channel photo when the push carried one; falls back to the group glyph. */
    avatarUrl?: string;
    /** Absent when the push payload carries nothing routable — the card is then display-only. */
    onClick?: () => void;
}

/**
 * Foreground-push banner content rendered inside a Sonner custom toast, in the messenger
 * idiom Slack and Kakao share: a banner that drops in from the top edge, carrying a face,
 * who it is from, and the first line or two of what they said.
 *
 * Laid out as avatar + text rather than the earlier accent-bar card. The face is what makes
 * a notification scannable in the half-second it is glanced at — the bar was decoration
 * doing the same job worse, and it read as an alert rather than as a message.
 *
 * The drop-down motion is Sonner's own for a `top-center` toast; nothing here animates, so
 * the two can't fight. Swipe-up to dismiss comes from the same place.
 */
export const InAppNotificationCard = ({ title, body, avatarUrl, onClick }: InAppNotificationCardProps): JSX.Element => {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
        }
    };

    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            className={cn(
                // Theme-following surface (popover/card tokens), unlike the ui-kit toast's
                // intentionally inverted `bg-toast` — a notification banner should blend with
                // the app background in both light and dark themes.
                'pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-input-border bg-popover px-3.5 py-3 text-popover-foreground',
                'shadow-[0_10px_30px_-8px_rgba(0,0,0,0.22),0_3px_10px_-4px_rgba(0,0,0,0.12)]',
                onClick && 'cursor-pointer active:opacity-90'
            )}
        >
            <span className="mt-0.5 shrink-0">
                {avatarUrl ? <ImageAvatar src={avatarUrl} alt="" size={36} /> : <DefaultAvatar size={36} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-[15px] font-semibold leading-5 tracking-[-0.075px]">{title}</p>
                {body ? (
                    <p className="line-clamp-2 text-[13px] leading-[1.45] tracking-[-0.065px] text-description">
                        {body}
                    </p>
                ) : null}
            </div>
        </div>
    );
};
