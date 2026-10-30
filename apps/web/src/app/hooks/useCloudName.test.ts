import { renderHook } from '@testing-library/react';

import { cloudDisplayName, useCloudName } from './useCloudName';

jest.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: [{ id: '1000002', name: 'Lemon' }] }),
}));
jest.mock('./useCachedCloudNames', () => ({ useCachedCloudNames: () => ({ '1000009': 'Lime' }) }));

describe('cloudDisplayName', () => {
    const catalog = [
        { id: '1000002', name: 'Lemon' },
        { id: '1000004', name: '' },
    ];

    it('prefers the cached name over the catalog name', () => {
        expect(cloudDisplayName('1000002', { '1000002': 'Lemon (renamed)' }, catalog)).toBe('Lemon (renamed)');
    });

    it('names an invited cloud, which only the cache knows', () => {
        expect(cloudDisplayName('1000009', { '1000009': 'Lime' }, catalog)).toBe('Lime');
    });

    it('falls back to the catalog name, then to the id', () => {
        expect(cloudDisplayName('1000002', {}, catalog)).toBe('Lemon');
        expect(cloudDisplayName('1000004', {}, catalog)).toBe('1000004');
        expect(cloudDisplayName('1000010', {}, catalog)).toBe('1000010');
    });

    it('is empty without an id', () => {
        expect(cloudDisplayName(undefined, { '1000002': 'Lemon' }, catalog)).toBe('');
    });
});

describe('useCloudName', () => {
    it('reads the catalog and the cache together', () => {
        const { result } = renderHook(() => useCloudName());

        expect(result.current('1000002')).toBe('Lemon');
        expect(result.current('1000009')).toBe('Lime');
    });
});
