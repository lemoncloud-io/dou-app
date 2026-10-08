import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { setPhotoSendGrouped, usePhotoSendGrouping } from './usePhotoSendGrouping';

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

describe('usePhotoSendGrouping', () => {
    it('sends as one message when nothing is stored', () => {
        const { result } = renderHook(() => usePhotoSendGrouping());

        expect(mockUseConfigValue).toHaveBeenCalledWith('ui.photoSendGrouped');
        expect(result.current.grouped).toBe(true);
    });

    it('reads the stored choice, and keeps the default for anything that is not a boolean', () => {
        mockUseConfigValue.mockReturnValue(false);
        expect(renderHook(() => usePhotoSendGrouping()).result.current.grouped).toBe(false);

        mockUseConfigValue.mockReturnValue('false');
        expect(renderHook(() => usePhotoSendGrouping()).result.current.grouped).toBe(true);
    });

    it('stores the choice on the local lane', () => {
        setPhotoSendGrouped(false);
        expect(mockSet).toHaveBeenCalledWith('ui.photoSendGrouped', false, { lane: 'local' });

        renderHook(() => usePhotoSendGrouping()).result.current.setGrouped(true);
        expect(mockSet).toHaveBeenLastCalledWith('ui.photoSendGrouped', true, { lane: 'local' });
    });
});
