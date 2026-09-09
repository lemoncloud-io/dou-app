import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { setChannelPinned, usePinnedChannels } from './usePinnedChannels';

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

describe('usePinnedChannels', () => {
    it('cid 없이 저장된 레거시 항목은 걸러낸다', () => {
        mockUseConfigValue.mockReturnValue({ 'place-1': ['ch-legacy'], 'cloud-1:place-1': ['ch-1'] });
        const { result } = renderHook(() => usePinnedChannels());
        expect(result.current.pinnedChannels).toEqual({ 'cloud-1:place-1': ['ch-1'] });
    });

    it('값이 없으면 빈 맵이다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => usePinnedChannels());
        expect(result.current.pinnedChannels).toEqual({});
    });
});

describe('setChannelPinned', () => {
    it('고정하면 현재 맵에 채널을 추가해 local 레인으로 쓴다', () => {
        mockGet.mockReturnValue({});

        setChannelPinned('cloud-1:place-1', 'ch-1', true);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { 'cloud-1:place-1': ['ch-1'] }, { lane: 'local' });
    });

    it('같은 채널을 두 번 고정해도 중복되지 않는다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });

        setChannelPinned('cloud-1:place-1', 'ch-1', true);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { 'cloud-1:place-1': ['ch-1'] }, { lane: 'local' });
    });

    it('해제하면 해당 채널만 목록에서 빠진다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1', 'ch-2'] });

        setChannelPinned('cloud-1:place-1', 'ch-1', false);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { 'cloud-1:place-1': ['ch-2'] }, { lane: 'local' });
    });

    it('마지막 고정을 해제하면 스코프 항목 자체를 지운다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });

        setChannelPinned('cloud-1:place-1', 'ch-1', false);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', {}, { lane: 'local' });
    });

    it('다른 클라우드·플레이스의 고정 목록을 덮어쓰지 않고 병합한다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });

        setChannelPinned('cloud-2:place-2', 'ch-2', true);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.pinnedChannels',
            { 'cloud-1:place-1': ['ch-1'], 'cloud-2:place-2': ['ch-2'] },
            { lane: 'local' }
        );
    });
});
