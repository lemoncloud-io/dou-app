import { act, renderHook } from '@testing-library/react';

import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';

// The ids live in usePreferenceStore now, and importing it for real drags the native bridge (and its
// `import.meta` config) into this suite. Stub the same two seams the store's own test stubs.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn(() => false) }));
jest.mock('../../../stores/usePreferenceStore', () => {
    const actual = jest.requireActual('zustand');
    const store = actual.create((set: never, get: never) => ({
        canceledInviteIds: [] as string[],
        markInviteCanceled: (inviteId: string) => {
            const current = (get as unknown as () => { canceledInviteIds: string[] })().canceledInviteIds;
            if (current.includes(inviteId)) return;
            (set as unknown as (partial: object) => void)({ canceledInviteIds: [...current, inviteId] });
        },
        clearInviteCanceled: (inviteId: string) => {
            const current = (get as unknown as () => { canceledInviteIds: string[] })().canceledInviteIds;
            if (!current.includes(inviteId)) return;
            (set as unknown as (partial: object) => void)({
                canceledInviteIds: current.filter(id => id !== inviteId),
            });
        },
    }));
    return { usePreferenceStore: store };
});

const resetStore = () => usePreferenceStore.setState({ canceledInviteIds: [] } as never);

describe('useLocallyCanceledInvites', () => {
    beforeEach(resetStore);

    it('아무것도 취소하지 않았으면 false다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        expect(result.current.isCanceled('invite-1')).toBe(false);
    });

    it('markCanceled한 id만 취소로 본다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-1'));

        expect(result.current.isCanceled('invite-1')).toBe(true);
        expect(result.current.isCanceled('invite-2')).toBe(false);
    });

    it('같은 id를 두 번 표시해도 한 번만 쌓인다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-1'));
        act(() => result.current.markCanceled('invite-1'));

        expect(usePreferenceStore.getState().canceledInviteIds).toEqual(['invite-1']);
    });

    it('여러 초대를 각각 표시할 수 있다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-1'));
        act(() => result.current.markCanceled('invite-2'));

        expect(result.current.isCanceled('invite-1')).toBe(true);
        expect(result.current.isCanceled('invite-2')).toBe(true);
    });

    it('clearCanceled는 그 id만 지운다 — reconcile이 정산한 기록을 걷는 경로', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        act(() => result.current.markCanceled('invite-1'));
        act(() => result.current.markCanceled('invite-2'));
        act(() => result.current.clearCanceled('invite-1'));

        expect(result.current.isCanceled('invite-1')).toBe(false);
        expect(result.current.isCanceled('invite-2')).toBe(true);
        expect(result.current.canceledIds).toEqual(['invite-2']);
    });
});
