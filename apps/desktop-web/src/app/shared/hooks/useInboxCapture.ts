import { logger } from '@chatic/bridges';
import { runtime, RELAY_CLOUD_ID, type DomainChat } from '@chatic/runtime';

import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import {
    bareChannelName,
    chatSenderName,
    inboxKindFor,
    isNotifiableChat,
    isOwnChat,
    mentionKind,
    messagePlainText,
    messagePreview,
    resolveMyMentionNames,
    type InboxKind,
} from '../utils';
import { inboxItemId, isNotifyDm, truncateMentionPreview, useMentionsStore, useReadCursorStore } from '../stores';

type Viewer = { uid: string | null; name: string; cloudUid: string | null };

const chatAuthorId = (chat: Pick<DomainChat, 'owner$' | 'ownerId'>): string | undefined =>
    chat.owner$?.id ?? chat.ownerId;

const viewerIn = (channel: ChannelChatFeed['channel']): Viewer => ({
    uid: runtime.session.getGlobalSessionContext().identity.userId,
    name: '',
    cloudUid: channel.$join?.userId ?? null,
});

const isMine = (chat: Pick<DomainChat, 'owner$' | 'ownerId' | 'stereo'>, viewer: Viewer): boolean =>
    isOwnChat({ ownerId: chatAuthorId(chat), stereo: chat.stereo }, viewer);

const isRead = (channelId: string, chatNo: number | undefined): boolean =>
    (chatNo ?? 0) <= (useReadCursorStore.getState().cursors[channelId] ?? 0);

const arrivalKind = ({ channel, chat }: ChannelChatFeed, content: string): InboxKind | null => {
    const viewer = viewerIn(channel);
    return inboxKindFor({
        isReaction: false,
        isDm: isNotifyDm(channel),
        mention: mentionKind(chat, [viewer.uid, viewer.cloudUid], content, resolveMyMentionNames()),
    });
};

const whereOf = (channel: ChannelChatFeed['channel']): { inDm?: true; channelName?: string } =>
    isNotifyDm(channel) ? { inDm: true } : { channelName: bareChannelName(channel.name) || undefined };

const cloudOf = (channel: ChannelChatFeed['channel']): string => channel.cid || RELAY_CLOUD_ID;

const addMessage = ({ placeId, channel, chat }: ChannelChatFeed, kind: InboxKind, content: string): void => {
    if (!chat.id || !channel.id) return;
    const authorId = chatAuthorId(chat);
    const cloudId = cloudOf(channel);
    useMentionsStore.getState().add({
        id: inboxItemId(cloudId, chat.id),
        cloudId,
        kind,
        channelId: channel.id,
        ...whereOf(channel),
        chatNo: chat.chatNo,
        content: truncateMentionPreview(content),
        ownerName: chatSenderName(chat, placeId),
        ownerId: authorId,
        colorSeed: authorId,
        placeId,
        parentId: chat.parentId,
        createdAt: chat.createdAt ?? Date.now(),
    });
};

const captureReaction = async ({ placeId, channel, chat }: ChannelChatFeed): Promise<void> => {
    const reaction = chat.reaction$;
    const authorId = chatAuthorId(chat);
    if (!reaction?.chatId || !reaction.emoji || reaction.action === 'off' || !authorId || !channel.id) return;
    const viewer = viewerIn(channel);
    if (isMine(chat, viewer) || isRead(channel.id, chat.chatNo)) return;
    const cloudId = cloudOf(channel);
    const target = await runtime.data.getCloudRepositories(cloudId).chat.cacheRead(reaction.chatId);
    if (!target || !isMine(target, viewer)) return;
    useMentionsStore.getState().add({
        id: inboxItemId(cloudId, `reaction:${reaction.chatId}:${reaction.emoji}:${authorId}`),
        cloudId,
        kind: 'reaction',
        emoji: reaction.emoji,
        channelId: channel.id,
        ...whereOf(channel),
        chatNo: chat.chatNo,
        content: truncateMentionPreview(messagePreview(target)),
        ownerName: chatSenderName(chat, placeId),
        ownerId: authorId,
        colorSeed: authorId,
        placeId,
        parentId: target.parentId,
        createdAt: chat.createdAt ?? Date.now(),
    });
};

export const captureInboxReply = (feed: ChannelChatFeed): void => {
    const { channel, chat } = feed;
    try {
        if (!channel.id || !isNotifiableChat(chat) || isMine(chat, viewerIn(channel))) return;
        if (isRead(channel.id, chat.chatNo)) return;
        if (arrivalKind(feed, messagePlainText(chat.content))) return;
        addMessage(feed, 'reply', messagePreview(chat));
    } catch (error) {
        logger.warn('CHAT', '[InboxCapture] reply capture failed', {
            error,
            data: { channelId: channel.id, chatId: chat.id },
        });
    }
};

export const useInboxCapture = (): void => {
    useChannelChatFeeds((feed: ChannelChatFeed) => {
        const { channel, chat } = feed;
        if (chat.subType === 'reaction') {
            captureReaction(feed).catch(error => {
                logger.warn('CHAT', '[InboxCapture] reaction target unreadable', {
                    error,
                    data: { channelId: channel.id, chatId: chat.reaction$?.chatId },
                });
            });
            return;
        }
        const content = messagePlainText(chat.content);
        if (!isNotifiableChat(chat) || !channel.id) return;
        if (isMine(chat, viewerIn(channel)) || isRead(channel.id, chat.chatNo)) return;
        const kind = arrivalKind(feed, content);
        const preview = chat.hidden ? messagePreview(chat) : content || messagePreview(chat);
        if (kind && preview) addMessage(feed, kind, preview);
    });
};
