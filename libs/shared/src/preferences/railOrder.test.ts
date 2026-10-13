import { jest } from '@jest/globals';

import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { normalizeRailOrder, useCloudOrder } from './railOrder';

jest.mock('@chatic/config', () => ({
    config: { get: jest.fn(), set: jest.fn() },
}));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: jest.fn(),
}));

const mockUseConfigValue = useConfigValue as jest.MockedFunction<typeof useConfigValue>;
const mockGet = config.get as jest.Mock;
const mockSet = config.set as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('normalizeRailOrder', () => {
    it('keeps the cloud ids and each cloud’s place ids', () => {
        expect(normalizeRailOrder({ clouds: ['b', 'a'], places: { a: ['p2', 'p1'] } })).toEqual({
            clouds: ['b', 'a'],
            places: { a: ['p2', 'p1'] },
        });
    });

    it('reads anything that is not the stored shape as no order', () => {
        for (const value of [null, undefined, 'x', 3, ['a'], { clouds: 'a', places: ['p'] }]) {
            expect(normalizeRailOrder(value)).toEqual({ clouds: [], places: {} });
        }
    });

    it('drops non-string, empty and repeated ids, and a cloud left with no places', () => {
        expect(
            normalizeRailOrder({ clouds: ['a', 1, '', 'a', 'b'], places: { a: ['p', 'p', null], b: [], c: 'p' } })
        ).toEqual({ clouds: ['a', 'b'], places: { a: ['p'] } });
    });
});

describe('useCloudOrder', () => {
    it('reads the stored cloud order', () => {
        mockUseConfigValue.mockReturnValue({ clouds: ['b', 'a'] });

        const { result } = renderHook(() => useCloudOrder());

        expect(result.current.storedIds).toEqual(['b', 'a']);
    });

    it('reads a corrupt value as no order', () => {
        mockUseConfigValue.mockReturnValue('broken');

        const { result } = renderHook(() => useCloudOrder());

        expect(result.current.storedIds).toEqual([]);
    });

    // The rail can be showing part of the list (the catalog read failed, a source is late). A drag
    // then must not cost the clouds that are not on screen their place.
    it('keeps a stored cloud that is not on the rail, after the cloud it followed, when the others are reordered', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        mockGet.mockReturnValue({ clouds: ['a', 'hidden', 'b', 'c'] });

        const { result } = renderHook(() => useCloudOrder());
        result.current.set(['c', 'a', 'new', 'b']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.railOrder',
            { clouds: ['c', 'a', 'hidden', 'new', 'b'], places: {} },
            { lane: 'local' }
        );
    });

    it('writes the cloud order and keeps the place orders beside it', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        mockGet.mockReturnValue({ clouds: ['a'], places: { a: ['p1'] } });

        const { result } = renderHook(() => useCloudOrder());
        result.current.set(['b', 'a', 'b']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.railOrder',
            { clouds: ['b', 'a'], places: { a: ['p1'] } },
            { lane: 'local' }
        );
    });
});
