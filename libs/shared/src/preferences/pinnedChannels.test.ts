import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import {
    normalizePinnedChannels,
    parsePinnedChannels,
    setChannelPinned,
    setPinnedChannelOrder,
    usePinnedChannels,
} from './pinnedChannels';

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

describe('normalizePinnedChannels / parsePinnedChannels', () => {
    it('cid:sid 스코프의 비어있지 않은 문자열 배열만 남긴다', () => {
        expect(normalizePinnedChannels({ 'cloud-1:place-1': ['ch-1', 'ch-2'] })).toEqual({
            'cloud-1:place-1': ['ch-1', 'ch-2'],
        });
    });

    it('cid 없이 저장된 레거시 항목은 버린다', () => {
        expect(normalizePinnedChannels({ 'place-1': ['ch-legacy'], 'cloud-1:place-1': ['ch-1'] })).toEqual({
            'cloud-1:place-1': ['ch-1'],
        });
    });

    it('빈 배열이 되는 스코프는 맵에서 아예 뺀다', () => {
        expect(normalizePinnedChannels({ 'cloud-1:place-1': [] })).toEqual({});
    });

    it('배열이 아닌 값이나 비문자열 항목은 걸러낸다', () => {
        expect(normalizePinnedChannels({ 'cloud-1:place-1': 'not-an-array' })).toEqual({});
        expect(normalizePinnedChannels({ 'cloud-1:place-1': ['ch-1', 42, ''] })).toEqual({
            'cloud-1:place-1': ['ch-1'],
        });
    });

    it('손상된 JSON 문자열은 빈 맵으로 폴백한다', () => {
        expect(parsePinnedChannels('not json')).toEqual({});
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

describe('setPinnedChannelOrder', () => {
    it('새 순서를 그대로 local 레인에 쓴다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1', 'ch-2', 'ch-3'] });

        setPinnedChannelOrder('cloud-1:place-1', ['ch-3', 'ch-1']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.pinnedChannels',
            { 'cloud-1:place-1': ['ch-3', 'ch-1'] },
            { lane: 'local' }
        );
    });

    it('고정되지 않은 id를 몰래 고정하지 않는다 — 드래그는 순서만 바꾼다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });

        setPinnedChannelOrder('cloud-1:place-1', ['ch-1', 'ch-9']);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { 'cloud-1:place-1': ['ch-1'] }, { lane: 'local' });
    });

    it('다른 스코프의 고정은 보존한다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1', 'ch-2'], 'cloud-2:place-2': ['ch-9'] });

        setPinnedChannelOrder('cloud-1:place-1', ['ch-2', 'ch-1']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.pinnedChannels',
            { 'cloud-1:place-1': ['ch-2', 'ch-1'], 'cloud-2:place-2': ['ch-9'] },
            { lane: 'local' }
        );
    });
});

describe('usePinnedChannels(scope)', () => {
    it('스코프의 순서있는 id 배열만 돌려준다', () => {
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-2', 'ch-1'], 'cloud-2:place-2': ['ch-9'] });
        const { result } = renderHook(() => usePinnedChannels('cloud-1:place-1'));
        expect(result.current.pinnedIds).toEqual(['ch-2', 'ch-1']);
    });

    it('null 스코프(클라우드·플레이스 미확정)에서는 빈 배열이다', () => {
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });
        const { result } = renderHook(() => usePinnedChannels(null));
        expect(result.current.pinnedIds).toEqual([]);
    });

    it('값이 없으면 빈 배열이다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => usePinnedChannels('cloud-1:place-1'));
        expect(result.current.pinnedIds).toEqual([]);
    });

    it('toggle은 고정 여부를 뒤집는다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });
        const { result } = renderHook(() => usePinnedChannels('cloud-1:place-1'));

        result.current.toggle('ch-1');
        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', {}, { lane: 'local' });

        mockGet.mockReturnValue({});
        result.current.toggle('ch-2');
        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { 'cloud-1:place-1': ['ch-2'] }, { lane: 'local' });
    });

    it('null 스코프에서는 toggle도 reorder도 아무것도 쓰지 않는다', () => {
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });
        const { result } = renderHook(() => usePinnedChannels(null));

        result.current.toggle('ch-1');
        result.current.reorder(['ch-1']);

        expect(mockSet).not.toHaveBeenCalled();
    });

    it('reorder는 setPinnedChannelOrder로 위임한다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1', 'ch-2'] });
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-1', 'ch-2'] });
        const { result } = renderHook(() => usePinnedChannels('cloud-1:place-1'));

        result.current.reorder(['ch-2', 'ch-1']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.pinnedChannels',
            { 'cloud-1:place-1': ['ch-2', 'ch-1'] },
            { lane: 'local' }
        );
    });
});
