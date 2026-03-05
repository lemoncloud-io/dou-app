import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useSimpleWebCore } from '@chatic/web-core';
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
                setGlobalState([], false, true);
                return;
            }
            if (envelope.action !== 'mine') return;
            setGlobalState(envelope.payload?.list ?? [], false, false);
        }
    );
};

const setChannels = (updater: ChannelView[] | ((prev: ChannelView[]) => ChannelView[])) => {
    const next = typeof updater === 'function' ? updater(globalChannels) : updater;
    setGlobalState(next, globalIsLoading, globalIsError);
};

export const useMyChannels = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    const [, forceUpdate] = useState({});

    useEffect(() => {
        const listener = () => forceUpdate({});
        listeners.add(listener);
        if (profile?.id) bootstrap(emitAuthenticated, profile.id);
        return () => {
            listeners.delete(listener);
        };
    }, [profile?.id]);

    return {
        channels: globalChannels,
        isLoading: globalIsLoading,
        isError: globalIsError,
        setChannels,
    };
};
