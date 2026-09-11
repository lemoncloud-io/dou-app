import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { ChatRoomHeader, DefaultAvatar, ImageAvatar, MessageInput } from '@chatic/web-ui-kit';

import { ChannelMessageRow } from '../components/ChannelMessageRow';
import { ReactionChips } from '../components/ReactionChips';
import { MessageText } from '../components/MessageText';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { MessageDetailDialog } from '../components/MessageDetailDialog';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelProfiles,
    useChatMutations,
    useChats,
    useReactions,
} from '../hooks';
import type { ClientChatView, DomainChat } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { messagePlainText } from '../utils/messagePlainText';
import { resolveChatOwnerName, resolveUserName, type DisplayNameSources } from '../utils/displayName';
import { buildThread } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';

const MAX_INPUT_LENGTH = 5000;

/**
 * Full-screen thread: one root message and its direct replies (ADR-0045 decision 4).
 *
 * Everything here is derived from the channel's loaded cache window (`rawChats` →
 * `buildThread`), so the reply list is best-effort (ADR-0008): an old thread may need
 * the channel history paged in before its older replies appear. Replies send with
 * `parentId: root.id` — the FULL `<channelId>:<chatNo>` id; the server 404s a bare
 * chatNo. Threads are flat: the action sheet here never offers "reply".
 */
