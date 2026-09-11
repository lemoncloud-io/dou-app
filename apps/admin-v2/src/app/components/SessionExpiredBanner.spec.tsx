/**
 * `components/SessionExpiredBanner.spec.tsx`
 *
 * The banner exists so a server-confirmed expiry no longer THROWS an admin out of the screen they
 * were working on. So the cases here are mostly about what it does not do: it renders nothing
 * until the notice is raised, and clicking away is the admin's choice, not an automatic redirect.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/app-runtime', () => ({
    runtime: { session: { logoutSession: vi.fn() } },
}));

import { runtime } from '@chatic/app-runtime';

import { authFailureNotice } from '../session/authFailureNotice';
import { SessionExpiredBanner } from './SessionExpiredBanner';

beforeEach(() => {
    vi.clearAllMocks();
    authFailureNotice.clear();
});

describe('SessionExpiredBanner', () => {
    it('평소에는 아무것도 그리지 않는다', () => {
        const { container } = render(<SessionExpiredBanner />);

        expect(container.innerHTML).toBe('');
    });

    it('만료가 알려지면 배너가 뜬다 — 화면을 뺏지 않고', () => {
        render(<SessionExpiredBanner />);

        act(() => authFailureNotice.raise());

        expect(screen.getByRole('alert').textContent).toContain('세션이 만료되었습니다');
        expect(runtime.session.logoutSession).not.toHaveBeenCalled();
    });

    it('다시 로그인을 눌러야 세션을 내린다 — 떠나는 시점은 관리자가 정한다', async () => {
        render(<SessionExpiredBanner />);
        act(() => authFailureNotice.raise());

        await userEvent.click(screen.getByRole('button', { name: '다시 로그인' }));

        expect(runtime.session.logoutSession).toHaveBeenCalledTimes(1);
    });
});
