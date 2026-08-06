import { AlertCircle, Clock, Loader2, RotateCcw, X } from 'lucide-react';
import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, MessageBubble, MessageRow, ReadReceipt } from '@chatic/web-ui-kit';
import { cn } from '@chatic/ui-kit';

import type { ClientChatView } from '../types';
import type { ReactionTally } from '../utils/foldReactions';
import type { ThreadMeta } from '../utils/buildThread';
import { ReactionChips } from './ReactionChips';
import { ThreadFooter } from './ThreadFooter';

// A message longer than this is truncated in the bubble with a "view all" affordance.
const MAX_MESSAGE_LENGTH = 200;
const LONG_PRESS_DELAY_MS = 450;

/** Per-message read state — computed by the container from join cursors. */
export interface MessageReadInfo {
    /** Whether a read receipt should be shown for this chat at all. */
    show: boolean;
    /** Join cursors have synced enough to trust the counts. */
    isReady: boolean;
    /** Members who have read this message. */
    readCount: number;
    /** Members who have not read this message yet. */
    unreadCount: number;
    /** Receipt presentation: `count` (group N·M) or `dm` (1:1 "1" badge). Defaults to `count`. */
    mode?: 'count' | 'dm';
}

export interface ChannelMessageRowProps {
    message: ClientChatView;
    /** Sender avatar/name shown (first message of a consecutive group). */
    showProfileAndName: boolean;
    /** Time + status meta shown (last message of a group, or pending/failed). */
    showTimeAndStatus: boolean;
    /** Display name (site nick preferred) for `other` rows. */
    ownerDisplayName: string;
    /** Avatar thumbnail URL for `other` rows. */
    ownerAvatar?: string;
    /** Preformatted send time (e.g. "오후 12:10"). */
    time: string;
    read: MessageReadInfo;
    /** Long-press / right-click — opens the message action sheet (owned by the page). */
    onLongPress: () => void;
    onExpand: () => void;
    onRetry: () => void;
    onDelete: () => void;
    /** Folded reactions for this message; chips render only when present. */
    reactions?: ReactionTally[];
    onToggleReaction?: (emoji: string, isMine: boolean) => void;
    /** The last reaction toggle on this message was rejected by the server. */
    reactionFailed?: boolean;
    /** Resolves a reactor's display name for the chip a11y label. */
    nameOf?: (userId: string) => string;
    /** Loaded-reply aggregate for this root; the footer renders only when present. */
    threadMeta?: ThreadMeta;
    /** Replies newer than my read cursor exist (ADR-0045 decision 5). */
    hasUnseenReplies?: boolean;
    /** Opens the full-screen thread. Absent on surfaces without one (the thread page itself). */
    onOpenThread?: () => void;
}

/**
 * One chat message row, composed from the web-ui-kit MessageRow + MessageBubble.
 * Owns the presentational concerns the design system stays out of: long-press to
 * open the action sheet, pending/failed status with retry/delete, the read receipt,
 * long-message truncation → "전체보기", reaction chips and the thread footer.
 */
