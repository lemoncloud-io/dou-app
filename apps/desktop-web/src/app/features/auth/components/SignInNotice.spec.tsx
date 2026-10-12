import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    notice: null as { provider: string; isNew: boolean } | null,
    name: 'Tak' as string | undefined,
    verified: true,
    toast: vi.fn(),
    signOut: vi.fn(),
}));

vi.mock('../utils/signInNotice', () => ({ takeSignInNotice: () => state.notice }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: state.toast }));
vi.mock('../hooks/useSignOutGuest', () => ({ useSignOutGuest: () => state.signOut }));
vi.mock('../../../shared', () => ({
    isPlaceholderName: (name?: string) => !name,
    useRelayAccount: () => ({ account: { name: state.name }, isRelayVerified: state.verified }),
}));
vi.mock('./NewAccountName', () => ({
    NewAccountName: ({ onDone, secondary }: { onDone: () => void; secondary: React.ReactNode }) => (
        <div>
            <button type="button" onClick={onDone}>
                name step
            </button>
            {secondary}
        </div>
    ),
}));

import i18n from '../../../../i18n';
import { SignInNotice } from './SignInNotice';

describe('SignInNotice', () => {
    beforeEach(() => {
        state.notice = null;
        state.name = 'Tak';
        state.verified = true;
        state.toast.mockReset();
        state.signOut.mockReset().mockResolvedValue(undefined);
    });
    afterEach(cleanup);

    it('says nothing without a sign-in to report', () => {
        render(<SignInNotice />);

        expect(state.toast).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('names the existing account a Google sign-in landed in', () => {
        state.notice = { provider: 'google', isNew: false };
        render(<SignInNotice />);

        expect(state.toast).toHaveBeenCalledWith({ description: i18n.t('auth.social.signedInAs', { name: 'Tak' }) });
    });

    it('waits for the relay before naming the account', () => {
        state.notice = { provider: 'google', isNew: false };
        state.verified = false;
        const { rerender } = render(<SignInNotice />);
        expect(state.toast).not.toHaveBeenCalled();

        state.verified = true;
        rerender(<SignInNotice />);

        expect(state.toast).toHaveBeenCalledTimes(1);
    });

    it('stops on a new account, asking its name, and closes when that is done', () => {
        state.notice = { provider: 'google', isNew: true };
        render(<SignInNotice />);

        expect(screen.getByRole('dialog').textContent).toContain(i18n.t('auth.social.newAccountBody'));
        fireEvent.click(screen.getByRole('button', { name: 'name step' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('is not dismissed by Escape, so "not my account" stays in reach', () => {
        state.notice = { provider: 'google', isNew: true };
        render(<SignInNotice />);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('logs out of a new account that is not the one meant', async () => {
        state.notice = { provider: 'google', isNew: true };
        render(<SignInNotice />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.social.notMine') }));
        });

        expect(state.signOut).toHaveBeenCalled();
    });
});
