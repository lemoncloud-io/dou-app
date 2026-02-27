import { useEffect, useRef, useState } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export const useMyChannels = () => {
    const { emitAuthenticated, lastMessage } = useWebSocketV2();
    const hasSentRef = useRef(false);
    const [channels, setChannels] = useState<ChannelView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    // 마운트 시 내 채널 목록 최초 요청 (인증 후 보장)
    useEffect(() => {
        if (hasSentRef.current) return;
        hasSentRef.current = true;
        emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
    }, []);

    // 채널 변경 이벤트(update/sourceType=channel) 수신 시 목록 재요청
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
            setIsError(true);
            setIsLoading(false);
            return;
        }
        if (envelope.action !== 'mine') return;
        setChannels(envelope.payload?.list ?? []);
        setIsLoading(false);
    }, [lastMessage]);

    return { channels, isLoading, isError };
};
