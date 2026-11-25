import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({ session: { logoutSession: vi.fn() } })
);

import { runtime } from '@chatic/runtime-react';

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

        expect(screen.getByRole('alert').textContent).toContain('Your session has expired');
        expect(runtime.session.logoutSession).not.toHaveBeenCalled();
    });

    it('다시 로그인을 눌러야 세션을 내린다 — 떠나는 시점은 관리자가 정한다', async () => {
        render(<SessionExpiredBanner />);
        act(() => authFailureNotice.raise());

        await userEvent.click(screen.getByRole('button', { name: 'Log in again' }));

        expect(runtime.session.logoutSession).toHaveBeenCalledTimes(1);
    });
});
