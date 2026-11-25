import { describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

type Row = { uid: string; sid: string; nick?: string; thumbnail?: string };
type Listener = (result: { list: Row[] }) => void;

const cache = vi.hoisted(() => ({
    rows: [] as Row[],
    listeners: new Set<(result: { list: Row[] }) => void>(),
    getMyProfile: vi.fn(),
}));

vi.mock('@chatic/runtime-react', async () => {
    const emit = () => cache.listeners.forEach(listener => listener({ list: [...cache.rows] }));
    cache.getMyProfile.mockImplementation(async () => {
        const row = { uid: 'me', sid: 'S1', nick: 'Captain', thumbnail: 'place.png' };
        cache.rows = [row];
        emit();
        return row;
    });
    const repositories = {
        profile: {
            observeList: (_query: unknown, callback: Listener) => {
                cache.listeners.add(callback);
                callback({ list: [...cache.rows] });
                return () => cache.listeners.delete(callback);
            },
            getMyProfile: cache.getMyProfile,
        },
    };
    return (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => repositories },
        connection: { useRuntimeSocketState: () => ({ isVerified: true }) },
        session: { useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }) },
    });
});

import { useDisplayProfile, useSiteProfiles } from './useSiteProfiles';

describe('my avatar right after sign-in', () => {
    it('shows my place photo on the home screen without visiting the profile page', async () => {
        const { result } = renderHook(() => {
            useSiteProfiles();
            return useDisplayProfile('me', 'Me', undefined);
        });
        await waitFor(() => expect(result.current.thumbnail).toBe('place.png'));
    });
});
