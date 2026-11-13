import { useEffect, useRef } from 'react';
import * as i18next from 'i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import {
    RELAY_CLOUD_ID,
    isEventChat,
    isMentioningViewer,
    isNotifiableChat,
    type DomainChannel,
    type DomainChat,
    type DomainJoin,
} from '@chatic/data';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { readCursorOf, readPositionOf } from '../../../utils/countUnread';
import { lastChatPreview } from '../../channels/utils/lastChatPreview';
import { useNotificationStore, useThreadParticipationStore } from '../../../stores/useNotificationStore';
import { classifyMessage, keepsMentionsOnly, type ThreadRelation } from '../utils/classify';
import {
    notificationId,
    reactionNotificationId,
    threadKey,
    threadRootNo,
    truncatePreview,
    type NotificationItem,
} from '../../../utils/notifications';
import { useCurrentPlaceChatFeed, type PlaceChatFeed } from './useCurrentPlaceChatFeed';

type ChatLike = Pick<DomainChat, 'owner$' | 'ownerId' | 'stereo'>;

/** What capture reads about the reader, refreshed every render and read when a message lands. */
interface ReaderContext {
    accountUid: string | null | undefined;
    cloudUid: string | null | undefined;
    myJoins: Map<string, DomainJoin>;
}

const authorOf = (chat: ChatLike): string | undefined => chat.owner$?.id ?? chat.ownerId;

/**
 * Every id the reader is known by in a room: the account id, the account's id in this cloud, and the
 * member id the room's join row holds. A persisted message's owner is the member id outside the
 * relay, an optimistic one the account id, so "mine" is any of them.
 */
const viewerIdsIn = (channel: DomainChannel, join: DomainJoin | undefined, reader: ReaderContext): string[] =>
    [reader.accountUid, reader.cloudUid, join?.userId, channel.$join?.userId].filter((id): id is string => !!id);

/** Whether a message is the reader's. A webhook never is, whatever owner id it was stamped with. */
const isMineFor =
    (viewerIds: readonly string[]) =>
    (chat: ChatLike): boolean => {
        const author = authorOf(chat);
        return chat.stereo !== 'webhook' && !!author && viewerIds.includes(author);
    };

const translate = (key: string, options?: Record<string, unknown>): string => i18next.t(key, options);

/**
 * A message as the one line the inbox keeps: its text, or what it carries when it has none, or the
 * deleted-message phrase — the line the home row would print, without the thread mark (an item says
 * it is in a thread by its kind).
 */
const previewOf = (
    chat: Pick<DomainChat, 'content' | 'hidden' | 'uploadIds'> & { upload$$?: DomainChat['upload$$'] }
): string => truncatePreview(lastChatPreview({ ...chat, parentId: undefined }, translate));

