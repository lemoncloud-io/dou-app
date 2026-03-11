import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 싱글톤 상태
let globalChannels: ChannelView[] = [];
let globalIsLoading = true;
let globalIsError = false;
const listeners: Set<() => void> = new Set();
let isBootstrapped = false;

const notifyListeners = () => listeners.forEach(l => l());

const setGlobalState = (channels: ChannelView[], isLoading: boolean, isError: boolean) => {
    globalChannels = channels;
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();
};

// 훅 외부에서 싱글톤으로 소켓 메시지 처리
const bootstrap = (emitAuthenticated: (msg: object) => void, profileId: string) => {
    if (isBootstrapped) return;
    isBootstrapped = true;

    emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (globalIsLoading) setGlobalState([], false, true);
    }, 10000);

    useWebSocketV2Store.subscribe(
        s => s.lastMessage,
        lastMessage => {
            const envelope = lastMessage as WSSEnvelope<{
                list: ChannelView[];
                sourceType?: string;
                userId?: string;
                channelId?: string;
            }> | null;
            if (!envelope) return;

            if (envelope.type === 'model' && envelope.action === 'delete' && envelope.payload?.sourceType === 'join') {
                const { userId, channelId } = envelope.payload;
                if (userId === profileId && channelId) {
                    setGlobalState(
                        globalChannels.filter(ch => ch.id !== channelId),
                        false,
                        false
                    );
                }
                return;
            }

            if (
                envelope.type === 'model' &&
                envelope.action === 'update' &&
                (envelope.payload as { reason?: string })?.reason === 'channel-deleted'
            ) {
                const channelId = (envelope.payload as { channelId?: string })?.channelId;
                if (channelId) {
                    setGlobalState(
                        globalChannels.filter(ch => ch.id !== channelId),
                        false,
                        false
                    );
                }
                return;
            }

            if (envelope.action === 'update' && envelope.payload?.sourceType === 'channel') {
                emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
                return;
            }

            if (envelope.type !== 'chat') return;
            if (envelope.action === 'error') {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                setGlobalState([], false, true);
                return;
            }
            if (envelope.action !== 'mine') return;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            setGlobalState(envelope.payload?.list ?? [], false, false);
        }
    );
};

const setChannels = (updater: ChannelView[] | ((prev: ChannelView[]) => ChannelView[])) => {
    const next = typeof updater === 'function' ? updater(globalChannels) : updater;
    setGlobalState(next, globalIsLoading, globalIsError);
};

let globalEmitAuthenticated: ((msg: object) => void) | null = null;
let globalProfileId = '';

useWebSocketV2Store.subscribe(
    s => s.isVerified,
    isVerified => {
        if (!isVerified || !globalEmitAuthenticated || !globalProfileId) return;
        isBootstrapped = false;
        bootstrap(globalEmitAuthenticated, globalProfileId);
    }
);

const retryMine = () => {
    if (!globalEmitAuthenticated) return;
    setGlobalState([], true, false);
    globalEmitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
};

export const useMyChannels = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const profile = useWebCoreStore(s => s.profile);
    const [, forceUpdate] = useState({});

    globalEmitAuthenticated = emitAuthenticated;

    useEffect(() => {
        const listener = () => forceUpdate({});
        listeners.add(listener);
        if (profile?.id) {
            globalProfileId = profile.id;
            bootstrap(emitAuthenticated, profile.id);
        }
        return () => {
            listeners.delete(listener);
        };
    }, [profile?.id]);

    return {
        channels: globalChannels,
        isLoading: globalIsLoading,
        isError: globalIsError,
        setChannels,
        retry: retryMine,
    };
};
