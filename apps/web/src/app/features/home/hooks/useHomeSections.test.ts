import { act, renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { setHomeSectionOpen, useHomeSections } from './useHomeSections';

jest.mock('@chatic/config', () => ({
    config: { get: jest.fn(), set: jest.fn() },
}));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: jest.fn(),
}));

const mockUseConfigValue = useConfigValue as jest.MockedFunction<typeof useConfigValue>;
const mockGet = config.get as jest.Mock;
const mockSet = config.set as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockUseConfigValue.mockReturnValue(undefined);
    mockGet.mockReturnValue(undefined);
});

describe('useHomeSections', () => {
    it('reports every section open when nothing is stored', () => {
        const { result } = renderHook(() => useHomeSections());

        expect(result.current.isOpen('places')).toBe(true);
        expect(result.current.isOpen('channels')).toBe(true);
        expect(result.current.isOpen('cloudDm')).toBe(true);
    });

    it('reports a stored section as collapsed and leaves the others open', () => {
        mockUseConfigValue.mockReturnValue({ channels: true });

        const { result } = renderHook(() => useHomeSections());

        expect(result.current.isOpen('channels')).toBe(false);
        expect(result.current.isOpen('places')).toBe(true);
    });

    it('treats a corrupt stored value as every section open', () => {
        mockUseConfigValue.mockReturnValue('collapsed');

        const { result } = renderHook(() => useHomeSections());

        expect(result.current.isOpen('places')).toBe(true);
    });

    it('writes a fold through setOpen to the local lane', () => {
        const { result } = renderHook(() => useHomeSections());

        act(() => result.current.setOpen('places', false));

        expect(mockSet).toHaveBeenCalledWith('ui.homeSectionsCollapsed', { places: true }, { lane: 'local' });
    });
});

describe('setHomeSectionOpen', () => {
    it('adds a collapsed section without dropping the ones already stored', () => {
        mockGet.mockReturnValue({ places: true });

        setHomeSectionOpen('cloudDm', false);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.homeSectionsCollapsed',
            { places: true, cloudDm: true },
            { lane: 'local' }
        );
    });

    it('removes the entry when a section is opened again', () => {
        mockGet.mockReturnValue({ places: true, channels: true });

        setHomeSectionOpen('channels', true);

        expect(mockSet).toHaveBeenCalledWith('ui.homeSectionsCollapsed', { places: true }, { lane: 'local' });
    });

    it('reads the stored record at write time, not the one a render captured', () => {
        // Two toggles in the same tick: the second must see the first one's write.
        mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce({ places: true });

        setHomeSectionOpen('places', false);
        setHomeSectionOpen('channels', false);

        expect(mockSet).toHaveBeenLastCalledWith(
            'ui.homeSectionsCollapsed',
            { places: true, channels: true },
            { lane: 'local' }
        );
    });
});
