import { describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

type Row = { uid: string; sid: string; nick?: string; thumbnail?: string };
type Listener = (result: { list: Row[] }) => void;

// My place profile exists on the server only: a fresh sign-in has an empty profile cache, and the row
// reaches it through `getMyProfile` (profile.get-mine) — the way the profile page gets it.
const cache = vi.hoisted(() => ({
    rows: [] as Row[],
    listeners: new Set<(result: { list: Row[] }) => void>(),
    getMyProfile: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => {
    const emit = () => cache.listeners.forEach(listener => listener({ list: [...cache.rows] }));
    cache.getMyProfile.mockImplementation(async () => {
        const row = { uid: 'me', sid: 'S1', nick: 'Captain', thumbnail: 'place.png' };
        cache.rows = [row];
        emit();
        return row;
    });
    // One object, like the runtime's: a fresh one per render would re-run every effect keyed on it.
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
    return {
        runtime: {
            data: { useRuntimeRepositories: () => repositories },
            connection: { useRuntimeSocketState: () => ({ isVerified: true }) },
            session: { useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }) },
        },
    };
});

import { useDisplayProfile, useSiteProfiles } from './useSiteProfiles';

describe('my avatar right after sign-in', () => {
    // Symptom: the rail's avatar is empty until the profile page is opened once. The account's own
    // photo is a placeholder here; the photo I set for this place only shows up once my row is read.
    it('shows my place photo on the home screen without visiting the profile page', async () => {
        const { result } = renderHook(() => {
            useSiteProfiles();
            return useDisplayProfile('me', 'Me', undefined);
        });
        await waitFor(() => expect(result.current.thumbnail).toBe('place.png'));
    });
});
