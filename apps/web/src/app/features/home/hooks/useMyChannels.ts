import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';

import {
    addListener,
    bootstrap,
    getState,
    removeChannel,
    removeListener,
    retryMine,
    setChannels,
    setEmitAuthenticated,
    setProfileId,
} from './channelState';
import { hydrateFromInjectedCache, loadCachedChannels } from './channelCacheAdapter';

// Side-effect: registers socket message handlers + lifecycle subscriptions
import './channelSocketHandler';

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useMyChannels = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const profile = useDynamicProfile();
    const [, forceUpdate] = useState({});

    setEmitAuthenticated(emitAuthenticated);
    setProfileId(profile?.uid ?? '');

    // Retry cache hydration during render (in case module-level missed it)
    hydrateFromInjectedCache();

    useEffect(() => {
        const listener = () => forceUpdate({});
        addListener(listener);

        const wssType = useWebSocketV2Store.getState().wssType;
        const hasPlace = wssType !== 'cloud' || !!cloudCore.getSelectedPlaceId();
        if (isVerified && hasPlace) {
            bootstrap(loadCachedChannels);
        }

        return () => removeListener(listener);
    }, [profile?.uid, isVerified]);

    const state = getState();
    return {
        channels: state.channels,
        isLoading: state.status === 'loading' || state.status === 'idle',
        isError: state.status === 'error',
        setChannels,
        removeChannel,
        retry: retryMine,
    };
};
