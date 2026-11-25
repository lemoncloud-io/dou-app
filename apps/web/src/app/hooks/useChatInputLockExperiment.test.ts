import { act, renderHook } from '@testing-library/react';

import { runtime, type StorageLike } from '@chatic/runtime-react';

import { wireTestSettings } from '../../testing/settings';
import { useChatInputLockExperiment } from './useChatInputLockExperiment';

const memoryStorage = (): StorageLike => {
    const map = new Map<string, string>();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
    };
};

beforeEach(() => {
    wireTestSettings({ local: memoryStorage(), session: memoryStorage() });
});

describe('useChatInputLockExperiment', () => {
    it('reads a key the registry declares as a Lab experiment', () => {
        expect(runtime.settings.snapshot('feature.chatInputLock')?.entry.surface).toBe('labs');
    });

    it('is off until this device turns it on, in a production build too', () => {
        const { result } = renderHook(() => useChatInputLockExperiment());

        expect(result.current.isEnabled).toBe(false);
    });

    it('turns on and off through the local lane, and re-renders on each change', () => {
        const { result } = renderHook(() => useChatInputLockExperiment());

        act(() => result.current.setEnabled(true));
        expect(result.current.isEnabled).toBe(true);
        expect(runtime.settings.snapshot('feature.chatInputLock')?.origin).toBe('local');

        act(() => result.current.setEnabled(false));
        expect(result.current.isEnabled).toBe(false);
    });
});
