import { useEffect } from 'react';

import { useSendImages } from '../../channels/hooks/useSendImages';
import type { SendFiles } from '../hooks/useShareSend';
import type { ShareDestination } from '../hooks/useShareDestinations';

interface DestinationSenderProps {
    destination: ShareDestination;
    register: (channelId: string, send: SendFiles) => () => void;
}

export const DestinationSender = ({ destination, register }: DestinationSenderProps) => {
    const { sendImages } = useSendImages({ cid: destination.cid, channelId: destination.id });
    useEffect(() => register(destination.id, sendImages), [register, destination.id, sendImages]);
    return null;
};
