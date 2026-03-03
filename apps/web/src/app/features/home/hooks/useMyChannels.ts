import { useEffect, useRef, useState } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 싱글톤 상태
let globalChannels: ChannelView[] = [];
let globalIsLoading = true;
let globalIsError = false;
const listeners: Set<() => void> = new Set();
let hasInitialized = false;

const notifyListeners = () => {
    listeners.forEach(listener => listener());
};

const setGlobalState = (channels: ChannelView[], isLoading: boolean, isError: boolean) => {
    globalChannels = channels;
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();
};

export const useMyChannels = () => {
    const { emitAuthenticated, lastMessage } = useWebSocketV2();
    const hasSentRef = useRef(false);
    const [, forceUpdate] = useState({});

    // 리스너 등록
    useEffect(() => {
        const listener = () => forceUpdate({});
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    // 최초 요청 (한 번만)
    useEffect(() => {
        if (hasInitialized || hasSentRef.current) return;
        hasSentRef.current = true;
        hasInitialized = true;
        emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
    }, []);

    // 채널 변경 이벤트 수신 시 목록 재요청
    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<{ sourceType?: string }> | null;
        if (envelope?.action === 'update' && envelope.payload?.sourceType === 'channel') {
            emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
        }
    }, [lastMessage]);

    // chat/mine 응답 처리
    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<{ list: ChannelView[] }> | null;
        if (envelope?.type !== 'chat') return;
        if (envelope.action === 'error') {
            setGlobalState([], false, true);
            return;
        }
        if (envelope.action !== 'mine') return;
        setGlobalState(envelope.payload?.list ?? [], false, false);
    }, [lastMessage]);

    return {
        channels: globalChannels,
        isLoading: globalIsLoading,
        isError: globalIsError,
    };
};
