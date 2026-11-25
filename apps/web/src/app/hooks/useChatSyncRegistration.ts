import { useEffect, useRef } from 'react';

import { runtime, type DomainChannel, type IChatRepository } from '@chatic/runtime-react';

import {
    CATCH_UP_LIMIT,
    CATCH_UP_OLDER_CONCURRENCY,
    catchUpChannel,
    createPageGate,
    type PageGate,
} from './chatCatchUp';
import { readSelectedCloudId, useSelectedCloudId } from './useCloudScope';

export const readLastNos = (
    repository: Pick<IChatRepository, 'observeLastList'>,
    channelIds: string[]
): Promise<Map<string, number>> =>
    new Promise(resolve => {
        let answered = false;
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            unsubscribe();
        };
        const unsubscribe = repository.observeLastList(channelIds, rows => {
            if (answered) return;
            answered = true;
            resolve(new Map(rows.map(row => [row.channelId, row.lastNo])));
            queueMicrotask(close);
        });
        if (answered) close();
    });

export const useChatSyncRegistration = (
    channels: DomainChannel[],
    { enabled = true }: { enabled?: boolean } = {}
): void => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const cid = useSelectedCloudId();
    const cloudVerified = runtime.connection.useCloudVerified(cid);
    const uid = runtime.session.useUidInCloud(cid);
    const uidRef = useRef(uid);
    uidRef.current = uid;
    const channelsRef = useRef(channels);
    channelsRef.current = channels;
    const olderGateRef = useRef<PageGate | null>(null);
    olderGateRef.current ??= createPageGate(CATCH_UP_OLDER_CONCURRENCY);

    const channelKey = [...channels.map(channel => channel.id).filter(Boolean)].sort().join(',');
    const headKey = channels
        .filter(channel => !!channel.id)
        .map(channel => `${channel.id}:${channel.chatNo ?? 0}`)
        .sort()
        .join(',');

    useEffect(() => {
        if (!enabled || !cloudVerified || !channelKey) return;
        const disposers = channelKey
            .split(',')
            .map(id => runtime.sync.registerSyncTarget({ type: 'chat', id }, { cid }));
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, enabled, cloudVerified, cid, uid]);

    const checkedNoRef = useRef(new Map<string, number>());
    const requestedNoRef = useRef(new Map<string, number>());

    useEffect(() => {
        checkedNoRef.current.clear();
        requestedNoRef.current.clear();
    }, [cid, uid]);

    useEffect(() => {
        if (!enabled || !cloudVerified || !isVerified || !headKey) return;
        const checked = checkedNoRef.current;
        const due = channelsRef.current.flatMap(channel => {
            const id = channel.id;
            const head = channel.chatNo ?? 0;
            if (!id) return [];
            const last = checked.get(id);
            return last !== undefined && head <= last ? [] : [{ id, head }];
        });
        if (due.length === 0) return;
        for (const { id, head } of due) checked.set(id, head);
        const readCid = readSelectedCloudId();

        const startCatchUp = (channelId: string, knownNo: number) => {
            const walkUid = uidRef.current;
            const gate = olderGateRef.current as PageGate;
            const { chat } = runtime.data.getCloudRepositories(readCid);
            void catchUpChannel({
                knownNo,
                fetchNewest: () => chat.refreshList({ channelId, limit: CATCH_UP_LIMIT }),
                fetchOlder: (cursorNo, limit) =>
                    gate(() => chat.refreshList({ channelId, cursorNo, limit }, { cursorIsRow: true })),
                shouldContinue: () => readSelectedCloudId() === readCid && uidRef.current === walkUid,
            }).catch(() => undefined);
        };

        void readLastNos(
            chatRepository,
            due.map(({ id }) => id)
        ).then(lastNos => {
            if (readCid !== cid || readSelectedCloudId() !== readCid) {
                for (const { id, head } of due) if (checked.get(id) === head) checked.delete(id);
                return;
            }
            for (const { id, head } of due) {
                const known = lastNos.get(id);
                if (known !== undefined) {
                    runtime.sync.updateSyncSnapshot({ type: 'chat', id }, { id, lastNo: known }, { cid: readCid });
                }
                const knownNo = known ?? 0;
                if (head <= knownNo || head <= (requestedNoRef.current.get(id) ?? 0)) continue;
                requestedNoRef.current.set(id, head);
                startCatchUp(id, knownNo);
            }
        });
    }, [headKey, enabled, cloudVerified, isVerified, cid, chatRepository]);
};
