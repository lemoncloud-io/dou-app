import { useEffect, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

import { safeSessionStorage } from '../utils/storage';

/**
 * Hook to manage device ID persistence in sessionStorage
 * - Uses sessionStorage (persists only during browser session)
 * - Generates new UUID if not exists
 * - Can regenerate on demand
 * - Storage that refuses costs the persistence, not the id: a fresh one lives for this run
 *
 * @param storageKey - sessionStorage key for persisting device ID
 */
export const useSessionDeviceId = (storageKey: string) => {
    const [deviceId, setDeviceId] = useState<string>(() => {
        const stored = safeSessionStorage.getItem(storageKey);
        if (stored) return stored;

        const newId = uuidv4();
        safeSessionStorage.setItem(storageKey, newId);
        return newId;
    });

    useEffect(() => {
        safeSessionStorage.setItem(storageKey, deviceId);
    }, [storageKey, deviceId]);

    const regenerateDeviceId = () => {
        const newId = uuidv4();
        setDeviceId(newId);
        return newId;
    };

    return { deviceId, setDeviceId, regenerateDeviceId };
};
