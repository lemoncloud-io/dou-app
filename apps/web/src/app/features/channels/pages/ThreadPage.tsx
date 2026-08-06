import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useSessionIdentity } from '@chatic/web-core';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { ChatRoomHeader, MessageInput } from '@chatic/web-ui-kit';

import { ChannelMessageRow } from '../components/ChannelMessageRow';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import { useChannel, useChannelMembers, useChannelProfiles, useChatMutations, useChats, useReactions } from '../hooks';
import type { ClientChatView, DomainChat } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { buildThread } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { useRecentEmojiStore } from '../../../stores/useRecentEmojiStore';
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
    const stableChannelId = channelId || 'default';

    const [content, setContent] = useState('');
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [isCopying, setIsCopying] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const { headerRef, footerRef: composerRef, headerHeight, footerHeight: composerHeight } = useChromeInsets();

    const { userId } = useSessionIdentity();
    const { channel } = useChannel(channelId || null);
    const { members, activeMemberIds } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
    });
    const { profileMap } = useChannelProfiles(channel?.sid ?? null, activeMemberIds);

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

    // Same display-name precedence as the room: site-profile nick, then the member
    // user cache, then whatever the chat row itself embeds.
    const displayNameOf = useMemo(
        () => (chat: DomainChat) => {
            const ownerId = chat.ownerId ?? '';
            const profile = ownerId ? profileMap.get(ownerId) : undefined;
            const member = ownerId ? memberById.get(ownerId) : undefined;
            return profile?.nick ?? member?.nick ?? member?.name ?? chat.owner$?.name ?? ownerId;
        },
        [profileMap, memberById]
    );
    const nameOfUser = useMemo(
        () => (id: string) => profileMap.get(id)?.nick ?? memberById.get(id)?.nick ?? memberById.get(id)?.name ?? id,
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

    const root = thread.root ? toClientView(thread.root) : undefined;
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
        const text = actionMessage?.content ?? '';
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
            onExpand={() => undefined}
            onRetry={() => undefined}
            onDelete={() => undefined}
            reactions={message.id ? reactions.get(message.id) : undefined}
            onToggleReaction={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
            reactionFailed={!!message.id && failedId === message.id}
            nameOf={nameOfUser}
        />
    );

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                <ChatRoomHeader
                    kind="group"
                    title={t('chat.thread.title')}
                    onBack={() => navigate(-1)}
                    className="border-b border-border"
                />
            </div>

            <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-none"
                style={{ paddingTop: headerHeight + 8, paddingBottom: composerHeight + 16 }}
            >
                {isLoading ? (
                    <div className="flex min-h-full items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 px-0 py-2">
                        {root ? (
                            renderRow(root)
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
                        {replies.length > 0 && (
                            <div className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
                                <span className="whitespace-nowrap">
                                    {t('chat.thread.replyCount', { count: replies.length })}
                                </span>
                                <span className="h-px flex-1 bg-border" />
                            </div>
                        )}
                        {replies.map(renderRow)}
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
