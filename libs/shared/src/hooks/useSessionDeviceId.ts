import { useEffect, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

/**
 * Hook to manage device ID persistence in sessionStorage
 * - Uses sessionStorage (persists only during browser session)
 * - Generates new UUID if not exists
 * - Can regenerate on demand
 *
 * @param storageKey - sessionStorage key for persisting device ID
 */
export const useSessionDeviceId = (storageKey: string) => {
    const [deviceId, setDeviceId] = useState<string>(() => {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) return stored;

        const newId = uuidv4();
        sessionStorage.setItem(storageKey, newId);
        return newId;
    });

    useEffect(() => {
        sessionStorage.setItem(storageKey, deviceId);
    }, [storageKey, deviceId]);

    const regenerateDeviceId = () => {
        const newId = uuidv4();
        setDeviceId(newId);
        return newId;
    };

    return { deviceId, setDeviceId, regenerateDeviceId };
};
