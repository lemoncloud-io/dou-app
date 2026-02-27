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

    useEffect(() => {
        if (hasSentRef.current) return;
        hasSentRef.current = true;
        emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
    }, []);

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
