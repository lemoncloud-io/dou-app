import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime';
import { setPhotoSendGrouped, usePhotoSendGrouping } from './usePhotoSendGrouping';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        settings: { get: jest.fn(), set: jest.fn(), useConfigValue: jest.fn() },
    })
);

const mockUseConfigValue = runtime.settings.useConfigValue as jest.MockedFunction<
    typeof runtime.settings.useConfigValue
>;
const mockSet = runtime.settings.set as jest.Mock;

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
