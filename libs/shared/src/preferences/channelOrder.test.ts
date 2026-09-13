import { jest } from '@jest/globals';

import { renderHook } from '@testing-library/react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import {
    applyChannelOrder,
    moveChannel,
    normalizeChannelOrder,
    setChannelOrder,
    useChannelOrder,
} from './channelOrder';

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

describe('applyChannelOrder', () => {
    it('저장된 순서를 먼저 유지하고, 모르는 id는 들어온(이름) 순서대로 뒤에 붙는다', () => {
        // 저장: [c] — 현재 목록: a, b, c (이름 순). c가 앞에 머물고 나머지는 이름 순 유지.
        expect(applyChannelOrder(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b']);
    });

    it('저장됐지만 지금 목록에 없는 id는 버린다', () => {
        expect(applyChannelOrder(['a', 'b', 'c'], ['x', 'b'])).toEqual(['b', 'a', 'c']);
    });

    it('저장값이 없으면 들어온 순서 그대로다', () => {
        expect(applyChannelOrder(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c']);
    });
});

describe('moveChannel', () => {
    it('현재 목록에 없는 id를 order에서 가지런히 잘라낸다', () => {
        // 'gone'은 더 이상 존재하지 않는 채널 — 이동 한 번에 함께 정리된다.
        expect(moveChannel(['a', 'b', 'gone', 'c'], 'c', 0, ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    });

    it('toIndex를 양끝으로 클램프한다', () => {
        expect(moveChannel(['a', 'b', 'c'], 'c', -5, ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
        expect(moveChannel(['a', 'b', 'c'], 'a', 99, ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
    });

    it('이동할 id가 목록에 없으면 정리만 하고 순서를 바꾸지 않는다', () => {
        expect(moveChannel(['a', 'b', 'ghost'], 'ghost', 0, ['a', 'b'])).toEqual(['a', 'b']);
    });
});

describe('normalizeChannelOrder', () => {
    it('cid:sid 스코프의 비어있지 않은 문자열 배열만 남긴다', () => {
        expect(
            normalizeChannelOrder({
                'cloud-1:place-1': ['ch-2', 'ch-1'],
                'place-1': ['ch-9'], // bare placeId — 어느 클라우드의 것인지 몰라 버린다
                'cloud-2:place-2': ['ch-3', 42, null, ''], // non-string/빈 문자열 제거
                'cloud-3:place-3': [], // 빈 배열 스코프는 저장하지 않는다
                'cloud-4:place-4': 'nope', // 배열 아님
            })
        ).toEqual({ 'cloud-1:place-1': ['ch-2', 'ch-1'], 'cloud-2:place-2': ['ch-3'] });
    });

    it('중복 id는 하나만 남긴다 — 손으로 고친 기록이 React/dnd-kit 키를 복제하지 않는다', () => {
        expect(normalizeChannelOrder({ 'cloud-1:place-1': ['ch-1', 'ch-2', 'ch-1'] })).toEqual({
            'cloud-1:place-1': ['ch-1', 'ch-2'],
        });
    });

    it('객체가 아니면 빈 값이다', () => {
        expect(normalizeChannelOrder(undefined)).toEqual({});
        expect(normalizeChannelOrder([['cloud-1:place-1', ['ch-1']]])).toEqual({});
    });
});

describe('setChannelOrder / useChannelOrder(scope)', () => {
    it('한 스코프의 전체 순서를 기록하고 다른 스코프는 보존한다', () => {
        mockGet.mockReturnValue({
            'cloud-1:place-1': ['ch-1'],
            'cloud-2:place-2': ['ch-9'],
        });

        setChannelOrder('cloud-1:place-1', ['ch-3', 'ch-1', 'ch-2']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.channelOrder',
            { 'cloud-1:place-1': ['ch-3', 'ch-1', 'ch-2'], 'cloud-2:place-2': ['ch-9'] },
            { lane: 'local' }
        );
    });

    it('빈 순서는 스코프째 지운다 — 저장 맵을 최소로 유지', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });

        setChannelOrder('cloud-1:place-1', []);

        expect(mockSet).toHaveBeenCalledWith('ui.channelOrder', {}, { lane: 'local' });
    });

    it('null 스코프(클라우드·플레이스 미확정)에서는 빈 배열이고 기록도 없다', () => {
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-1'] });
        const { result } = renderHook(() => useChannelOrder(null));

        expect(result.current.storedIds).toEqual([]);
        result.current.set([]);
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('스코프의 저장 순서를 돌려주고 set이 그 스코프만 다시 쓴다', () => {
        mockGet.mockReturnValue({ 'cloud-1:place-1': ['ch-2', 'ch-1'] });
        mockUseConfigValue.mockReturnValue({ 'cloud-1:place-1': ['ch-2', 'ch-1'] });
        const { result } = renderHook(() => useChannelOrder('cloud-1:place-1'));

        expect(result.current.storedIds).toEqual(['ch-2', 'ch-1']);
        result.current.set(['ch-1', 'ch-2']);
        expect(mockSet).toHaveBeenCalledWith(
            'ui.channelOrder',
            { 'cloud-1:place-1': ['ch-1', 'ch-2'] },
            { lane: 'local' }
        );
    });
});
