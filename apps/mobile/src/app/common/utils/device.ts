import uuid from 'react-native-uuid';

import { STORAGE_KEYS, storage } from '../services';

/**
 * Retrieves the unique device ID for the user.
 * Generates a random UUID if it doesn't already exist.
 * Managed and persisted via AsyncStorage.
 * @returns A promise that resolves to the device ID or null if an error occurs.
 * @author dev@example.com
 */
export const getDeviceId = async (): Promise<string | null> => {
    try {
        const storedId = await storage.get<string>(STORAGE_KEYS.USER.DEVICE_ID);

        if (storedId) return storedId;

        const newId = uuid.v4().toString();
        await storage.set(STORAGE_KEYS.USER.DEVICE_ID, newId);

        return newId;
    } catch {
        return null;
    }
};
