import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { useBlurLastMessage } from './useBlurLastMessage';

jest.mock('@chatic/config', () => ({
    config: { set: jest.fn() },
}));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: jest.fn(),
}));

const mockUseConfigValue = useConfigValue as jest.MockedFunction<typeof useConfigValue>;
const mockSet = config.set as jest.Mock;

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