/** Where an item happened, kept with it: a 1:1 is named by its person, so it keeps no room name. */
const roomOf = (channel: DomainChannel): Pick<NotificationItem, 'inDm' | 'channelName'> =>
    channel.stereo === 'dm'
        ? { inDm: true }
        : { channelName: (channel.name ?? '').replace(/^#+/, '').trim() || undefined };

/** A thread's root message: from this device's cache, else from the server. */
const readRoot = async (cloudId: string, rootId: string): Promise<DomainChat | null> => {
    const { chat } = runtime.data.getCloudRepositories(cloudId);
    return (await chat.cacheRead(rootId)) ?? (await chat.getChat({ id: rootId }));
};

/**
 * Captures what the reader should hear about into the device-local inbox, from the rooms of the
 * current cloud's current place (`useCurrentPlaceChatFeed`): mentions of them, replies in threads
 * they are part of, reactions to their messages, and new 1:1 messages. Mounted once for the app.
 *
 * Left out: the reader's own messages, join and leave events, anything at or below the room's read
 * cursor (already read — here or on another device), and in a room whose notifications are off or
 * down to mentions, everything but mentions.
 *
 * Two lookups, both kept small:
 * - A reaction's target is read from this device's cache only. A target the cache does not hold is
 *   left out rather than costing a server call per reaction.
 * - A thread reply that does not mention the reader needs to know whose thread it is. The thread
 *   record (`useThreadParticipationStore`) answers for threads already known; otherwise the root is
 *   read, cache first and the server after, once per thread — a thread found to be someone else's
 *   is remembered for the session, until a reply of the reader's lands in it.
 */
export const useNotificationCapture = (): void => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId || RELAY_CLOUD_ID;
    const { userId: accountUid } = runtime.session.useSessionIdentity();
    const cloudUid = runtime.session.useUidInCloud(cloudId);
    const { myJoins } = useActiveCloudData();

    const readerRef = useRef<ReaderContext>({ accountUid, cloudUid, myJoins });
    readerRef.current = { accountUid, cloudUid, myJoins };

    // Roots being read, so a burst of replies in one thread reads it once.
    const pendingRoots = useRef(new Map<string, Promise<DomainChat | null>>());
    // Threads found to be someone else's, that the reader has not replied in. Whose they are depends on
    // who is reading, so another account starts with none.
    const foreignThreads = useRef(new Set<string>());
    useEffect(() => foreignThreads.current.clear(), [accountUid]);

    const readRootOnce = (cid: string, key: string, rootId: string): Promise<DomainChat | null> => {
        const pending = pendingRoots.current.get(key);
        if (pending) return pending;
        const read = readRoot(cid, rootId)
            .catch(error => {
                // Not remembered as someone else's: the next reply asks again.
                logger.warn('chat.notification_root_unreadable', 'Notification capture could not read a thread root', {
                    error,
                    data: { key },
                });
                return null;
            })
            .finally(() => pendingRoots.current.delete(key));
        pendingRoots.current.set(key, read);
        return read;
    };

    /** How the reader stands to a thread, and its root as a quote when that is known. */
    const relationTo = async (
        cid: string,
        channel: DomainChannel,
        rootNo: string,
        isMine: (chat: ChatLike) => boolean,
        at: number
    ): Promise<{ relation: ThreadRelation; quote?: string }> => {
        const key = threadKey(cid, channel.id, rootNo);
        const known = useThreadParticipationStore.getState().threads[key];
        if (known?.rootMine !== undefined) {
            return { relation: known.rootMine ? 'rootMine' : 'participated', quote: known.rootPreview };
        }
        if (!known && foreignThreads.current.has(key)) return { relation: 'none' };
        const root = await readRootOnce(cid, key, `${channel.id}:${rootNo}`);
        if (!root) return { relation: 'none' };
        const rootMine = isMine(root);
        const rootPreview = previewOf(root);
        // Read again after the wait: a reply of mine may have landed in the thread meanwhile.
        const participated = !!useThreadParticipationStore.getState().threads[key];
        if (!rootMine && !participated) {
            foreignThreads.current.add(key);
            return { relation: 'none' };
        }
        useThreadParticipationStore.getState().remember(key, { rootMine, rootPreview }, at);
        return { relation: rootMine ? 'rootMine' : 'participated', quote: rootPreview };
    };

    const captureReaction = async (
        { cloudId: cid, placeId, channel, chat }: PlaceChatFeed,
        isMine: (chat: ChatLike) => boolean,
        isRead: (chatNo?: number) => boolean,
        mentionsOnly: boolean
    ): Promise<void> => {
        const reaction = chat.reaction$;
        const authorId = authorOf(chat);
        if (!reaction?.chatId || !reaction.emoji || reaction.action === 'off' || !authorId) return;
        if (mentionsOnly || isMine(chat) || isRead(chat.chatNo)) return;
        const target = await runtime.data.getCloudRepositories(cid).chat.cacheRead(reaction.chatId);
        if (!target || !isMine(target)) return;
        useNotificationStore.getState().add({
            id: reactionNotificationId(cid, reaction.chatId, reaction.emoji, authorId),
            cloudId: cid,
            placeId,
            channelId: channel.id,
            ...roomOf(channel),
            chatNo: chat.chatNo,
            targetChatNo: target.chatNo,
            parentId: target.parentId ? threadRootNo(target.parentId) : undefined,
            kind: 'reaction',
            emoji: reaction.emoji,
            ownerId: authorId,
            ownerName: chat.owner$?.name ?? '',
            content: reaction.emoji,
            quote: previewOf(target),
            createdAt: chat.createdAt ?? Date.now(),
            read: false,
        });
    };

    const captureMessage = async (
        { cloudId: cid, placeId, channel, chat }: PlaceChatFeed,
        viewerIds: readonly string[],
        isMine: (chat: ChatLike) => boolean,
        isRead: (chatNo?: number) => boolean,
        mentionsOnly: boolean
    ): Promise<void> => {
        // Only what people wrote: no join or leave events, no edit notices.
        if (!chat.id || isEventChat(chat) || !isNotifiableChat(chat)) return;
        const at = chat.createdAt ?? Date.now();
        const rootNo = chat.parentId ? threadRootNo(chat.parentId) : undefined;
        if (rootNo && isMine(chat)) {
            // A reply of mine makes the thread one I take part in, whoever wrote its root.
            const key = threadKey(cid, channel.id, rootNo);
            foreignThreads.current.delete(key);
            useThreadParticipationStore.getState().remember(key, {}, at);
            return;
        }
        if (isMine(chat) || isRead(chat.chatNo)) return;

        const mentionsMe = isMentioningViewer(chat, viewerIds);
        const isDm = channel.stereo === 'dm';
        // A mention needs no root, and a room down to mentions keeps nothing else.
        const thread =
            rootNo && !mentionsMe && !mentionsOnly
                ? await relationTo(cid, channel, rootNo, isMine, at)
                : { relation: 'none' as const };
        const kind = classifyMessage({
            isThreadReply: !!rootNo,
            mentionsMe,
            isDm,
            thread: thread.relation,
            mentionsOnly,
        });
        if (!kind) return;
        const content = previewOf(chat);
        if (!content) return;
        useNotificationStore.getState().add({
            id: notificationId(cid, chat.id),
            cloudId: cid,
            placeId,
            channelId: channel.id,
            ...roomOf(channel),
            chatNo: chat.chatNo,
            parentId: rootNo,
            kind,
            ownerId: authorOf(chat),
            ownerName: chat.owner$?.name ?? '',
            content,
            quote: kind === 'replyToMine' || kind === 'participatedThread' ? thread.quote : undefined,
            createdAt: at,
            read: false,
        });
    };

    useCurrentPlaceChatFeed(feed => {
        const { channel, chat } = feed;
        const reader = readerRef.current;
        const join = reader.myJoins.get(channel.id);
        const viewerIds = viewerIdsIn(channel, join, reader);
        const isMine = isMineFor(viewerIds);
        const cursor = readCursorOf(readPositionOf(join, channel.$join)) ?? 0;
        const isRead = (chatNo?: number): boolean => (chatNo ?? 0) <= cursor;
        const mentionsOnly = keepsMentionsOnly(join?.notify ?? channel.$join?.notify, channel.stereo === 'dm');

        const capture =
            chat.subType === 'reaction'
                ? captureReaction(feed, isMine, isRead, mentionsOnly)
                : captureMessage(feed, viewerIds, isMine, isRead, mentionsOnly);
        capture.catch(error => {
            // One message left out; the next one is captured as usual.
            logger.warn('chat.notification_capture_failed', 'Notification capture left a message out', {
                error,
                data: { channelId: channel.id, chatId: chat.id },
            });
        });
    });
};
