import { useCallback, useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime-react';

import { useAwaitInviteChannel, useRelayInviteMutations } from '../../../../hooks';

export const CHANNEL_PROBE_DELAYS_MS = [0, 1_500];

export const ROOM_PUSH_WAIT_MS = 5_000;

export type InviteChannelSource = 'response' | 'push' | 'probe' | 'list' | 'none';

interface JoinPush {
    channelId?: string;
    userId?: string;
}

export const isInviterJoinToNewRoom = (
    join: JoinPush | null | undefined,
    inviterId: string
): join is { channelId: string } =>
    !!join?.channelId && join.userId === inviterId && join.channelId.split('@').includes(inviterId);

export interface ResolveInviteChannelOptions {
    acceptedChannelId?: string;
    inviterId?: string;
    onResolved?: (source: InviteChannelSource) => void;
    probeDelaysMs?: number[];
    knownChannelIds?: Iterable<string>;
    timeoutMs?: number;
    pollMs?: number;
}

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => {
        setTimeout(resolve, ms);
    });

export const useResolveInviteChannel = () => {
    const { awaitChannel } = useAwaitInviteChannel();
    const { getInvite } = useRelayInviteMutations();

    const latest = useRef({ awaitChannel, getInvite });
    latest.current = { awaitChannel, getInvite };

    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const resolveChannel = useCallback(
        async (code: string, options: ResolveInviteChannelOptions = {}): Promise<string | null> => {
            const {
                acceptedChannelId,
                inviterId,
                onResolved,
                probeDelaysMs = CHANNEL_PROBE_DELAYS_MS,
                knownChannelIds,
                timeoutMs,
                pollMs,
            } = options;

            if (acceptedChannelId) {
                onResolved?.('response');
                return acceptedChannelId;
            }

            const startedAt = Date.now();
            let settled = false;
            const tierThree = new AbortController();
            const none = { channelId: null, source: 'none' as InviteChannelSource };

            const viaTiers = async (): Promise<{ channelId: string | null; source: InviteChannelSource }> => {
                for (const delayMs of probeDelaysMs) {
                    if (delayMs > 0) await sleep(delayMs);
                    if (!aliveRef.current || settled) return { channelId: null, source: 'none' };
                    try {
                        const probed = await latest.current.getInvite(code);
                        if (!aliveRef.current) return { channelId: null, source: 'none' };
                        if (probed?.channelId) return { channelId: probed.channelId, source: 'probe' };
                    } catch {
                        if (!aliveRef.current) return { channelId: null, source: 'none' };
                    }
                }
                if (settled) return { channelId: null, source: 'none' };

                const listed = await latest.current.awaitChannel({
                    knownChannelIds,
                    timeoutMs,
                    pollMs,
                    signal: tierThree.signal,
                });
                return { channelId: listed, source: listed ? 'list' : 'none' };
            };

            let stopWatching = (): void => undefined;
            const viaPush = new Promise<{ channelId: string; source: InviteChannelSource }>(resolve => {
                if (!inviterId) return;
                stopWatching = runtime.connection.onServerEvent<JoinPush>(
                    'join.sync',
                    message => {
                        if (isInviterJoinToNewRoom(message.data, inviterId)) {
                            settled = true;
                            resolve({ channelId: message.data.channelId, source: 'push' });
                        }
                    },
                    { slot: runtime.connection.RELAY_SLOT }
                );
            });

            try {
                const tiers = viaTiers().catch(() => none);
                let winner: { channelId: string | null; source: InviteChannelSource } = await Promise.race([
                    viaPush,
                    tiers,
                ]);
                const left = ROOM_PUSH_WAIT_MS - (Date.now() - startedAt);
                if (!winner.channelId && inviterId && aliveRef.current && left > 0) {
                    winner = await Promise.race([viaPush, sleep(left).then(() => winner)]);
                }
                settled = true;
                if (!aliveRef.current) return null;
                onResolved?.(winner.source);
                return winner.channelId;
            } finally {
                tierThree.abort();
                stopWatching();
            }
        },
        []
    );

    return { resolveChannel };
};
