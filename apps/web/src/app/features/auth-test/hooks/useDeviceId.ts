import { useEffect, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

import { DEVICE_ID_STORAGE_KEY } from '../types';

/**
 * Hook to manage device ID persistence
 * - Uses localStorage (persists across browser sessions)
 * - Generates new UUID if not exists
 * - Can regenerate on demand
 */
export const useDeviceId = () => {
    const [deviceId, setDeviceId] = useState<string>(() => {
        const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (stored) return stored;

        const newId = uuidv4();
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
        return newId;
    });

    useEffect(() => {
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }, [deviceId]);

    const regenerateDeviceId = () => {
        const newId = uuidv4();
        setDeviceId(newId);
        return newId;
    };

    return { deviceId, setDeviceId, regenerateDeviceId };
};
