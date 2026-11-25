import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';
import { setChannelSort, useChannelSort } from './useChannelSort';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        settings: { get: jest.fn(), set: jest.fn(), useConfigValue: jest.fn() },
    })
);

const mockUseConfigValue = runtime.settings.useConfigValue as jest.MockedFunction<
    typeof runtime.settings.useConfigValue
>;
const mockGet = runtime.settings.get as jest.Mock;
const mockSet = runtime.settings.set as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useChannelSort', () => {
    it('cid 없이 저장된 레거시 항목은 걸러낸다', () => {
        mockUseConfigValue.mockReturnValue({ 'place-1': 'unread', 'cloud-1:place-1': 'unread' });
        const { result } = renderHook(() => useChannelSort());
        expect(result.current.channelSort).toEqual({ 'cloud-1:place-1': 'unread' });
    });

    it('값이 없으면 빈 맵이다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => useChannelSort());
        expect(result.current.channelSort).toEqual({});
    });
});

describe('setChannelSort', () => {
    it('현재 맵을 읽어 병합한 뒤 local 레인으로 쓴다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': 'unread' });

        setChannelSort('cloud-2:place-2', 'recent');

        expect(mockSet).toHaveBeenCalledWith(
            'ui.channelSort',
            { 'cloud-1:place-1': 'unread', 'cloud-2:place-2': 'recent' },
            { lane: 'local' }
        );
    });

    it('같은 스코프를 다시 설정하면 값이 교체된다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': 'unread' });

        setChannelSort('cloud-1:place-1', 'recent');

        expect(mockSet).toHaveBeenCalledWith('ui.channelSort', { 'cloud-1:place-1': 'recent' }, { lane: 'local' });
    });
});
