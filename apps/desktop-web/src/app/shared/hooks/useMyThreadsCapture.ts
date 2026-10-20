import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID, isInJoinWindow, type DomainChannel, type DomainChat } from '@chatic/data';

import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import { captureInboxReply } from './useInboxCapture';
import {
    cachedThreads,
    isNotifiableChat,
    isOwnChat,
    messagePreview,
    myThreadKey,
    threadChannel,
    threadRootNo,
    type ThreadReply,
} from '../utils';
import { useMyThreadsPanelStore, useMyThreadsStore } from '../stores';

/** Newest cached messages read per channel on the first launch — enough for recent threads. */
const BACKFILL_PAGE = 200;

/** Whether a chat is the user's, by account id or by their cloud user id in that channel. */
const isMineIn = (channel: Pick<DomainChannel, '$join'>) => {
    const viewer = {
        uid: runtime.session.getGlobalSessionContext().identity.userId,
        name: '',
        cloudUid: channel.$join?.userId ?? null,
    };
    return (chat: Pick<DomainChat, 'owner$' | 'ownerId' | 'stereo'>): boolean =>
        isOwnChat({ ownerId: chat.owner$?.id ?? chat.ownerId, stereo: chat.stereo }, viewer);
};

/**
 * Feed thread replies from background channels into the device-local Threads list.
 *
 * Rides the same channel-watermark feed as the mentions inbox: chat content streams only for the open
 * room, so a background channel shows up as its newest message (`lastChat$`) and a burst of replies
 * collapses to the last one. A reply to a thread the list already holds updates it. Any other reply
 * needs its root to decide whether the user takes part — the root is read from the cache, else from
 * the server — and is added when the root or the reply is the user's. A root that is neither is
 * remembered for the session — until a reply of mine lands in it — so a busy thread of others is
 * looked up once, not on every reply.
 *
 * Once per cloud — the first launch with the list — the threads already in that cloud's chat cache are
 * read in as history (seen), so the list does not start empty. A cloud with no cached channels yet is
 * left for a later launch.
 */
