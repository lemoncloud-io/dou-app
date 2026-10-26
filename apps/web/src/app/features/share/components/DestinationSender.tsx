import { useEffect } from 'react';

import { useSendImages } from '../../channels/hooks/useSendImages';
import type { SendFiles } from '../hooks/useShareSend';
import type { ShareDestination } from '../hooks/useShareDestinations';

interface DestinationSenderProps {
    destination: ShareDestination;
    register: (channelId: string, send: SendFiles) => () => void;
}

/**
 * Holds one destination's attachment send while it is selected. Draws nothing: the send is the
 * room's own, bound to the room, so each destination needs a mounted one before the share is sent.
 */
export const DestinationSender = ({ destination, register }: DestinationSenderProps) => {
    const { sendImages } = useSendImages({ cid: destination.cid, channelId: destination.id });
    useEffect(() => register(destination.id, sendImages), [register, destination.id, sendImages]);
    return null;
};
