import { AlertCircle, Clock, Loader2, RotateCcw, X } from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, MessageBubble, MessageRow, ReadReceipt } from '@chatic/web-ui-kit';
import {
    BlockKitMessage,
    blocksToPlainText,
    hasDrawableBlocks,
    resolveChatBlocks,
    takeSourceLink,
} from '@chatic/block-kit';
import { cn } from '@chatic/ui-kit';
import { chatMediaItems, extractFirstUrl, isMessageEdited, isWebhookChat } from '@chatic/runtime-react';

import { hiddenPartsOf } from '../lib/localMediaPrefs';
import type { ClientChatView } from '../types';
import type { ReactionTally } from '../utils/foldReactions';
import type { ThreadMeta } from '../utils/buildThread';
import { LONG_PRESS_DELAY_MS, MOVE_CANCEL_PX } from '../utils/longPress';
import { mentionMarksFor, type MentionPerson, type MentionViewer } from '../utils/mentionHighlight';
import { openExternalUrl } from '../utils/openExternalUrl';
import { MessageCodeBlock } from './MessageCodeBlock';
import { MessageText } from './MessageText';
import { MessageImages } from './MessageImages';
import { MessageLinkPreview } from './MessageLinkPreview';
import { ReactionChips } from './ReactionChips';
import { ThreadFooter } from './ThreadFooter';

const MAX_MESSAGE_LENGTH = 200;
const EDITED_MARK_CLASS = 'shrink-0 self-end pb-0.5 text-[11px] leading-none text-muted-foreground';

export interface MessageReadInfo {
    show: boolean;
    isReady: boolean;
    readCount: number;
    unreadCount: number;
    mode?: 'count' | 'dm' | 'readers';
    readers?: string[];
}

export interface ChannelMessageRowProps {
    message: ClientChatView;
    showProfileAndName: boolean;
    showTimeAndStatus: boolean;
    ownerDisplayName: string;
    ownerAvatar?: string;
    time: string;
    read: MessageReadInfo;
    onLongPress: () => void;
    onExpand: () => void;
    onRetry: () => void;
    onDelete: () => void;
    reactions?: ReactionTally[];
    onToggleReaction?: (emoji: string, isMine: boolean) => void;
    reactionFailed?: boolean;
    nameOf?: (userId: string) => string;
    onAddReaction?: () => void;
    onShowReactors?: (key: string) => void;
    avatarOf?: (userId: string) => string | undefined;
    threadMeta?: ThreadMeta;
    unseenReplyCount?: number;
    unseenRepliesMentionMe?: boolean;
    formatThreadTime?: (date: Date) => string;
    onOpenThread?: () => void;
    isEditTarget?: boolean;
    onOpenProfile?: (sender: MessageSender) => void;
    mentionViewer?: MentionViewer;
    hiddenMedia?: ReadonlySet<string>;
    threadRootNo?: string;
}

