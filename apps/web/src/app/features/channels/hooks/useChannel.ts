import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { runtime, type DomainChannel } from '@chatic/runtime';

import { isRoomOwner } from '../lib/channelStereoPolicy';
import type { ClientChannelView } from '../types';

const toClientChannel = (channel: DomainChannel, myUid: string): ClientChannelView => ({
    ...channel,
    isOwner: isRoomOwner(channel, channel.$join, myUid),
    isSelfChat: channel.stereo === 'self',
    memberCount: channel.memberIds?.length ?? channel.memberNo ?? 0,
});

const CHANNEL_RESOLVE_TIMEOUT_MS = 10_000;

export const useChannel = (channelId: string | null, options?: { seed?: DomainChannel | null }) => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();
    const myUid = userId ?? '';

    const seed = options?.seed && channelId && options.seed.id === channelId ? options.seed : null;

    const [channel, setChannel] = useState<DomainChannel | null>(null);
    const [isLoading, setIsLoading] = useState(!!channelId);
    const [isError, setIsError] = useState(false);
    const [stateFor, setStateFor] = useState(channelId);
    const isStale = stateFor !== channelId;
    const hasResolvedRef = useRef(false);
    const hasSeedRef = useRef(!!seed);
    hasSeedRef.current = !!seed;

    runtime.sync.useChannelSync(channelId ?? undefined);

    useEffect(() => {
        hasResolvedRef.current = false;
        setStateFor(channelId);
        setIsError(false);
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }
        setChannel(null);
        setIsLoading(true);

        const timer = setTimeout(() => {
            if (hasResolvedRef.current || hasSeedRef.current) return;
            setIsLoading(false);
            setIsError(true);
        }, CHANNEL_RESOLVE_TIMEOUT_MS);

        const unsubscribe = channelRepository.observeItem(channelId, item => {
            if (item) {
                hasResolvedRef.current = true;
                setChannel(item);
                setIsLoading(false);
                setIsError(false);
                return;
            }
            if (hasResolvedRef.current) {
                setChannel(null);
                setIsLoading(false);
            }
        });

        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, [channelRepository, channelId]);

    const isRefused = useSyncExternalStore(
        runtime.sync.subscribeRefusedChannels,
        () => (channelId ? runtime.sync.isChannelRefused(channelId) : false),
        () => false
    );

    const hasResolved = !isStale && hasResolvedRef.current;
    const effective = (isStale ? null : channel) ?? (!hasResolved ? seed : null);
    const clientChannel = useMemo(() => (effective ? toClientChannel(effective, myUid) : null), [effective, myUid]);

    const isForbidden = isRefused && !effective;
    const loading = isStale ? !!channelId : isLoading;

    return {
        channel: clientChannel,
        isLoading: loading && !seed && !isForbidden,
        isError: !isStale && isError,
        isForbidden,
    };
};
