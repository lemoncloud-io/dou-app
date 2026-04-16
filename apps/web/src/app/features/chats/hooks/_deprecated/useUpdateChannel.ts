import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { useMyChannels } from '../../../home/hooks/useMyChannels';

interface ChatUpdateChannelPayload {
    channelId: string;
    name: string;
}

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useUpdateChannel = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { setChannels } = useMyChannels();
    const [isPending, setIsPending] = useState(false);

    const updateChannel = (payload: ChatUpdateChannelPayload): Promise<ChannelView> => {
        setIsPending(true);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChannelView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsPending(false);
                        reject(new Error('chat/update error'));
                        return;
                    }

                    if (envelope.action !== 'update-channel') return;
                    unsub();
                    setIsPending(false);

                    const channel = envelope.payload as ChannelView;
                    setChannels(prev => prev.map(ch => (ch.id === channel.id ? channel : ch)));
                    // Update the global channels list with the updated channel

                    resolve(channel);
                }
            );
            emitAuthenticated({
                type: 'chat',
                action: 'update-channel',
                payload,
            });
        });
    };

    return { updateChannel, isPending };
};
