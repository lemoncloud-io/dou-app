import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';
import { useRelayInvites } from '../../../hooks';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('../../../hooks', () => ({ useRelayInvites: jest.fn() }));

const dismiss = jest.fn();
const undismiss = jest.fn();

describe('useLocallyCanceledInvites', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useRuntimeRepositories as jest.Mock).mockReturnValue({ invite: { dismiss, undismiss } });
        (useRelayInvites as jest.Mock).mockReturnValue({ invites: [] });
    });

    it('dismissedAt이 없는 id는 false다', () => {
        (useRelayInvites as jest.Mock).mockReturnValue({ invites: [{ id: 'invite-1', state: 'rejected' }] });

        const { result } = renderHook(() => useLocallyCanceledInvites());

        expect(result.current.isCanceled('invite-1')).toBe(false);
    });

    it('dismissedAt이 있는 id만 취소로 본다', () => {
        (useRelayInvites as jest.Mock).mockReturnValue({
            invites: [
                { id: 'invite-1', state: 'rejected', dismissedAt: 123 },
                { id: 'invite-2', state: 'pending' },
            ],
        });

        const { result } = renderHook(() => useLocallyCanceledInvites());

        expect(result.current.isCanceled('invite-1')).toBe(true);
        expect(result.current.isCanceled('invite-2')).toBe(false);
    });

    it('목록에 없는 id는 false다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        expect(result.current.isCanceled('missing')).toBe(false);
    });

    it('markCanceled는 repository.dismiss를 호출한다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        result.current.markCanceled('invite-1');

        expect(dismiss).toHaveBeenCalledWith('invite-1');
    });

    it('markCanceled는 빈 id로는 호출하지 않는다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        result.current.markCanceled('');

        expect(dismiss).not.toHaveBeenCalled();
    });

    it('clearCanceled는 repository.undismiss를 호출한다 — reconcile이 정산한 기록을 걷는 경로', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        result.current.clearCanceled('invite-1');

        expect(undismiss).toHaveBeenCalledWith('invite-1');
    });

    it('clearCanceled는 빈 id로는 호출하지 않는다', () => {
        const { result } = renderHook(() => useLocallyCanceledInvites());

        result.current.clearCanceled('');

        expect(undismiss).not.toHaveBeenCalled();
    });
});
