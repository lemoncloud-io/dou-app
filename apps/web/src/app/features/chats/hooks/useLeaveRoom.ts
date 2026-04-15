import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { useMyChannels } from '../../home/hooks/useMyChannels';

export const useLeaveRoom = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isPending, setIsPending] = useState(false);
    const { setChannels } = useMyChannels();
    const leaveRoom = (channelId: string, userId?: string, reason?: string): Promise<ChannelView> => {
        setIsPending(true);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChannelView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsPending(false);
                        reject(new Error('chat/leave error'));
                        return;
                    }
                    if (envelope.action !== 'leave') return;
                    unsub();
                    setIsPending(false);
                    const channel = envelope.payload as ChannelView;
                    setChannels(prev => prev.filter(ch => ch.id !== channel.id));
                    resolve(channel);
                }
            );
            emitAuthenticated({
                type: 'chat',
                action: 'leave',
                payload: { channelId, ...(userId && { userId }), ...(reason && { reason }) },
            });
        });
    };

    return { leaveRoom, isPending };
};
