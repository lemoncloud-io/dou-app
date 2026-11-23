import { useEffect, useRef } from 'react';
import * as i18next from 'i18next';

import { logger } from '@chatic/bridges';
import { runtime, type DomainChannel, type DomainChat, type DomainJoin } from '@chatic/runtime';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { createPageGate } from '../../../hooks/chatCatchUp';
import { readCursorOf, readPositionOf } from '../../../utils/countUnread';
import { lastChatPreview } from '../../channels/utils/lastChatPreview';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import { NOTIFICATION_RETENTION_MS, truncatePreview } from '../../../utils/notifications';
import { keepsMentionsOnly } from '../utils/classify';
import { roomNotifications } from '../utils/roomNotifications';
import { useCurrentPlaceRooms, type PlaceRoom } from './useCurrentPlaceRooms';

export const NOTIFICATION_ROOM_ROWS = 200;

export const NOTIFICATION_ROOT_READS = 3;

const translate = (key: string, options?: Record<string, unknown>): string => i18next.t(key, options);

const previewOf = (chat: DomainChat): string =>
    truncatePreview(lastChatPreview({ ...chat, parentId: undefined }, translate));

const viewerIdsIn = (
    channel: DomainChannel,
    join: DomainJoin | undefined,
    accountUid: string | null | undefined,
    cloudUid: string | null | undefined
): string[] => [accountUid, cloudUid, join?.userId, channel.$join?.userId].filter((id): id is string => !!id);

interface RoomRun {
    rows: readonly DomainChat[];
    signature: string;
}

export const useNotificationFeed = (): void => {
    const { cloudId, rooms } = useCurrentPlaceRooms();
    const { chat } = runtime.data.useRuntimeRepositories();
    const { userId: accountUid } = runtime.session.useSessionIdentity();
    const cloudUid = runtime.session.useUidInCloud(cloudId);
    const { myJoins } = useActiveCloudData();

    const chatRef = useRef(chat);
    chatRef.current = chat;
    const roomsRef = useRef(new Map<string, PlaceRoom>());
    roomsRef.current = new Map(rooms.map(room => [room.channel.id, room]));
    const readerRef = useRef({ accountUid, cloudUid, myJoins });
    readerRef.current = { accountUid, cloudUid, myJoins };

    const rowsRef = useRef(new Map<string, readonly DomainChat[]>());
    const rootsRef = useRef(new Map<string, Map<string, DomainChat | null>>());
    const targetsRef = useRef(new Map<string, Map<string, DomainChat | null>>());
    const lastRunRef = useRef(new Map<string, RoomRun>());
    const askedRef = useRef(new Set<string>());
    const rootGateRef = useRef(createPageGate(NOTIFICATION_ROOT_READS));
    const cloudRef = useRef(cloudId);

    const mapOf = (store: Map<string, Map<string, DomainChat | null>>, channelId: string) => {
        let map = store.get(channelId);
        if (!map) store.set(channelId, (map = new Map()));
        return map;
    };

    const computeRoom = (channelId: string): void => {
        const room = roomsRef.current.get(channelId);
        const rows = rowsRef.current.get(channelId);
        if (!room || !rows) return;
        const { accountUid: account, cloudUid: inCloud, myJoins: joins } = readerRef.current;
        const { channel, placeId } = room;
        const join = joins.get(channelId);
        const viewerIds = viewerIdsIn(channel, join, account, inCloud);
        const readCursor = readCursorOf(readPositionOf(join, channel.$join)) ?? 0;
        const mentionsOnly = keepsMentionsOnly(join?.notify ?? channel.$join?.notify, channel.stereo === 'dm');
        const roots = mapOf(rootsRef.current, channelId);
        const targets = mapOf(targetsRef.current, channelId);

        const signature = [
            viewerIds.join(','),
            readCursor,
            mentionsOnly,
            channel.name ?? '',
            channel.stereo ?? '',
            placeId ?? '',
            roots.size,
            targets.size,
        ].join('|');
        const last = lastRunRef.current.get(channelId);
        if (last && last.rows === rows && last.signature === signature) return;
        lastRunRef.current.set(channelId, { rows, signature });

        const result = roomNotifications({
            cloudId: cloudRef.current,
            placeId,
            channel,
            rows,
            viewerIds,
            readCursor,
            mentionsOnly,
            since: Date.now() - NOTIFICATION_RETENTION_MS,
            roots,
            targets,
            preview: previewOf,
        });
        useNotificationStore.getState().setRoomItems(cloudRef.current, channelId, result.items);

        const forCloud = cloudRef.current;
        for (const rootNo of result.missingRoots) {
            const askKey = `${forCloud}:${channelId}:root:${rootNo}`;
            if (askedRef.current.has(askKey)) continue;
            askedRef.current.add(askKey);
            const rootId = `${channelId}:${rootNo}`;
            void rootGateRef
                .current(async () => {
                    if (cloudRef.current !== forCloud) return null;
                    const cached = await chatRef.current.cacheRead(rootId);
                    return cached ?? (await runtime.data.getCloudRepositories(forCloud).chat.getChat({ id: rootId }));
                })
                .catch(error => {
                    logger.warn('chat.notification_root_unreadable', 'The inbox could not read a thread root', {
                        error,
                        data: { channelId, rootNo },
                    });
                    return null;
                })
                .then(root => {
                    if (cloudRef.current !== forCloud) return;
                    roots.set(rootNo, root ?? null);
                    computeRoom(channelId);
                });
        }
        for (const targetId of result.missingTargets) {
            const askKey = `${forCloud}:${channelId}:target:${targetId}`;
            if (askedRef.current.has(askKey)) continue;
            askedRef.current.add(askKey);
            void chatRef.current
                .cacheRead(targetId)
                .catch(() => null)
                .then(target => {
                    if (cloudRef.current !== forCloud) return;
                    targets.set(targetId, target ?? null);
                    computeRoom(channelId);
                });
        }
    };
    const computeRoomRef = useRef(computeRoom);
    computeRoomRef.current = computeRoom;

    useEffect(() => {
        cloudRef.current = cloudId;
        rowsRef.current.clear();
        rootsRef.current.clear();
        targetsRef.current.clear();
        lastRunRef.current.clear();
        askedRef.current.clear();
    }, [cloudId, cloudUid, accountUid]);

    const channelKey = rooms
        .map(room => room.channel.id)
        .sort()
        .join(',');

    useEffect(() => {
        const ids = channelKey ? channelKey.split(',') : [];
        useNotificationStore.getState().retainRooms(cloudId, new Set(ids));
        for (const id of [...rowsRef.current.keys()]) {
            if (ids.includes(id)) continue;
            rowsRef.current.delete(id);
            lastRunRef.current.delete(id);
        }
        const unsubscribes = ids.map(id =>
            chatRef.current.observeList(
                { channelId: id, limit: NOTIFICATION_ROOM_ROWS, includeUnsent: true },
                result => {
                    rowsRef.current.set(id, result?.list ?? []);
                    computeRoomRef.current(id);
                }
            )
        );
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }, [channelKey, cloudId, cloudUid, accountUid]);

    useEffect(() => {
        for (const id of rowsRef.current.keys()) computeRoomRef.current(id);
    }, [rooms, myJoins, accountUid, cloudUid]);
};
