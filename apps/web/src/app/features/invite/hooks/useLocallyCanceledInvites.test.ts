import { act, renderHook } from '@testing-library/react';

import { useLocallyCanceledInvites, useLocallyCanceledInvitesStore } from './useLocallyCanceledInvites';

const STORAGE_KEY = 'dou.relayInvite.locallyCanceled.v1';

describe('useLocallyCanceledInvites', () => {
    beforeEach(() => {
        localStorage.clear();
        useLocallyCanceledInvitesStore.setState({ ids: new Set() });
    });

    it('처음에는 어떤 invite도 취소 처리되어 있지 않다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());
        expect(result.current.isCanceled('invite-1')).toBe(false);
    });

    it('markCanceled 후에는 isCanceled가 true를 반환한다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-1'));

        expect(result.current.isCanceled('invite-1')).toBe(true);
        expect(result.current.isCanceled('invite-2')).toBe(false);
    });

    it('같은 id를 두 번 취소 처리해도 안전하다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => {
            result.current.markCanceled('invite-1');
            result.current.markCanceled('invite-1');
        });

        expect(result.current.isCanceled('invite-1')).toBe(true);
    });

    it('localStorage에 id 배열로 영속화된다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-9'));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['invite-9']);
    });

    it('손상된 localStorage 값은 취소 이력 없음으로 취급한다', () => {
        localStorage.setItem(STORAGE_KEY, '{"not":"an array"}');
        const { result } = renderHook(() => useLocallyCanceledInvites());
        expect(result.current.isCanceled('invite-1')).toBe(false);
    });
});
