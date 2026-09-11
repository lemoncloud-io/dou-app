/**
 * `hooks/memberships/use-debounced-value.ts`
 * - Trails a value by a delay, so typing narrows the list without firing a request per keystroke.
 */
import { useEffect, useState } from 'react';

export const useDebouncedValue = <T>(value: T, delayMs = 300): T => {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return settled;
};
