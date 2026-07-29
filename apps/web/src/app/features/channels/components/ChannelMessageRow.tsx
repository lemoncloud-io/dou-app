import { AlertCircle, Clock, Copy, Loader2, RotateCcw, X } from 'lucide-react';
import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, MessageBubble, MessageRow, ReadReceipt } from '@chatic/web-ui-kit';
import { cn } from '@chatic/ui-kit';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import type { ClientChatView } from '../types';

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
    /** The action (copy) dropdown open state for this row. */
    isActionOpen: boolean;
    isCopying: boolean;
    onActionOpenChange: (open: boolean) => void;
    onLongPress: () => void;
    onCopy: () => void;
    onExpand: () => void;
    onRetry: () => void;
    onDelete: () => void;
}

/**
 * One chat message row, composed from the web-ui-kit MessageRow + MessageBubble.
 * Owns the presentational concerns the design system stays out of: long-press to
 * open the copy menu, pending/failed status with retry/delete, the read receipt,
 * and long-message truncation → "전체보기".
 */
export const ChannelMessageRow = ({
    message,
    showProfileAndName,
    showTimeAndStatus,
    ownerDisplayName,
    ownerAvatar,
    time,
    read,
    isActionOpen,
    isCopying,
    onActionOpenChange,
    onLongPress,
    onCopy,
    onExpand,
    onRetry,
    onDelete,
}: ChannelMessageRowProps) => {
    const { t } = useTranslation();
    const mine = message.isOwner;
    const content = message.content ?? '';
    const isLong = !message.isPending && !message.isFailed && content.length > MAX_MESSAGE_LENGTH;

    // Long-press (or right-click) opens the copy menu — the timer lives here since
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
                <DropdownMenu open={isActionOpen} onOpenChange={onActionOpenChange}>
                    <DropdownMenuTrigger asChild>
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
                                    message.isFailed &&
                                        'border border-destructive/30 bg-destructive/10 text-destructive'
                                )}
                                onExpand={isLong ? onExpand : undefined}
                                expandLabel={t('chat.room.viewAll')}
                            >
                                {isLong ? `${content.slice(0, MAX_MESSAGE_LENGTH)}...` : content}
                            </MessageBubble>
                        </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align={mine ? 'end' : 'start'}
                        side="top"
                        sideOffset={6}
                        className="min-w-[132px]"
                    >
                        <DropdownMenuItem disabled={isCopying} onSelect={onCopy} className="cursor-pointer gap-2">
                            {isCopying && isActionOpen ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Copy className="size-4" />
                            )}
                            <span>{t('chat.room.copyMessage')}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </MessageRow>
    );
};
