import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import { ActiveCloudDataContext, type ActiveCloudData } from './activeCloudDataContext';
import { useActiveCloudUnreads } from './useActiveCloudUnreads';

// 이 훅은 공유 관측(ActiveCloudDataProvider)의 집계를 읽을 뿐이다. 집계를 실제로 만드는 조립
// (채널 → 관측 전용 join → useChannelUnreads)은 ActiveCloudDataProvider.test.tsx가 고정한다.
describe('useActiveCloudUnreads — 공유 집계 읽기', () => {
    it('컨텍스트의 unreads를 그대로 돌려준다', () => {
        const unreads = { byChannel: { c1: 2 }, byPlace: { s1: 4 }, total: 4 };
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(
                ActiveCloudDataContext.Provider,
                { value: { channels: [], isLoaded: true, myJoins: new Map(), unreads } as ActiveCloudData },
                children
            );

        const { result } = renderHook(() => useActiveCloudUnreads(), { wrapper });

        expect(result.current).toBe(unreads);
    });

    it('프로바이더가 없으면 던진다', () => {
        expect(() => renderHook(() => useActiveCloudUnreads())).toThrow(/ActiveCloudDataProvider is missing/);
    });
});
