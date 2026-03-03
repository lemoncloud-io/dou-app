import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { useMyChannels } from './useMyChannels';

interface CreateChannelPayload {
    stereo: string;
    name: string;
    desc?: string;
}

export const useCreateChannel = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [channel, setChannel] = useState<ChannelView | null>(null);

    const { setChannels } = useMyChannels();

    const createChannel = (payload: CreateChannelPayload): Promise<ChannelView> => {
        setIsLoading(true);
        setIsError(false);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChannelView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsError(true);
                        setIsLoading(false);
                        reject(new Error('chat/start error'));
                        return;
                    }
                    if (envelope.action !== 'start') return;
                    unsub();
                    const newChannel = envelope.payload as ChannelView;
                    setChannel(newChannel);
                    setIsLoading(false);
                    setChannels(prev => [...prev, newChannel]);
                    resolve(newChannel);
                }
            );
            emitAuthenticated({ type: 'chat', action: 'start', payload });
        });
    };

    return { createChannel, isLoading, isError, channel };
};
