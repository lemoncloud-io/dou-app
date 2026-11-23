import { useCallback } from 'react';

import { runtime, isInPlaceList, type DomainChannel } from '@chatic/runtime';

export const CHANNEL_WAIT_TIMEOUT_MS = 20_000;
const CHANNEL_WAIT_POLL_MS = 3_000;

export interface AwaitInviteChannelOptions {
    knownChannelIds?: Iterable<string>;
    timeoutMs?: number;
    pollMs?: number;
    signal?: AbortSignal;
}

export const useAwaitInviteChannel = () => {
    const { channel, syncMeta } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId: sid } = runtime.session.useSessionSelection();
    const uid = session.identity.userId ?? undefined;
    const cid = session.cloud?.cloudId && session.cloud.cloudId !== 'default' ? session.cloud.cloudId : 'default';

    const awaitChannel = useCallback(
        async ({
            knownChannelIds,
            timeoutMs = CHANNEL_WAIT_TIMEOUT_MS,
            pollMs = CHANNEL_WAIT_POLL_MS,
            signal,
        }: AwaitInviteChannelOptions = {}): Promise<string | null> => {
            if (!sid || signal?.aborted) return null;

            const known = new Set(knownChannelIds ?? []);
            if (!knownChannelIds) {
                const before = await channel.cacheReadList({ sid });
                for (const item of before?.list ?? []) if (item.id) known.add(item.id);
            }

            const findNewDm = (list: DomainChannel[]): string | undefined =>
                list.find(item => !!item.id && !known.has(item.id) && item.stereo === 'dm' && isInPlaceList(item, sid))
                    ?.id;

            return new Promise<string | null>(resolve => {
                let settled = false;
                let unsubscribe: (() => void) | null = null;
                const onAbort = () => finish(null);
                const finish = (channelId: string | null) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    clearInterval(ticker);
                    unsubscribe?.();
                    signal?.removeEventListener('abort', onAbort);
                    resolve(channelId);
                };
                signal?.addEventListener('abort', onAbort);

                const timer = setTimeout(() => finish(null), timeoutMs);

                const pull = async () => {
                    try {
                        const kind = `channel-sync:${cid}`;
                        const since = await syncMeta.getSyncedAt(kind);
                        const { syncedAt } = await channel.syncChannels(since);
                        await syncMeta.setSyncedAt(kind, syncedAt);
                    } catch {
                        // best-effort: a failed pull just means the next tick tries the same cursor
                    }
                };
                const ticker = setInterval(() => void pull(), pollMs);
                void pull();

                unsubscribe = channel.observeList(
                    { sid: '' },
                    result => {
                        const found = findNewDm(result?.list ?? []);
                        if (found) finish(found);
                    },
                    { cid, uid }
                );
                if (settled) {
                    unsubscribe();
                    unsubscribe = null;
                }
            });
        },
        [channel, syncMeta, cid, uid, sid]
    );

    return { awaitChannel };
};
