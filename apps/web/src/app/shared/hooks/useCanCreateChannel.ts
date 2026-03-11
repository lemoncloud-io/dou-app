import { useWebCoreStore } from '@chatic/web-core';

import { useMyChannels } from '../../features/home/hooks/useMyChannels';

const GUEST_MAX_CHANNELS = 1;

export const useCanCreateChannel = () => {
    const profile = useWebCoreStore(s => s.profile);
    const isGuest = profile?.userRole === 'guest';
    const { channels } = useMyChannels();

    const canCreate = !isGuest || channels.length < GUEST_MAX_CHANNELS;

    return { canCreate };
};
