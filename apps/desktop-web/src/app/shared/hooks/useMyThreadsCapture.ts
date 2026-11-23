import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import {
    runtime,
    RELAY_CLOUD_ID,
    isEventChat,
    isInJoinWindow,
    type DomainChannel,
    type DomainChat,
} from '@chatic/runtime';

import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import { captureInboxReply } from './useInboxCapture';
import {
    cachedThreads,
    chatSenderName,
    isNotifiableChat,
    isOwnChat,
    messagePreview,
    myThreadKey,
    threadChannel,
    threadRootNo,
    type MessageViewer,
    type ThreadReply,
} from '../utils';
import { useMyThreadsStore, useNotificationsPanelStore } from '../stores';

const BACKFILL_PAGE = 200;

const viewerIn = (channel: Pick<DomainChannel, '$join'>): MessageViewer => ({
    uid: runtime.session.getGlobalSessionContext().identity.userId,
    name: '',
    cloudUid: channel.$join?.userId ?? null,
});

const isMineIn = (viewer: MessageViewer) => {
    return (chat: Pick<DomainChat, 'owner$' | 'ownerId' | 'stereo'>): boolean =>
        isOwnChat({ ownerId: chat.owner$?.id ?? chat.ownerId, stereo: chat.stereo }, viewer);
};

export const useMyThreadsCapture = (): void => {
    const record = useMyThreadsStore(s => s.record);
    const backfill = useMyThreadsStore(s => s.backfill);
    const cloudId = runtime.session.useGlobalSession().cloud.cloudId || RELAY_CLOUD_ID;

    const setScanning = useNotificationsPanelStore(s => s.setScanning);

    useEffect(() => {
        if (useMyThreadsStore.getState().backfilled[cloudId]) return;
        let active = true;
        const { channel: channelRepository, chat: chatRepository } = runtime.data.getCloudRepositories(cloudId);
        setScanning(cloudId);
        const done = () => {
            if (useNotificationsPanelStore.getState().scanningCid === cloudId) setScanning(null);
        };
        void (async () => {
            const channels =
                (
                    await channelRepository.cacheReadList({}).catch(error => {
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
                        const viewer = viewerIn(channel);
                        const page = await chatRepository.cacheReadList({
                            channelId: channel.id,
                            limit: BACKFILL_PAGE,
                        });
                        const joinedNo = channel.$join?.joinedNo;
                        const rows = (page?.list ?? []).filter(row => isInJoinWindow(row, joinedNo));
                        return cachedThreads(
                            rows,
                            isMineIn(viewer),
                            {
                                cid: cloudId,
                                channelId: channel.id,
                                placeId: channel.sid,
                                ...threadChannel(channel),
                            },
                            viewer
                        );
                    } catch (error) {
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
    const pending = useRef(new Map<string, ThreadReply | null>());
    const foreign = useRef(new Set<string>());

    const readRoot = async (cid: string, rootId: string): Promise<DomainChat | null> => {
        const { chat } = runtime.data.getCloudRepositories(cid);
        return (await chat.cacheRead(rootId)) ?? (await chat.getChat({ id: rootId }));
    };

    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        if (!chat.parentId || !channel.id || isEventChat(chat) || !isNotifiableChat(chat)) return;

        const cid = channel.cid || RELAY_CLOUD_ID;
        const rootNo = threadRootNo(chat.parentId);
        const key = myThreadKey(cid, channel.id, rootNo);
        if (!isInJoinWindow({ chatNo: Number(rootNo) }, channel.$join?.joinedNo)) return;
        const viewer = viewerIn(channel);
        const isMine = isMineIn(viewer);
        const reply: ThreadReply = {
            cid,
            channelId: channel.id,
            placeId,
            ...threadChannel(channel),
            rootNo,
            replyNo: chat.chatNo ?? 0,
            preview: messagePreview(chat),
            ownerName: chatSenderName(chat, placeId, viewer),
            at: chat.createdAt ?? Date.now(),
            mine: isMine(chat),
        };

        const feed = { placeId, channel, chat };
        if (useMyThreadsStore.getState().threads[key]) {
            record(reply);
            if (!reply.mine) captureInboxReply(feed);
            return;
        }
        if (pending.current.has(key)) {
            if (reply.mine) pending.current.set(key, reply);
            return;
        }
        if (foreign.current.has(key) && !reply.mine) return;
        foreign.current.delete(key);
        pending.current.set(key, reply.mine ? reply : null);
        readRoot(cid, `${channel.id}:${rootNo}`)
            .then(root => {
                if (!root) return;
                const myLaterReply = pending.current.get(key) ?? null;
                if (!myLaterReply && !isMine(root)) {
                    foreign.current.add(key);
                    return;
                }
                const threadRoot = {
                    preview: messagePreview(root),
                    ownerName: chatSenderName(root, placeId, viewer),
                };
                record(reply, { root: threadRoot });
                if (myLaterReply && myLaterReply !== reply) record(myLaterReply, { root: threadRoot });
                if (!reply.mine) captureInboxReply(feed);
            })
            .catch(error => {
                logger.warn('CHAT', '[MyThreadsCapture] thread capture failed', { error, data: { key } });
            })
            .finally(() => pending.current.delete(key));
    });
};
