import { useState } from 'react';

import { useChannelMutations } from '@chatic/data';

import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { ChatStartPayload } from '@lemoncloud/chatic-sockets-api';

export const useCreateChannel = () => {
    const { createChannel: socketCreateChannel, isPending } = useChannelMutations();
    const [isError, setIsError] = useState(false);
    const [channel, setChannel] = useState<ChannelView | null>(null);

    const createChannel = async (payload: ChatStartPayload): Promise<ChannelView> => {
        setIsError(false);
        try {
            const newChannel = await socketCreateChannel(payload);
            setChannel(newChannel);
            return newChannel;
        } catch (error) {
            setIsError(true);
            throw error;
        }
    };

    return { createChannel, isLoading: isPending.start, isError, channel };
};
