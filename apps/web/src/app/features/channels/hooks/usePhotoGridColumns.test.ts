import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { setPhotoGridColumns, usePhotoGridColumns } from './usePhotoGridColumns';

jest.mock('@chatic/config', () => ({
    config: { get: jest.fn(), set: jest.fn() },
}));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: jest.fn(),
}));

const mockUseConfigValue = useConfigValue as jest.MockedFunction<typeof useConfigValue>;
const mockSet = config.set as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockUseConfigValue.mockReturnValue(undefined);
});

describe('usePhotoGridColumns', () => {
    it('starts at three columns when nothing is stored', () => {
        const { result } = renderHook(() => usePhotoGridColumns());
        expect(result.current.columns).toBe(3);
    });

    it('reads the stored count, clamped to what the grid draws', () => {
        mockUseConfigValue.mockReturnValue(4);
        expect(renderHook(() => usePhotoGridColumns()).result.current.columns).toBe(4);

        mockUseConfigValue.mockReturnValue(8);
        expect(renderHook(() => usePhotoGridColumns()).result.current.columns).toBe(5);

        mockUseConfigValue.mockReturnValue('2');
        expect(renderHook(() => usePhotoGridColumns()).result.current.columns).toBe(3);
    });

    it('stores a pinched count on the local lane', () => {
        setPhotoGridColumns(2);
        expect(mockSet).toHaveBeenCalledWith('ui.photoGridColumns', 2, { lane: 'local' });

        setPhotoGridColumns(1);
        expect(mockSet).toHaveBeenLastCalledWith('ui.photoGridColumns', 2, { lane: 'local' });
    });
});
