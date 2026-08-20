import type { JSX, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

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

/** Avatar diameter from the design (Figma 4087:17638) — smaller than a list row's, the banner is transient. */
const AVATAR_SIZE = 38;

/**
 * Foreground-push banner content rendered inside a Sonner custom toast, in the messenger
 * idiom Slack and Kakao share: a banner that drops in from the top edge, carrying a face,
 * who it is from, and the first line of what they said.
 *
 * Laid out as avatar + text rather than the earlier accent-bar card. The face is what makes
 * a notification scannable in the half-second it is glanced at — the bar was decoration
 * doing the same job worse, and it read as an alert rather than as a message.
 *
 * The drop-down motion is Sonner's own for a `top-center` toast; nothing here animates, so
 * the two can't fight. Swipe-up to dismiss comes from the same place.
 */
export const InAppNotificationCard = ({ title, body, avatarUrl, onClick }: InAppNotificationCardProps): JSX.Element => {
    const { t } = useTranslation();

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
                // the app background in both light and dark themes. The design asks for a
                // translucent, blurred sheet rather than an opaque one, so whatever the banner
                // covers stays faintly legible underneath: the interruption is felt as an
                // overlay on the screen you were reading, not as a lid on top of it.
                'pointer-events-auto flex w-full items-center gap-2 overflow-hidden rounded-2xl border border-input-border bg-popover/[0.82] py-[9px] pl-[9px] pr-[14px] text-popover-foreground backdrop-blur-[5px]',
                // A single tight shadow, only enough to lift the sheet off the screen — the
                // earlier two-layer drop shadow made a transient banner look like a modal.
                'shadow-[0_1px_8px_0_rgba(0,0,0,0.08)]',
                onClick && 'cursor-pointer active:opacity-90'
            )}
        >
            <span className="shrink-0">
                {avatarUrl ? (
                    <ImageAvatar src={avatarUrl} alt="" size={AVATAR_SIZE} />
                ) : (
                    <DefaultAvatar size={AVATAR_SIZE} />
                )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <div className="flex w-full items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold leading-normal tracking-[-0.075px]">{title}</p>
                    {/*
                     * A foreground push is by definition just-arrived, so the label is the fixed
                     * word "now" — no relative-time computation, and nothing to keep ticking for
                     * a banner that lives 5 seconds. It still earns its place: it is the cue that
                     * separates a live message from the notification list's older entries.
                     *
                     * `shrink-0` so a long title truncates instead of squeezing the label out.
                     */}
                    <span className="shrink-0 text-[12px] font-medium leading-[14px] tracking-[-0.06px] text-label opacity-50">
                        {t('notifications.inApp.now')}
                    </span>
                </div>
                {/*
                 * One line, ellipsised — the design's choice, and the honest one: the banner is a
                 * pointer to the message, not the message. Anything longer is read in the room.
                 *
                 * `text-label` rather than the lighter `text-description` it used to be: the design
                 * keeps the body close to the title and pushes only the timestamp back, which it
                 * does by fading the *same* ink. Reusing one token at two opacities keeps that
                 * ranking intact in dark mode too, where label and description collapse to one hue.
                 */}
                {body ? (
                    <p className="w-full truncate text-[14px] leading-normal tracking-[-0.07px] text-label">{body}</p>
                ) : null}
            </div>
        </div>
    );
};
