import { useState } from 'react';

import { logger } from '@chatic/bridges';
import type { DomainChannel } from '@chatic/data';
import type { ChannelCreateInput } from '@lemoncloud/chatic-sockets-api';

import { useChannelMutations } from './useChannelMutations';

/**
 * Create-channel payload. Widens ChannelCreateInput with `thumbnail` (the room photo): the socket
 * type does not declare it yet, but the gateway forwards the whole body unmodified, so the field is
 * sent as-is. Server acceptance is assumed per docs/adr/0018.
 */
export type CreateChannelPayload = ChannelCreateInput & { thumbnail?: string };

export const useCreateChannel = () => {
    const { createChannel: socketCreateChannel, isPending } = useChannelMutations();
    const [isError, setIsError] = useState(false);
    const [channel, setChannel] = useState<DomainChannel | null>(null);

    const createChannel = async (payload: CreateChannelPayload): Promise<DomainChannel> => {
        setIsError(false);
        try {
            const newChannel = await socketCreateChannel(payload as ChannelCreateInput);
            setChannel(newChannel);
            return newChannel;
        } catch (error) {
            setIsError(true);
            logger.error('CHAT', '[useCreateChannel] create failed', { error });
            throw error;
        }
    };

    return { createChannel, isLoading: isPending.start, isError, channel };
};
