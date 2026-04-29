import { logger } from '../../../../services';
import type { MMKV } from 'react-native-mmkv';
import { createMMKV } from 'react-native-mmkv';

const _mmkv: MMKV = createMMKV();

export const mmkv = {
    /**
     * Stores data associated with the given key.
     * @param key Unique identifier for the data.
     * @param value The data to be stored.
     */
    async set<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            _mmkv.set(key, jsonValue);
        } catch (e) {
            logger.error('STORAGE', `Set error for key: ${key}`, e);
        }
    },

    /**
     * Retrieves and parses data for the given key.
     * Returns null if the key does not exist or if parsing fails.
     * @param key Unique identifier for the data.
     * @returns The parsed data of type T, or null.
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const jsonValue = _mmkv.getString(key);
            return jsonValue != null ? (JSON.parse(jsonValue) as T) : null;
        } catch (e) {
            logger.error('STORAGE', `JSON Parsing Error for key: ${key}`, e);
            return null;
        }
    },

    /**
     * Removes the data associated with the specific key.
     * @param key The key to be deleted.
     */
    async remove(key: string): Promise<void> {
        try {
            _mmkv.remove(key);
        } catch (e) {
            logger.error('STORAGE', `Remove error for key: ${key}`, e);
        }
    },

    /**
     * Clears all data stored in the MMKV instance.
     */
    async clearAll(): Promise<void> {
        try {
            _mmkv.clearAll();
        } catch (e) {
            logger.error('STORAGE', 'Clear all error.', e);
        }
    },

    /**
     * Retrieves an array containing all keys currently stored in MMKV.
     * @returns An array of strings representing the keys.
     */
    getAllKeys(): string[] {
        try {
            return _mmkv.getAllKeys();
        } catch (e) {
            logger.error('STORAGE', 'Get all keys error.', e);
            return [];
        }
    },
};
