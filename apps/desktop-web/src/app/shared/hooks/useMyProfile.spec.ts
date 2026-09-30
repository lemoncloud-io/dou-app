import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const mockSetMyProfile = vi.fn();
// One object for every render, as the runtime's repository graph is: a fresh object per render would
// recreate the callback each time and hide a stale closure.
const mockRepositories = { profile: { setMyProfile: mockSetMyProfile, getMyProfile: vi.fn() } };
let mockSelectedSiteId: string | null = 'place-a';

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => mockRepositories,
        },
        session: {
            useSessionSelection: () => ({ selectedSiteId: mockSelectedSiteId }),
        },
    },
}));

import { useMyProfile } from './useMyProfile';

beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedSiteId = 'place-a';
    mockSetMyProfile.mockResolvedValue({ id: 'place-b@me', nick: 'Raine' });
});

describe('useMyProfile — save', () => {
    // The edit dialog stays mounted across place switches. A save closed over the first place named
    // it forever after, and the repository rejects a write whose answer comes from another place.
    it('names the place selected at the time of the save, not the one the hook mounted on', async () => {
        const { result, rerender } = renderHook(() => useMyProfile());

        mockSelectedSiteId = 'place-b';
        rerender();
        await act(async () => {
            await result.current.save({ nick: 'Raine' } as never);
        });

        expect(mockSetMyProfile).toHaveBeenCalledWith({ nick: 'Raine' }, 'place-b');
    });
});
