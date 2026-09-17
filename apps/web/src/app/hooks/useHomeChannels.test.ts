import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from './activeCloudDataContext';
import { useHomeChannels } from './useHomeChannels';

const channel = (id: string, sid: string): DomainChannel => ({ id, sid }) as unknown as DomainChannel;

/** The shared observation this hook slices — no repositories involved (see ActiveCloudDataProvider). */
const wrapper =
    (channels: DomainChannel[], isLoaded = true) =>
    ({ children }: { children: ReactNode }) =>
        createElement(
            ActiveCloudDataContext.Provider,
            {
                value: {
                    channels,
                    isLoaded,
                    myJoins: new Map(),
                    unreads: { byChannel: {}, byPlace: {}, total: 0 },
                } as ActiveCloudData,
            },
            children
        );

describe('useHomeChannels — 공유 관측의 사이트별 슬라이스', () => {
    it('활성 sid의 행만 남긴다', () => {
        const { result } = renderHook(() => useHomeChannels('s1'), {
            wrapper: wrapper([channel('c1', 's1'), channel('c2', 's2'), channel('c3', 's1')]),
        });

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c3']);
        expect(result.current.isLoading).toBe(false);
    });

    // The cloud-wide read is not isolated by sid (on the relay the sid scope is ignored entirely) —
    // that's why the filter is still here. Filtering in JS instead of opening a second observer.
    it('sid가 없으면 빈 목록이다', () => {
        const { result } = renderHook(() => useHomeChannels(null), {
            wrapper: wrapper([channel('c1', 's1')]),
        });

        expect(result.current.channels).toEqual([]);
    });

    it('사이트 전환 시 같은 목록에서 다른 조각을 낸다 (재구독 없음)', () => {
        const { result, rerender } = renderHook(({ sid }) => useHomeChannels(sid), {
            wrapper: wrapper([channel('c1', 's1'), channel('c2', 's2')]),
            initialProps: { sid: 's1' },
        });
        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);

        rerender({ sid: 's2' });

        expect(result.current.channels.map(c => c.id)).toEqual(['c2']);
    });

    it('같은 입력에는 같은 배열 참조를 유지한다 (소비자 재계산 방지)', () => {
        const { result, rerender } = renderHook(() => useHomeChannels('s1'), {
            wrapper: wrapper([channel('c1', 's1')]),
        });
        const first = result.current.channels;

        rerender();

        expect(result.current.channels).toBe(first);
    });

    // A site with no channels and a site whose first response hasn't landed yet can't be told apart
    // from the array alone — the shared observation's isLoaded is what makes that distinction.
    it('isLoading은 공유 관측의 첫 응답 여부를 따른다', () => {
        const { result } = renderHook(() => useHomeChannels('s1'), { wrapper: wrapper([], false) });

        expect(result.current.channels).toEqual([]);
        expect(result.current.isLoading).toBe(true);
    });

    it('sid가 없으면 아직 안 읽혔어도 로딩이 아니다 (보여줄 사이트가 없다)', () => {
        const { result } = renderHook(() => useHomeChannels(null), { wrapper: wrapper([], false) });

        expect(result.current.isLoading).toBe(false);
    });
});
