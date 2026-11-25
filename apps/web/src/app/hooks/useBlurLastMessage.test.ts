import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';
import { useBlurLastMessage } from './useBlurLastMessage';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        settings: { set: jest.fn(), useConfigValue: jest.fn() },
    })
);

const mockUseConfigValue = runtime.settings.useConfigValue as jest.MockedFunction<
    typeof runtime.settings.useConfigValue
>;
const mockSet = runtime.settings.set as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useBlurLastMessage', () => {
    it('설정값을 그대로 돌려준다', () => {
        mockUseConfigValue.mockReturnValue(true);
        const { result } = renderHook(() => useBlurLastMessage());
        expect(result.current.blurLastMessage).toBe(true);
    });

    it('값이 없으면 false다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => useBlurLastMessage());
        expect(result.current.blurLastMessage).toBe(false);
    });

    it('setBlurLastMessage는 shell 레인으로 쓴다', () => {
        const { result } = renderHook(() => useBlurLastMessage());
        result.current.setBlurLastMessage(true);
        expect(mockSet).toHaveBeenCalledWith('ui.blurLastMessage', true, { lane: 'shell' });
    });
});
