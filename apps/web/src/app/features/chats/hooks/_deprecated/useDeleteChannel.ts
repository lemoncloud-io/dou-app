import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useDeleteChannel = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isPending, setIsPending] = useState(false);

    const deleteChannel = (channelId: string): Promise<ChannelView> => {
        setIsPending(true);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChannelView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsPending(false);
                        reject(new Error('chat/delete-channel error'));
                        return;
                    }
                    if (envelope.action !== 'delete-channel') return;
                    unsub();
                    setIsPending(false);
                    resolve(envelope.payload as ChannelView);
                }
            );
            emitAuthenticated({ type: 'chat', action: 'delete-channel', payload: { channelId } });
        });
    };

    return { deleteChannel, isPending };
};
