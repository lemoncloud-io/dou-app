import { act, renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import type { StorageLike } from '@chatic/config';
import { usePlaceInviteExperiment } from './usePlaceInviteExperiment';

// The real registry and resolver, not a mock: what this hook must not get wrong is the key itself.
// A mocked config would stay green if the registry renamed or dropped `feature.placeInvite`, while
// the switch in the app silently stopped doing anything.
const memoryStorage = (): StorageLike => {
    const map = new Map<string, string>();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
    };
};

beforeEach(() => {
    config.init({
        env: { stage: () => 'PROD', buildStage: () => 'PROD', platform: () => 'web', raw: () => undefined },
        storage: { local: memoryStorage(), session: memoryStorage() },
    });
});

describe('usePlaceInviteExperiment', () => {
    it('reads a key the registry declares as a Lab experiment', () => {
        expect(config.snapshot('feature.placeInvite')?.entry.surface).toBe('labs');
    });

    it('is off until this device turns it on, in a production build too', () => {
        const { result } = renderHook(() => usePlaceInviteExperiment());

        expect(result.current.isEnabled).toBe(false);
    });

    it('turns on and off through the local lane, and re-renders on each change', () => {
        const { result } = renderHook(() => usePlaceInviteExperiment());

        act(() => result.current.setEnabled(true));
        expect(result.current.isEnabled).toBe(true);
        expect(config.snapshot('feature.placeInvite')?.origin).toBe('local');

        act(() => result.current.setEnabled(false));
        expect(result.current.isEnabled).toBe(false);
    });
});
