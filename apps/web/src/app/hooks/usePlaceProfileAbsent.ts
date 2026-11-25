import { useCallback, useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime-react';

import { isPlaceProfileAbsent } from '../utils/placeProfile';

export interface PlaceProfileGate {
    absent: boolean | undefined;
    markPresent: () => void;
}

export interface PlaceProfileGateOptions {
    enabled?: boolean;
}

export const usePlaceProfileAbsent = ({ enabled = true }: PlaceProfileGateOptions = {}): PlaceProfileGate => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId: sid } = runtime.session.useSessionSelection();
    const { userId: uid } = runtime.session.useSessionIdentity();

    const key = sid && uid ? `${sid}@${uid}` : null;
    const [verdict, setVerdict] = useState<{ key: string; absent: boolean } | null>(null);

    useEffect(() => {
        if (!key || !enabled) return;

        let alive = true;
        void isPlaceProfileAbsent(profileRepository).then(result => {
            if (alive) setVerdict({ key, absent: result });
        });

        return () => {
            alive = false;
        };
    }, [profileRepository, key, enabled]);

    const markPresent = useCallback(() => {
        if (key) setVerdict({ key, absent: false });
    }, [key]);

    if (!key) return { absent: false, markPresent };
    return { absent: verdict?.key === key ? verdict.absent : undefined, markPresent };
};
