import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const mockSetMyProfile = vi.fn();
const mockRepositories = { profile: { setMyProfile: mockSetMyProfile, getMyProfile: vi.fn() } };
let mockSelectedSiteId: string | null = 'place-a';

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));
vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => mockRepositories,
        },
        session: {
            useSessionSelection: () => ({ selectedSiteId: mockSelectedSiteId }),
        },
    })
);

import { useMyProfile } from './useMyProfile';

beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedSiteId = 'place-a';
    mockSetMyProfile.mockResolvedValue({ id: 'place-b@me', nick: 'Raine' });
});

describe('useMyProfile — save', () => {
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
