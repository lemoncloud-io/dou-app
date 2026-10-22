import { renderHook } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

let clouds: Partial<CloudView>[] = [];
let cachedNames: Record<string, string> = {};

jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, hasCloudCatalog: true, isPendingClouds: false }),
}));
jest.mock('../../../hooks/useCachedCloudNames', () => ({ useCachedCloudNames: () => cachedNames }));

import { useOwnedClouds } from './useOwnedClouds';

beforeEach(() => {
    clouds = [
        { id: 'CL1', name: 'Lemon' },
        { id: 'CL2', name: 'Lime' },
    ];
    cachedNames = {};
});

describe('useOwnedClouds', () => {
    // Closing the profile screen remounts the list into the window where the relay still answers
    // with the old name; the name the rename cached is the one to show.
    it('names a cloud by its cached name over the catalog name', () => {
        cachedNames = { CL1: 'Orange' };

        const { result } = renderHook(() => useOwnedClouds());

        expect(result.current.clouds.map(c => c.name)).toEqual(['Orange', 'Lime']);
    });

    it('keeps the catalog name when nothing is cached', () => {
        const { result } = renderHook(() => useOwnedClouds());

        expect(result.current.clouds.map(c => c.name)).toEqual(['Lemon', 'Lime']);
        expect(result.current.hasCloudCatalog).toBe(true);
    });
});