export const useMyThreadsCapture = (): void => {
    const record = useMyThreadsStore(s => s.record);
    const backfill = useMyThreadsStore(s => s.backfill);
    const cloudId = runtime.session.useGlobalSession().cloud.cloudId || RELAY_CLOUD_ID;

    const setScanning = useMyThreadsPanelStore(s => s.setScanning);

    useEffect(() => {
        if (useMyThreadsStore.getState().backfilled[cloudId]) return;
        let active = true;
        const { channel: channelRepository, chat: chatRepository } = runtime.data.getCloudRepositories(cloudId);
        // Tells the pane its empty list is not the answer yet.
        setScanning(cloudId);
        const done = () => {
            if (useMyThreadsPanelStore.getState().scanningCid === cloudId) setScanning(null);
        };
        void (async () => {
            const channels =
                (
                    await channelRepository.cacheReadList({}).catch(error => {
                        // Left for the next launch, like an empty cache — but said, since this one may never read.
                        logger.warn('CHAT', '[MyThreadsCapture] channel list unreadable', {
                            error,
                            data: { cid: cloudId },
                        });
                        return null;
                    })
                )?.list ?? [];
            if (channels.length === 0) return;
            const found = await Promise.all(
                channels.map(async channel => {
                    if (!channel.id) return [];
                    try {
                        const page = await chatRepository.cacheReadList({
                            channelId: channel.id,
                            limit: BACKFILL_PAGE,
                        });
                        // Rows from an earlier membership outlive a leave in the cache; the room hides them, so must this.
                        const joinedNo = channel.$join?.joinedNo;
                        const rows = (page?.list ?? []).filter(row => isInJoinWindow(row, joinedNo));
                        return cachedThreads(rows, isMineIn(channel), {
                            cid: cloudId,
                            channelId: channel.id,
                            placeId: channel.sid,
                            ...threadChannel(channel),
                        });
                    } catch (error) {
                        // One unreadable channel leaves its threads out; the rest are still worth listing.
                        logger.warn('CHAT', '[MyThreadsCapture] backfill skipped a channel', {
                            error,
                            data: { channelId: channel.id },
                        });
                        return [];
                    }
                })
            );
            if (active) backfill(cloudId, found.flat());
        })().finally(done);
        return () => {
            active = false;
            done();
        };
    }, [cloudId, backfill, setScanning]);
    // Thread keys whose root is being read — holding my reply when one lands meanwhile — and those
    // found to be someone else's thread.
    const pending = useRef(new Map<string, ThreadReply | null>());
    const foreign = useRef(new Set<string>());

    // Every read names its cloud: the app graph follows the selection, so a cloud switch landing
    // mid-read would hand back another cloud's rows under colliding channel ids.
    const readRoot = async (cid: string, rootId: string): Promise<DomainChat | null> => {
        const { chat } = runtime.data.getCloudRepositories(cid);
        return (await chat.cacheRead(rootId)) ?? (await chat.getChat({ id: rootId }));
    };

    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        // A reaction is an event about another message (its target is `reaction$.chatId`), not a reply.
        if (!chat.parentId || !channel.id || chat.subType === 'reaction' || !isNotifiableChat(chat)) return;

        const cid = channel.cid || RELAY_CLOUD_ID;
        const rootNo = threadRootNo(chat.parentId);
        const key = myThreadKey(cid, channel.id, rootNo);
        // A root from before my current join is hidden in the room, so its thread is not listed either.
        if (!isInJoinWindow({ chatNo: Number(rootNo) }, channel.$join?.joinedNo)) return;
        // Outside the relay a persisted message's owner is my per-channel cloud user id, not my
        // account id, so "mine" is both ids — the same rule the message list uses.
        const isMine = isMineIn(channel);
        const reply: ThreadReply = {
            cid,
            channelId: channel.id,
            placeId,
            ...threadChannel(channel),
            rootNo,
            replyNo: chat.chatNo ?? 0,
            preview: messagePreview(chat),
            ownerName: chat.owner$?.name ?? '',
            at: chat.createdAt ?? Date.now(),
            mine: isMine(chat),
        };

        // Someone else's reply in a thread of mine is also news for the inbox.
        const feed = { placeId, channel, chat };
        if (useMyThreadsStore.getState().threads[key]) {
            record(reply);
            if (!reply.mine) captureInboxReply(feed);
            return;
        }
        if (pending.current.has(key)) {
            // My reply makes it my thread whoever wrote the root; the lookup's answer adds it, when it has one.
            if (reply.mine) pending.current.set(key, reply);
            return;
        }
        // Someone else's thread stays out until I reply in it — from another device, say.
        if (foreign.current.has(key) && !reply.mine) return;
        foreign.current.delete(key);
        pending.current.set(key, reply.mine ? reply : null);
        readRoot(cid, `${channel.id}:${rootNo}`)
            .then(root => {
                // No root to read: neither added nor remembered, so a later reply asks again.
                if (!root) return;
                const myLaterReply = pending.current.get(key) ?? null;
                if (!myLaterReply && !isMine(root)) {
                    foreign.current.add(key);
                    return;
                }
                const threadRoot = { preview: messagePreview(root), ownerName: root.owner$?.name ?? '' };
                record(reply, { root: threadRoot });
                if (myLaterReply && myLaterReply !== reply) record(myLaterReply, { root: threadRoot });
                // After the thread is recorded, so the list keeps the thread whatever the inbox does.
                if (!reply.mine) captureInboxReply(feed);
            })
            .catch(error => {
                // Not remembered as foreign: the next reply asks again, once the root may be readable.
                logger.warn('CHAT', '[MyThreadsCapture] thread capture failed', { error, data: { key } });
            })
            .finally(() => pending.current.delete(key));
    });
};