export const ThreadPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const { channelId, rootNo } = useParams<{ channelId: string; rootNo: string }>();
    /**
     * The root message handed over by the room (see its `openThread`). The cache's first emission
     * is asynchronous even when it is warm, so without this the thread opens on a spinner and the
     * glass header sits over nothing. Absent on a deep link or a reload — then the spinner is
     * honest, because there really is nothing yet.
     */
    const seededRoot = (useLocation().state as { rootChat?: DomainChat } | null)?.rootChat;
    const stableChannelId = channelId || 'default';

    const [content, setContent] = useState('');
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    // A truncated reply's "전체보기" target (null = closed) — the room's dialog, same rule.
    const [expandedMessage, setExpandedMessage] = useState<{ content: string } | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    // The chip whose reactors are being inspected (message id + long-pressed fold key).
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopying, setIsCopying] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const { headerRef, footerRef: composerRef, headerHeight, footerHeight: composerHeight } = useChromeInsets();

    const { userId } = runtime.session.useSessionIdentity();
    const { channel } = useChannel(channelId || null);
    // One join subscription for the screen — the roster rows and the active-member set are two
    // readings of it (see useChannelJoins). A thread and its room are two views of one channel, so
    // they compose the same way. `myJoin` is no longer read here: it fed the channel title, and the
    // header stopped naming the channel (see below).
    const { joins, activeMemberIds } = useChannelJoins(channelId || null);
    const { members } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
        joins,
    });
    const { profileMap } = useChannelProfiles(channel?.sid ?? null, activeMemberIds);

    // The header names the SCREEN ("스레드"), not the room (Figma 4718:22183) — a thread is a
    // view of a channel, and wearing the channel's name and face would claim otherwise. So no
    // channel title, no channel avatar, and with them go the peer/title chains this screen used
    // to run purely to feed the header. `members` / `profileMap` above stay: they are what give
    // the root and its replies their names and faces.

    const chatParams = useMemo(() => ({ channelId: stableChannelId, limit: 100 }), [stableChannelId]);
    const { rawChats, isLoading, hasMore, isLoadingMore, loadMore } = useChats(chatParams);
    const { sendMessage, readMessage } = useChatMutations();
    const { toggleReaction, failedId } = useReactions();
    const remember = useRecentEmojiStore(s => s.remember);

    const thread = useMemo(() => buildThread(rawChats, rootNo ?? ''), [rawChats, rootNo]);
    // Reactions fold from the UNFILTERED window — the events are hidden rows in it.
    const reactions = useMemo(() => foldReactions(rawChats, userId ?? null), [rawChats, userId]);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    // The one naming chain (see resolveChatOwnerName) — a thread and its room are two views of
    // one channel, so a person cannot be named differently across the hop. It matters more here
    // than in the room: the root ALWAYS shows its author, so a chain that fell through to the raw
    // user id put a UUID at the top of the screen.
    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, userId, t]
    );
    const displayNameOf = useMemo(() => (chat: DomainChat) => resolveChatOwnerName(chat, nameSources), [nameSources]);
    const nameOfUser = useMemo(() => (id: string) => resolveUserName(id, nameSources), [nameSources]);

    // Same precedence for faces as for names — the reactor sheet's avatars must match the
    // bubbles they were opened from.
    const avatarOfUser = useMemo(
        () => (id: string) => profileMap.get(id)?.thumbnail ?? memberById.get(id)?.thumbnail,
        [profileMap, memberById]
    );

    const toClientView = useMemo(
        () =>
            (chat: DomainChat): ClientChatView => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === userId,
                isSystem: chat.stereo === 'system',
                ownerName: displayNameOf(chat),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }),
        [userId, displayNameOf]
    );

    // The cache wins once it has the row: it carries later edits and the tombstone flag, which a
    // snapshot taken at navigation time cannot.
    const rootSource = thread.root ?? seededRoot;
    const root = rootSource ? toClientView(rootSource) : undefined;
    const replies = useMemo(() => thread.replies.map(toClientView), [thread.replies, toClientView]);

    // Keep the newest reply in view — a thread is a linear column, newest at the bottom.
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [replies.length, composerHeight]);

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? t('chat.room.am') : t('chat.room.pm');
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const handleSend = (raw: string) => {
        const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);
        // No root, no reply — the send needs the root's full id (bare chatNo 404s).
        if (!trimmed || !stableChannelId || !thread.root?.id) return;

        setContent('');
        sendMessage({ channelId: stableChannelId, content: trimmed, parentId: thread.root.id })
            .then(newChat => {
                // Replies consume channel chatNos; advance the read cursor like a room send.
                if (newChat?.chatNo) void readMessage({ channelId: stableChannelId, chatNo: newChat.chatNo });
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to send thread reply', {
                    error,
                    data: { channelId: stableChannelId, rootNo },
                });
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (isMobile && e.key === 'Enter') return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(content);
        }
    };

    const handleCopy = async () => {
        // What the message SAYS, not what it is made of — a Block Kit body would otherwise
        // put its payload on the clipboard.
        const text = messagePlainText(actionMessage?.content);
        if (!text || isCopying) return;
        setIsCopying(true);
        try {
            await copyMessageToClipboard(text);
            toast({ title: t('chat.room.messageCopied') });
            setActionMessage(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopying(false);
        }
    };

    const handlePickEmoji = (emoji: string) => {
        if (!actionMessage?.id) return;
        remember(emoji);
        // hasMyReaction matches on the normalised fold key — a display-string compare
        // would send a second `on` for an emoji differing only by variation selector.
        const mine = hasMyReaction(reactions.get(actionMessage.id), emoji);
        toggleReaction(actionMessage.id, emoji, mine);
        setActionMessage(null);
        setPickerOpen(false);
    };

    // Persisted rows only (chatNo > 0): an optimistic row's id is a temp id — a
    // reaction targeting it would 404 and orphan once the persisted swap lands.
    const canReact = !!actionMessage?.chatNo;

    // Chip-row add button — same one-step open as the room: set the target, show the picker.
    const handleAddReaction = (message: ClientChatView) => {
        setActionMessage(message);
        setPickerOpen(true);
    };

    /**
     * The root, rendered as the thread's SUBJECT rather than as another message (Figma
     * 4722:22934): a 36px avatar and name on one line, then the body as plain 16px text with
     * no bubble and no side, then its reaction chips.
     *
     * A bubble would put the root in the same visual class as the replies under it, and a
     * right-aligned bubble (when the root is mine) would put the thread's own subject off to
     * one side of the screen it opens. It also has no read receipt and no time of its own —
     * the room row it was opened from carries both, and repeating them here says nothing.
     */
    const renderRoot = (message: ClientChatView) => {
        const avatarSrc = message.ownerId
            ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
            : undefined;
        const tallies = message.id ? reactions.get(message.id) : undefined;
        return (
            <div data-testid="thread-root" className="flex flex-col px-3">
                <div className="flex items-center gap-2.5 px-1 py-1.5">
                    {avatarSrc ? <ImageAvatar src={avatarSrc} alt="" size={36} /> : <DefaultAvatar size={36} />}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[18px] tracking-[-0.075px] text-foreground">
                        {message.ownerName}
                    </span>
                </div>
                <div className="flex flex-col gap-3 px-1 py-1.5">
                    <p className="whitespace-pre-wrap break-words text-base leading-normal tracking-[-0.08px] text-foreground">
                        <MessageText text={messagePlainText(message.content)} />
                    </p>
                    {tallies && tallies.length > 0 && (
                        <ReactionChips
                            tallies={tallies}
                            nameOf={nameOfUser}
                            onToggle={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
                            onAdd={message.chatNo ? () => handleAddReaction(message) : undefined}
                            onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
                        />
                    )}
                </div>
            </div>
        );
    };

    const renderRow = (message: ClientChatView) => (
        <ChannelMessageRow
            key={message.id}
            message={message}
            showProfileAndName={!message.isOwner}
            showTimeAndStatus
            ownerDisplayName={message.ownerName}
            ownerAvatar={
                message.ownerId
                    ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
                    : undefined
            }
            time={formatTime(message.timestamp)}
            read={{ show: false, isReady: false, readCount: 0, unreadCount: 0 }}
            onLongPress={() => message.content && setActionMessage(message)}
            onExpand={() => setExpandedMessage({ content: messagePlainText(message.content) })}
            onRetry={() => undefined}
            onDelete={() => undefined}
            reactions={message.id ? reactions.get(message.id) : undefined}
            onToggleReaction={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
            reactionFailed={!!message.id && failedId === message.id}
            nameOf={nameOfUser}
            onAddReaction={message.chatNo ? () => handleAddReaction(message) : undefined}
            onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
        />
    );

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                {/* Titled for the screen, not the room, and with no avatar (Figma 4718:22183):
                    a thread is one conversation inside a channel, and the channel's face here
                    would read as having navigated to the channel. Back returns to it
                    (ADR-0045's two-hop). */}
                <ChatRoomHeader
                    title={t('chat.thread.title')}
                    hideAvatar
                    onBack={() => navigate(-1)}
                    className="border-b border-border"
                />
            </div>

            <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-none"
                style={{ paddingTop: headerHeight + 8, paddingBottom: composerHeight + 16 }}
            >
                {isLoading && !root ? (
                    <div data-testid="thread-loading" className="flex min-h-full items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="flex flex-col px-0 py-2">
                        {root ? (
                            renderRoot(root)
                        ) : (
                            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
                                <span>{t('chat.thread.unavailable')}</span>
                                {hasMore && (
                                    <button
                                        type="button"
                                        onClick={() => void loadMore()}
                                        disabled={isLoadingMore}
                                        className="text-primary underline"
                                    >
                                        {isLoadingMore ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            t('chat.thread.loadOlder')
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                        {/* A full-bleed 4px band, not a hairline rule (Figma 4722:23017): it is
                            the seam between the thread's subject and the conversation about it,
                            which is a heavier boundary than the ones between messages. */}
                        <div className="py-4">
                            <div aria-hidden className="h-1 w-full bg-avatar-ring" />
                        </div>
                        {replies.length > 0 && (
                            <p className="px-4 py-1 text-[15px] font-semibold leading-normal tracking-[-0.075px] text-foreground">
                                {t('chat.thread.replyCount', { count: replies.length })}
                            </p>
                        )}
                        <div className="flex flex-col gap-3 pt-4">{replies.map(renderRow)}</div>
                    </div>
                )}
            </div>

            <div
                ref={composerRef}
                className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2"
                style={{
                    paddingBottom: `max(8px, var(--safe-bottom, 0px), calc(var(--keyboard-height, 0px) + 8px))`,
                }}
            >
                <MessageInput
                    value={content}
                    onChange={setContent}
                    onSend={handleSend}
                    onKeyDown={handleKeyDown}
                    inputRef={inputRef}
                    placeholder={t('chat.thread.inputPlaceholder')}
                />
            </div>

            <MessageDetailDialog message={expandedMessage} onClose={() => setExpandedMessage(null)} />

            <MessageActionSheet
                open={!!actionMessage && !pickerOpen}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                canReact={canReact}
                canReply={false}
                isCopying={isCopying}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setPickerOpen(true)}
                onCopy={() => void handleCopy()}
                onReply={() => undefined}
            />
            <ReactionDetailSheet
                open={!!reactorTarget}
                onOpenChange={open => !open && setReactorTarget(null)}
                tallies={(reactorTarget && reactions.get(reactorTarget.messageId)) || []}
                initialKey={reactorTarget?.key}
                nameOf={nameOfUser}
                avatarOf={avatarOfUser}
            />
            <EmojiPickerSheet
                open={pickerOpen}
                onOpenChange={open => {
                    setPickerOpen(open);
                    if (!open) setActionMessage(null);
                }}
                onPick={handlePickEmoji}
            />
        </div>
    );
};
