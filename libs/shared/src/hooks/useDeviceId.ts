import { useEffect, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

/**
 * Hook to manage device ID persistence
 * - Uses localStorage (persists across browser sessions)
 * - Generates new UUID if not exists
 * - Can regenerate on demand
 *
 * @param storageKey - localStorage key for persisting device ID
 */
export const useDeviceId = (storageKey: string) => {
    const [deviceId, setDeviceId] = useState<string>(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored) return stored;

        const newId = uuidv4();
        localStorage.setItem(storageKey, newId);
        return newId;
    });

    useEffect(() => {
        localStorage.setItem(storageKey, deviceId);
    }, [storageKey, deviceId]);

    const regenerateDeviceId = () => {
        const newId = uuidv4();
        setDeviceId(newId);
        return newId;
    };

    return { deviceId, setDeviceId, regenerateDeviceId };
};