export const ChannelMessageRow = ({
    message,
    showProfileAndName,
    showTimeAndStatus,
    ownerDisplayName,
    ownerAvatar,
    time,
    read,
    onLongPress,
    onExpand,
    onRetry,
    onDelete,
    reactions,
    onToggleReaction,
    reactionFailed,
    nameOf,
    threadMeta,
    hasUnseenReplies,
    onOpenThread,
}: ChannelMessageRowProps) => {
    const { t } = useTranslation();
    const mine = message.isOwner;
    const content = message.content ?? '';
    const isLong = !message.isPending && !message.isFailed && content.length > MAX_MESSAGE_LENGTH;

    // Chips are hidden on a tombstone — the reactions still exist in the fold, but a
    // deleted message must not keep a live social surface.
    const tallies = !message.hidden ? reactions : undefined;

    // Long-press (or right-click) opens the action sheet — the timer lives here since
    // the web-ui-kit bubble is purely presentational.
    const timerRef = useRef<number | null>(null);
    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
        event.preventDefault();
        if (!content) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            onLongPress();
        }, LONG_PRESS_DELAY_MS);
    };
    const handleContextMenu = (event: ReactMouseEvent<HTMLSpanElement>) => {
        if (!content) return;
        event.preventDefault();
        clearTimer();
        onLongPress();
    };

    // Avatar slot for `other` rows — the real avatar on the first message of a
    // group, a same-size spacer otherwise so stacked bubbles stay aligned. 32px
    // matches the Figma message-row avatar (node 3209:27250).
    const avatar = mine ? undefined : showProfileAndName ? (
        ownerAvatar ? (
            <ImageAvatar src={ownerAvatar} alt={ownerDisplayName} size={32} />
        ) : (
            <DefaultAvatar size={32} />
        )
    ) : (
        <span className="block size-[32px] shrink-0" />
    );

    // Time is suppressed for pending/failed rows — the status carries the state there.
    const metaTime = showTimeAndStatus && !message.isPending && !message.isFailed ? time : undefined;

    let status: React.ReactNode = undefined;
    if (showTimeAndStatus) {
        if (message.isPending) {
            status = (
                <span className="flex items-center gap-1 text-muted-foreground/70">
                    <Clock size={11} />
                    <span>{t('chat.room.sending')}</span>
                </span>
            );
        } else if (message.isFailed) {
            status = (
                <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle size={11} />
                    <span>{t('chat.room.failed')}</span>
                    {mine && (
                        <>
                            <button
                                onClick={onRetry}
                                className="ml-2 flex items-center text-destructive"
                                title={t('chat.room.retry')}
                            >
                                <RotateCcw size={11} />
                            </button>
                            <button
                                onClick={onDelete}
                                className="ml-1 flex items-center text-destructive"
                                title={t('chat.room.delete')}
                            >
                                <X size={11} />
                            </button>
                        </>
                    )}
                </span>
            );
        } else if (read.show && message.chatNo !== undefined) {
            status = read.isReady ? (
                <ReadReceipt
                    mode={read.mode}
                    readCount={read.readCount}
                    unreadCount={read.unreadCount}
                    readLabel={t('chat.room.read')}
                    unreadLabel={t('chat.room.unread')}
                />
            ) : (
                <Loader2 size={11} className="animate-spin text-muted-foreground" />
            );
        }
    }

    return (
        <MessageRow
            variant={mine ? 'mine' : 'other'}
            avatar={avatar}
            time={metaTime}
            status={status}
            className={cn(!showProfileAndName && '-mt-1')}
        >
            {!mine && showProfileAndName && <span className="text-xs text-muted-foreground">{ownerDisplayName}</span>}
            <div className="flex min-w-0 items-center gap-1.5">
                {message.isFailed && mine && (
                    <button onClick={onRetry} className="flex shrink-0 items-center">
                        <AlertCircle size={20} className="text-destructive" />
                    </button>
                )}
                <span
                    // `min-w-0`: as a flex item this span defaults to `min-width: auto`
                    // (= its min-content width), and min-width beats max-width — a long
                    // unbroken message would push it past `max-w-full` and out of the row.
                    className="inline-flex min-w-0 max-w-full"
                    onPointerDown={handlePointerDown}
                    onPointerUp={clearTimer}
                    onPointerLeave={clearTimer}
                    onPointerCancel={clearTimer}
                    onContextMenu={handleContextMenu}
                >
                    <MessageBubble
                        variant={mine ? 'mine' : 'other'}
                        className={cn(
                            message.isFailed && 'border border-destructive/30 bg-destructive/10 text-destructive'
                        )}
                        onExpand={isLong ? onExpand : undefined}
                        expandLabel={t('chat.room.viewAll')}
                    >
                        {isLong ? `${content.slice(0, MAX_MESSAGE_LENGTH)}...` : content}
                    </MessageBubble>
                </span>
            </div>
            {tallies && tallies.length > 0 && onToggleReaction && (
                <ReactionChips tallies={tallies} nameOf={nameOf ?? (id => id)} onToggle={onToggleReaction} />
            )}
            {reactionFailed && <span className="text-[11px] text-destructive">{t('chat.room.reactionFailed')}</span>}
            {threadMeta && onOpenThread && (
                <ThreadFooter meta={threadMeta} hasUnseen={!!hasUnseenReplies} onOpen={onOpenThread} />
            )}
        </MessageRow>
    );
};
