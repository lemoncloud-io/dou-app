import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useInviteChannel = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const inviteChannel = (channelId: string, userIds: string[]): Promise<ChannelView> => {
        setIsPending(true);
        setIsError(false);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChannelView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsError(true);
                        setIsPending(false);
                        reject(new Error('chat/invite error'));
                        return;
                    }
                    if (envelope.action !== 'invite') return;
                    unsub();
                    setIsPending(false);
                    resolve(envelope.payload as ChannelView);
                }
            );
            emitAuthenticated({ type: 'chat', action: 'invite', payload: { channelId, userIds } });
        });
    };

    return { inviteChannel, isPending, isError };
};
