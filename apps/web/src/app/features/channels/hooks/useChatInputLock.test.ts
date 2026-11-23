import { act, renderHook } from '@testing-library/react';

import type { StorageLike } from '@chatic/runtime';

import { wireTestSettings } from '../../../../testing/settings';
import { setChatInputLockExperiment } from '../../../hooks/useChatInputLockExperiment';
import { useInputLockStore } from '../stores/useInputLockStore';
import { useChatInputLock } from './useChatInputLock';

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
    useInputLockStore.setState({ locked: {} });
    localStorage.clear();
});

describe('useChatInputLock', () => {
    it('offers nothing and locks nothing while the Lab switch is off', () => {
        useInputLockStore.getState().setLocked('c1', true);

        const { result } = renderHook(() => useChatInputLock('c1'));

        expect(result.current.isAvailable).toBe(false);
        expect(result.current.isLocked).toBe(false);
    });

    it('locks and unlocks one room once the Lab switch is on', () => {
        setChatInputLockExperiment(true);
        const { result } = renderHook(() => useChatInputLock('c1'));
        expect(result.current).toEqual(expect.objectContaining({ isAvailable: true, isLocked: false }));

        act(() => result.current.setLocked(true));
        expect(result.current.isLocked).toBe(true);
        expect(useInputLockStore.getState().locked).toEqual({ c1: true });

        act(() => result.current.setLocked(false));
        expect(result.current.isLocked).toBe(false);
    });

    it('keeps a lock through the switch going off and back on', () => {
        setChatInputLockExperiment(true);
        const { result } = renderHook(() => useChatInputLock('c1'));
        act(() => result.current.setLocked(true));

        act(() => setChatInputLockExperiment(false));
        expect(result.current.isLocked).toBe(false);

        act(() => setChatInputLockExperiment(true));
        expect(result.current.isLocked).toBe(true);
    });

    it('answers for its own room only', () => {
        setChatInputLockExperiment(true);
        useInputLockStore.getState().setLocked('c1', true);

        const { result } = renderHook(() => useChatInputLock('c2'));

        expect(result.current.isLocked).toBe(false);
    });

    it('neither reads nor writes a lock without a room', () => {
        setChatInputLockExperiment(true);
        const { result } = renderHook(() => useChatInputLock(undefined));

        act(() => result.current.setLocked(true));

        expect(result.current.isLocked).toBe(false);
        expect(useInputLockStore.getState().locked).toEqual({});
    });
});