export interface MessageSender {
    id: string;
    name: string;
    avatar?: string | null;
}

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
    onAddReaction,
    onShowReactors,
    avatarOf,
    threadMeta,
    unseenReplyCount,
    unseenRepliesMentionMe,
    formatThreadTime,
    onOpenThread,
    isEditTarget = false,
    onOpenProfile,
    mentionViewer,
    hiddenMedia,
    threadRootNo,
}: ChannelMessageRowProps) => {
    const { t } = useTranslation();
    const mine = message.isOwner;
    const mentionMarks = mentionMarksFor(message, mentionViewer);
    const content = message.content ?? '';
    const isDeleted = !!message.hidden;
    const hidden = useMemo(() => hiddenPartsOf(message, hiddenMedia), [hiddenMedia, message]);
    const shownUploads = (message.upload$$?.length ?? 0) - (hidden?.slots.size ?? 0);
    const audioOnlyFailed = useMemo(() => {
        if (!message.isFailed || content.trim() || !message.upload$$?.length) return false;
        const split = chatMediaItems(message.cid, message.upload$$);
        return split.media.length === 0 && split.files.every(file => file.audio);
    }, [message.isFailed, message.cid, message.upload$$, content]);
    const hasImages = !isDeleted && shownUploads > 0;
    const imageOnly = hasImages && !content.trim();
    const wasEdited = !isEditTarget && isMessageEdited(message);
    const skipBlocks = isDeleted || message.isPending || message.isFailed;
    const { drawnBlocks, plain, sourceUrl } = useMemo(() => {
        if (skipBlocks) return { drawnBlocks: null, plain: content, sourceUrl: undefined };
        const { blocks, source } = resolveChatBlocks(message);
        const drawable = blocks && hasDrawableBlocks(blocks) ? blocks : null;
        const linked = drawable ? takeSourceLink(drawable, message.source$) : null;
        return {
            drawnBlocks: linked?.blocks ?? null,
            plain: drawable && source === 'content' ? blocksToPlainText(drawable) : content,
            sourceUrl: linked?.sourceUrl,
        };
    }, [skipBlocks, content, message]);
    const isLong = !skipBlocks && !drawnBlocks && content.length > MAX_MESSAGE_LENGTH;
    const firstUrl = skipBlocks || message.isSystem ? undefined : extractFirstUrl(plain, isLong);
    const previewUrl = firstUrl && hidden?.links.has(firstUrl) ? undefined : firstUrl;

    const tallies = !isDeleted ? reactions : undefined;

    const canPress = !isDeleted && !isEditTarget && (!!content || hasImages);
    const pressTargetRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (isEditTarget) pressTargetRef.current?.scrollIntoView?.({ block: 'center' });
    }, [isEditTarget]);
    const isOwnEvent = (event: { currentTarget: Element; target: EventTarget }) =>
        event.currentTarget.contains(event.target as Node);
    const timerRef = useRef<number | null>(null);
    const longPressFiredRef = useRef(false);
    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
    const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
        if (!isOwnEvent(event)) return;
        if (event.pointerType === 'mouse') event.preventDefault();
        if (!canPress) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        clearTimer();
        longPressFiredRef.current = false;
        pressOriginRef.current = { x: event.clientX, y: event.clientY };
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            longPressFiredRef.current = true;
            onLongPress();
        }, LONG_PRESS_DELAY_MS);
    };
    const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
        const origin = pressOriginRef.current;
        if (timerRef.current === null || !origin) return;
        if (
            Math.abs(event.clientX - origin.x) > MOVE_CANCEL_PX ||
            Math.abs(event.clientY - origin.y) > MOVE_CANCEL_PX
        ) {
            clearTimer();
        }
    };
    const handleContextMenu = (event: ReactMouseEvent<HTMLSpanElement>) => {
        if (!canPress || !isOwnEvent(event)) return;
        event.preventDefault();
        clearTimer();
        longPressFiredRef.current = true;
        onLongPress();
    };
    const handleUrlClick = (url: string) => {
        if (longPressFiredRef.current) return;
        openExternalUrl(url);
    };
    const handleMentionClick = onOpenProfile
        ? (person: MentionPerson) => {
              if (longPressFiredRef.current) return;
              onOpenProfile({ id: person.id, name: person.name, avatar: person.avatar });
          }
        : undefined;
    const handleImageClickCapture = (event: ReactMouseEvent<HTMLSpanElement>) => {
        if (event.detail === 0 || !longPressFiredRef.current || !isOwnEvent(event)) return;
        longPressFiredRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    };
    const pressHandlers = {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: clearTimer,
        onPointerLeave: clearTimer,
        onPointerCancel: clearTimer,
        onContextMenu: handleContextMenu,
    };

    const avatarImage = ownerAvatar ? (
        <ImageAvatar src={ownerAvatar} alt={ownerDisplayName} size={32} />
    ) : (
        <DefaultAvatar size={32} />
    );
    const openProfile =
        onOpenProfile && !mine && showProfileAndName && message.ownerId && !isWebhookChat(message)
            ? () => onOpenProfile({ id: message.ownerId as string, name: ownerDisplayName, avatar: ownerAvatar })
            : undefined;
    const avatar = mine ? undefined : showProfileAndName ? (
        openProfile ? (
            <button
                type="button"
                onClick={openProfile}
                aria-label={t('chat.room.openProfile', { name: ownerDisplayName })}
                className="block rounded-full"
            >
                {avatarImage}
            </button>
        ) : (
            avatarImage
        )
    ) : (
        <span className="block size-[32px] shrink-0" />
    );

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
        } else if (message.isFailed && !audioOnlyFailed) {
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
        } else if (read.show && message.chatNo !== undefined && read.mode !== 'readers') {
            status = read.isReady ? (
                <ReadReceipt
                    mode={read.mode}
                    readCount={read.readCount}
                    unreadCount={read.unreadCount}
                    readLabel={t('chat.room.read')}
                    unreadLabel={t('chat.room.unread')}
                    allReadLabel={t('chat.room.allRead', { count: read.readCount })}
                />
            ) : (
                <Loader2 size={11} className="animate-spin text-muted-foreground" />
            );
        }
    }

    const receiptLine =
        read.show &&
        read.mode === 'readers' &&
        message.chatNo !== undefined &&
        !message.isPending &&
        !message.isFailed ? (
            read.isReady ? (
                <ReadReceipt
                    mode="readers"
                    readCount={read.readCount}
                    unreadCount={read.unreadCount}
                    readers={(read.readers ?? []).map(id => {
                        const src = avatarOf?.(id);
                        return src ? (
                            <ImageAvatar key={id} src={src} alt="" size={20} className="ring-1 ring-background" />
                        ) : (
                            <DefaultAvatar key={id} size={20} className="ring-1 ring-background" />
                        );
                    })}
                    readLabel={t('chat.room.receipt.read')}
                    unreadLabel={t('chat.room.receipt.unconfirmed')}
                    allReadLabel={t('chat.room.receipt.allRead')}
                />
            ) : (
                <Loader2 size={11} className="m-1 animate-spin text-muted-foreground" />
            )
        ) : null;

    const renderImages = () => (
        <span
            className={cn(
                'flex min-w-0 max-w-full select-none [-webkit-touch-callout:none]',
                mine ? 'self-end' : 'self-start'
            )}
            {...pressHandlers}
            onClickCapture={handleImageClickCapture}
        >
            <MessageImages
                uploads={message.upload$$}
                chatId={message.id}
                cid={message.cid}
                align={mine ? 'end' : 'start'}
                hiddenSlots={hidden?.slots}
                audio={{
                    channelId: message.channelId,
                    chatNo: message.chatNo,
                    senderName: mine ? message.ownerName : ownerDisplayName,
                    sentAt: message.timestamp?.getTime?.(),
                    threadRootNo,
                    mine,
                    failed: !!message.isFailed,
                    onRetry,
                    onDelete,
                }}
            />
        </span>
    );

    if (hidden && !isDeleted && shownUploads === 0 && !content.trim()) return null;

    return (
        <MessageRow
            variant={mine ? 'mine' : 'other'}
            avatar={avatar}
            time={metaTime}
            status={status}
            wide={!!drawnBlocks}
            className={cn(!showProfileAndName && '-mt-1')}
        >
            {!mine &&
                showProfileAndName &&
                (openProfile ? (
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        onClick={openProfile}
                        className="text-left text-xs text-muted-foreground"
                    >
                        {ownerDisplayName}
                    </button>
                ) : (
                    <span className="text-xs text-muted-foreground">{ownerDisplayName}</span>
                ))}
            <div className={cn('flex w-full min-w-0 items-center gap-1.5', mine && 'justify-end')}>
                {message.isFailed && mine && !audioOnlyFailed && (
                    <button onClick={onRetry} className="flex shrink-0 items-center">
                        <AlertCircle size={20} className="text-destructive" />
                    </button>
                )}
                {wasEdited && mine && (
                    <span className={EDITED_MARK_CLASS} title={t('chat.room.editedDescription')}>
                        {t('chat.room.edited')}
                    </span>
                )}
                {imageOnly ? (
                    renderImages()
                ) : (
                    <span
                        className="inline-flex min-w-0 max-w-full select-none [-webkit-touch-callout:none]"
                        ref={pressTargetRef}
                        data-edit-target={isEditTarget || undefined}
                        {...pressHandlers}
                    >
                        {drawnBlocks ? (
                            <div className="min-w-0 max-w-full rounded-[10px] border border-hairline bg-card p-4">
                                <BlockKitMessage
                                    blocks={drawnBlocks}
                                    raw={content}
                                    onLinkClick={handleUrlClick}
                                    sourceUrl={sourceUrl}
                                    source={message.source$}
                                    labels={{
                                        expandCode: count => t('chat.room.codeBlock.expand', { count }),
                                        collapseCode: t('chat.room.codeBlock.collapse'),
                                        openSource: t('chat.room.attachment.openSource'),
                                    }}
                                />
                            </div>
                        ) : (
                            <MessageBubble
                                variant={mine ? 'mine' : 'other'}
                                className={cn(
                                    message.isFailed &&
                                        'border border-destructive/30 bg-destructive/10 text-destructive',
                                    isEditTarget && 'ring-2 ring-main-accent'
                                )}
                                onExpand={isLong ? onExpand : undefined}
                                expandLabel={t('chat.room.viewAll')}
                            >
                                {isDeleted ? (
                                    <span className="italic text-muted-foreground">
                                        {t('chat.room.deletedMessage')}
                                    </span>
                                ) : (
                                    <>
                                        <MessageText
                                            text={isLong ? content.slice(0, MAX_MESSAGE_LENGTH) : content}
                                            truncated={isLong}
                                            onUrlClick={handleUrlClick}
                                            renderCodeBlock={(code, lang) => (
                                                <MessageCodeBlock code={code} lang={lang} />
                                            )}
                                            mentions={mentionMarks}
                                            onMentionClick={handleMentionClick}
                                        />
                                        {isLong && '...'}
                                    </>
                                )}
                            </MessageBubble>
                        )}
                    </span>
                )}
                {wasEdited && !mine && (
                    <span className={EDITED_MARK_CLASS} title={t('chat.room.editedDescription')}>
                        {t('chat.room.edited')}
                    </span>
                )}
            </div>
            {hasImages && !imageOnly && renderImages()}
            {previewUrl && <MessageLinkPreview url={previewUrl} />}
            {tallies && tallies.length > 0 && onToggleReaction && (
                <ReactionChips
                    tallies={tallies}
                    nameOf={nameOf ?? (id => id)}
                    onToggle={onToggleReaction}
                    onAdd={onAddReaction}
                    onShowReactors={onShowReactors}
                    align={mine ? 'end' : 'start'}
                />
            )}
            {reactionFailed && <span className="text-[11px] text-destructive">{t('chat.room.reactionFailed')}</span>}
            {threadMeta && onOpenThread && (
                <ThreadFooter
                    meta={threadMeta}
                    unseenCount={unseenReplyCount ?? 0}
                    mentionsMe={unseenRepliesMentionMe}
                    nameOf={nameOf}
                    onOpen={onOpenThread}
                    avatarOf={avatarOf}
                    formatTime={formatThreadTime}
                    align={mine ? 'end' : 'start'}
                />
            )}
            {receiptLine}
        </MessageRow>
    );
};
