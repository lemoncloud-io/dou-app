import { useEffect } from 'react';

import { useActiveCloudData, useOtherCloudUnread } from '../../../hooks';
import { useDebugMode } from '../hooks';
import { publishDebugObservation } from './sharedObservationStore';

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

    useEffect(() => () => publishDebugObservation({ activeCloud: null, otherCloud: null }), []);

    return null;
};
