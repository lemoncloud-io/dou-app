import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID, type DomainChat } from '@chatic/data';

import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import {
    inboxKindFor,
    isNotifiableChat,
    isOwnChat,
    mentionKind,
    messagePlainText,
    messagePreview,
    resolveMyMentionNames,
    type InboxKind,
} from '../utils';
import { isNotifyDm, truncateMentionPreview, useMentionsStore, useReadCursorStore } from '../stores';

type Viewer = { uid: string | null; name: string; cloudUid: string | null };

const chatAuthorId = (chat: Pick<DomainChat, 'owner$' | 'ownerId'>): string | undefined =>
    chat.owner$?.id ?? chat.ownerId;

/**
 * The reader in a channel. Outside the relay a persisted message's owner is my per-channel cloud
 * user id, not my account id, so "mine" is both ids — the same rule the message list uses.
 */
const viewerIn = (channel: ChannelChatFeed['channel']): Viewer => ({
    uid: runtime.session.getGlobalSessionContext().identity.userId,
    name: '',
    cloudUid: channel.$join?.userId ?? null,
});

const isMine = (chat: Pick<DomainChat, 'owner$' | 'ownerId' | 'stereo'>, viewer: Viewer): boolean =>
    isOwnChat({ ownerId: chatAuthorId(chat), stereo: chat.stereo }, viewer);

/** Already read in the channel — on this device or, through the synced cursor, another. */
const isRead = (channelId: string, chatNo: number | undefined): boolean =>
    (chatNo ?? 0) <= (useReadCursorStore.getState().cursors[channelId] ?? 0);

/** The kind a person's message gets as it arrives: a 1:1 message, else a mention of me, else none. */
const arrivalKind = ({ channel, chat }: ChannelChatFeed, content: string): InboxKind | null => {
    const viewer = viewerIn(channel);
    return inboxKindFor({
        isReaction: false,
        isDm: isNotifyDm(channel),
        mention: mentionKind(chat, [viewer.uid, viewer.cloudUid], content, resolveMyMentionNames()),
    });
};

const addMessage = ({ placeId, channel, chat }: ChannelChatFeed, kind: InboxKind, content: string): void => {
    // An id is the dedupe key of the inbox; a row without one cannot be stored.
    if (!chat.id || !channel.id) return;
    const authorId = chatAuthorId(chat);
    useMentionsStore.getState().add({
        id: chat.id,
        kind,
        channelId: channel.id,
        chatNo: chat.chatNo,
        content: truncateMentionPreview(content),
        ownerName: chat.owner$?.name ?? '',
        ownerId: authorId,
        // owner$ carries no avatar; key the fallback color off the author id.
        colorSeed: authorId,
        placeId,
        // Thread reply → server-normalised root chatNo string; opens the thread panel. Absent on top-level messages.
        parentId: chat.parentId,
        // Dated by when it was sent, not when this device saw it.
        createdAt: chat.createdAt ?? Date.now(),
    });
};

/**
 * A reaction to a message of mine. The reaction event carries its target as `reaction$.chatId` and
 * nothing of the message itself, so the target is read from this device's cache — never fetched: a
 * target this device has not cached is left out rather than costing a server call per reaction.
 *
 * The item is keyed by target, emoji and person, since the event's own id changes with every
 * toggle; a reaction taken back (`action: 'off'`) adds nothing.
 */
const captureReaction = async ({ placeId, channel, chat }: ChannelChatFeed): Promise<void> => {
    const reaction = chat.reaction$;
    const authorId = chatAuthorId(chat);
    if (!reaction?.chatId || !reaction.emoji || reaction.action === 'off' || !authorId || !channel.id) return;
    const viewer = viewerIn(channel);
    if (isMine(chat, viewer) || isRead(channel.id, chat.chatNo)) return;
    const target = await runtime.data
        .getCloudRepositories(channel.cid || RELAY_CLOUD_ID)
        .chat.cacheRead(reaction.chatId);
    if (!target || !isMine(target, viewer)) return;
    useMentionsStore.getState().add({
        id: `reaction:${reaction.chatId}:${reaction.emoji}:${authorId}`,
        kind: 'reaction',
        emoji: reaction.emoji,
        channelId: channel.id,
        chatNo: chat.chatNo,
        content: truncateMentionPreview(messagePreview(target)),
        ownerName: chat.owner$?.name ?? '',
        ownerId: authorId,
        colorSeed: authorId,
        placeId,
        parentId: target.parentId,
        createdAt: chat.createdAt ?? Date.now(),
    });
};

/**
 * A reply someone else wrote in a thread of mine. `useMyThreadsCapture` decides that — it already
 * reads the thread's root — and hands each such reply here. A reply that is also a 1:1 message or
 * names me went in under that kind when it arrived, so it is not filed again.
 */
export const captureInboxReply = (feed: ChannelChatFeed): void => {
    const { channel, chat } = feed;
    // Called from the Threads capture, after it has recorded the thread: a failure here is the
    // inbox's alone, so it is caught and named as such rather than read as a thread failure.
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

/**
 * Capture what the reader should hear about into the device-local inbox: messages that mention
 * them, new 1:1 messages and reactions to their messages here, and replies in their threads through
 * `captureInboxReply`. Ordinary channel messages stay out. Browser-safe (no native gate), and
 * independent of notification mute and DND — a muted channel still records them (Slack parity).
 *
 * The shared feed (useChannelChatFeeds) hands over a channel's latest message whenever its
 * watermark advances: chat content streams only for the open room, so a background channel is seen
 * by its newest message and a burst collapses to the last one. Each message is classified once,
 * strongest reason first (`inboxKindFor`), and stored under its own id, so one message is one item.
 * Guards mirror the OS-notification hook so a resync can't spam the inbox: skip my own messages
 * and anything at or below the read cursor.
 */
export const useInboxCapture = (): void => {
    useChannelChatFeeds((feed: ChannelChatFeed) => {
        const { channel, chat } = feed;
        if (chat.subType === 'reaction') {
            captureReaction(feed).catch(error => {
                // Left out, like a target the cache does not hold; the next reaction asks again.
                logger.warn('CHAT', '[InboxCapture] reaction target unreadable', {
                    error,
                    data: { channelId: channel.id, chatId: chat.reaction$?.chatId },
                });
            });
            return;
        }
        // Flattened first: a Block Kit payload hides its text inside JSON, and a mention has to be read
        // from what the message says.
        const content = messagePlainText(chat.content);
        // The inbox only ever holds things people wrote: no join or leave events, whatever their text.
        if (!isNotifiableChat(chat) || !channel.id) return;
        if (isMine(chat, viewerIn(channel)) || isRead(channel.id, chat.chatNo)) return;
        const kind = arrivalKind(feed, content);
        // A photo or file sent on its own has no text; its stored line is the attachment label.
        const preview = content || messagePreview(chat);
        if (kind && preview) addMessage(feed, kind, preview);
    });
};
