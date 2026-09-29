import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Listener = (user: { id: string; name?: string } | null) => void;
const listeners = vi.hoisted(() => new Map<string, Listener[]>());

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                user: {
                    observeItem: (id: string, listener: Listener) => {
                        listeners.set(id, [...(listeners.get(id) ?? []), listener]);
                        return () => undefined;
                    },
                },
            }),
        },
    },
}));

import { useAuthorNames } from './useAuthorNames';

const emit = (id: string, name: string) =>
    act(() => {
        for (const listener of listeners.get(id) ?? []) listener({ id, name });
    });

describe('useAuthorNames', () => {
    it('surfaces a name as the cache emits it', () => {
        const { result } = renderHook(() => useAuthorNames(['u1']));
        expect(result.current.get('u1')).toBeUndefined();
        emit('u1', 'Ada');
        expect(result.current.get('u1')).toBe('Ada');
    });

    // The sidebar and the quick switcher both resolve DM names. The second caller used to
    // skip the update because the first had already written the name, and kept the raw id.
    it('gives every caller the name, even one that heard it second', () => {
        const ids = ['u2'];
        const first = renderHook(() => useAuthorNames(ids));
        const second = renderHook(() => useAuthorNames(ids));
        emit('u2', 'Grace');
        expect(first.result.current.get('u2')).toBe('Grace');
        expect(second.result.current.get('u2')).toBe('Grace');
    });
});
