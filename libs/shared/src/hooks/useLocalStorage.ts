import { useState } from 'react';

import { logger } from '@chatic/bridges';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            logger.error('STORAGE', 'Error reading localStorage', { error, data: { key } });
            return initialValue;
        }
    });

    const setValue = (value: T) => {
        try {
            setStoredValue(value);
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            logger.error('STORAGE', 'Error saving to localStorage', { error, data: { key } });
        }
    };

    return [storedValue, setValue];
}
