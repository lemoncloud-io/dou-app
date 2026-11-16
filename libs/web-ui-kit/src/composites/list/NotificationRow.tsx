import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { Checkbox } from '../../foundations/checkbox/Checkbox';

/** How long a press has to rest before it counts as a long press. */
export const NOTIFICATION_LONG_PRESS_MS = 500;
/** How far a finger may drift during a press before it is a scroll, not a press. */
const PRESS_SLOP_PX = 10;

export interface NotificationRowProps {
    /** The sender's avatar, 42px (e.g. a `ProfileAvatar`). */
    avatar: React.ReactNode;
    /** Sender name. */
    sender: string;
    /** When it happened, already formatted by the host ("오후 3:27", "11월 10일"). */
    time: string;
    /** Unread — the red dot and the light lime ground. */
    unread?: boolean;
    /** Accessible word for the dot (e.g. a localized "Unread"); folded into the row's name. */
    unreadLabel?: string;
    /** The type chip that opens the location line (`NotificationTypeChip`); reactions and new 1:1 messages carry none. */
    typeChip?: React.ReactNode;
    /** Where it happened — "#room" or "1:1 대화" — in the strong grey. */
    location?: string;
    /** Why it is here — "내 메시지에 답글", "내 메시지에 반응 ❤️" — in the light grey. */
    context?: React.ReactNode;
    /** The original message a reply or reaction points at, one line under a rule. The host adds any "원글:" prefix. */
    quote?: string;
    /** The message itself, one line. A node, so the host can set `@name` in bold. */
    body: React.ReactNode;
    /** Selection mode — the check circle shows on the left and a tap toggles. */
    selectable?: boolean;
    /** Selected in selection mode — the navy check and the tinted ground. */
    selected?: boolean;
    /** Tap. In selection mode the host toggles the row; otherwise it opens the message. */
    onPress?: () => void;
    /** A press held for {@link NOTIFICATION_LONG_PRESS_MS} — enters selection mode with this row picked. */
    onLongPress?: () => void;
    className?: string;
}

/**
 * Notification row — one item of "내 알림" and "나를 찾는 메시지" (Figma "알림 행" 6023:19308). From
 * the top: sender · time · unread dot; the type chip, location and context; the quoted original;
 * the message. Unread rows sit on a light lime ground with a red dot; read rows on the page. In
 * selection mode a check circle leads the row and a picked row is tinted navy.
 *
 * Stateless apart from one gesture: a held press is timed so `onLongPress` can fire, and the click
 * that ends it is swallowed so the same press does not also toggle or open.
 */
export const NotificationRow = ({
    avatar,
    sender,
    time,
    unread = false,
    unreadLabel,
    typeChip,
    location,
    context,
    quote,
    body,
    selectable = false,
    selected = false,
    onPress,
    onLongPress,
    className,
}: NotificationRowProps) => {
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const origin = React.useRef<{ x: number; y: number } | null>(null);
    const fired = React.useRef(false);

    const cancel = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        origin.current = null;
    };
    React.useEffect(() => cancel, []);

    const handlePointerDown = (event: React.PointerEvent) => {
        fired.current = false;
        if (!onLongPress) return;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
            fired.current = true;
            timer.current = null;
            onLongPress();
        }, NOTIFICATION_LONG_PRESS_MS);
    };
    const handlePointerMove = (event: React.PointerEvent) => {
        if (!origin.current) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (Math.hypot(dx, dy) > PRESS_SLOP_PX) cancel();
    };
    const handleClick = () => {
        if (fired.current) {
            fired.current = false;
            return;
        }
        onPress?.();
    };

    const name = unread && unreadLabel ? `${sender}, ${unreadLabel}` : undefined;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={selectable ? selected : undefined}
            aria-label={name}
            onClick={handleClick}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPress?.();
                }
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={event => onLongPress && event.preventDefault()}
            data-unread={unread || undefined}
            className={cn(
                // The ground eases between unread, read and picked; a press dims the row a touch.
                'flex w-full cursor-pointer select-none items-start px-3 py-2 text-left transition-[background-color,filter] duration-300 active:brightness-95 motion-reduce:transition-none',
                selectable && selected ? 'bg-nav-ink/[0.06]' : unread ? 'bg-primary/[0.08]' : 'bg-transparent',
                className
            )}
        >
            <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1 py-1.5">
                {selectable && (
                    <span className="flex h-[42px] shrink-0 items-center duration-200 animate-in fade-in-0 slide-in-from-left-2 motion-reduce:animate-none">
                        <Checkbox checked={selected} tone="ink" size={22} interactive={false} />
                    </span>
                )}
                <span className="size-[42px] shrink-0">{avatar}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[18px] tracking-[-0.15px] text-notify-name">
                                {sender}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                <span className="whitespace-nowrap text-[12px] leading-[18px] tracking-[-0.12px] text-description">
                                    {time}
                                </span>
                                {unread && (
                                    <span
                                        aria-hidden
                                        data-unread-dot
                                        className="size-[7px] rounded-full bg-alert-red duration-200 animate-in fade-in-0 zoom-in-50 motion-reduce:animate-none"
                                    />
                                )}
                            </span>
                        </div>
                        {(typeChip || location || context) && (
                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-[11px]">
                                {typeChip}
                                {location && (
                                    <span className="shrink-0 whitespace-nowrap font-semibold text-notify-ink">
                                        {location}
                                    </span>
                                )}
                                {context && (
                                    <span className="min-w-0 truncate font-medium text-notify-muted">{context}</span>
                                )}
                            </div>
                        )}
                    </div>
                    {quote && (
                        <div className="w-full border-l-2 border-input-border py-0.5 pl-2">
                            <p className="truncate text-[11px] leading-[1.4] text-description">{quote}</p>
                        </div>
                    )}
                    <p className="truncate text-[13px] leading-[1.3] tracking-[-0.13px] text-notify-ink">{body}</p>
                </div>
            </div>
        </div>
    );
};
