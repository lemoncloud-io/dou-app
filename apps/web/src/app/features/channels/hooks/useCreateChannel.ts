import { useState } from 'react';

import { reportError } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';
import type { ChannelCreateInput } from '@lemoncloud/chatic-sockets-api';

import { toError } from '../../../utils/errors';
import { useChannelMutations } from './useChannelMutations';

export const useCreateChannel = () => {
    const { createChannel: socketCreateChannel, isPending } = useChannelMutations();
    const [isError, setIsError] = useState(false);
    const [channel, setChannel] = useState<DomainChannel | null>(null);

    const createChannel = async (payload: ChannelCreateInput): Promise<DomainChannel> => {
        setIsError(false);
        try {
            const newChannel = await socketCreateChannel(payload);
            setChannel(newChannel);
            return newChannel;
        } catch (error) {
            setIsError(true);
            reportError(toError(error));
            throw error;
        }
    };

    return { createChannel, isLoading: isPending.start, isError, channel };
};
