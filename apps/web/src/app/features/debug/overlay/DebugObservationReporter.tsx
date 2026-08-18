import { useEffect } from 'react';

import { useActiveCloudData, useOtherCloudUnread } from '../../../hooks';
import { useDebugMode } from '../hooks';
import { clearDebugObservation, publishDebugObservation } from './sharedObservationStore';

/**
 * Mirrors the app-wide shared observations into `sharedObservationStore` so the out-of-tree overlay
 * can inspect them (see that module for why the overlay cannot just consume the contexts).
 *
 * Mounted inside the providers in `AppRuntime`. The gate is the point of the split: with debug mode
 * locked — every normal user — nothing below is mounted, so this costs one store read and adds NO
 * consumer to the shared observation. Unlocked, it adds a single null-rendering consumer that
 * re-renders on cache writes and renders nothing.
 */
export const DebugObservationReporter = () => {
    const { isEnabled } = useDebugMode();
    if (!isEnabled) return null;
    return <ObservationMirror />;
};

const ObservationMirror = () => {
    const activeCloud = useActiveCloudData();
    const otherCloud = useOtherCloudUnread();

    useEffect(() => {
        publishDebugObservation({ activeCloud, otherCloud });
    }, [activeCloud, otherCloud]);

    useEffect(() => clearDebugObservation, []);

    return null;
};
