import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    isAuthenticated: false,
    navigate: vi.fn(),
    preview: vi.fn(),
    enter: vi.fn(),
    signOutGuest: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionAuth: () => ({ isAuthenticated: state.isAuthenticated }) } },
}));
vi.mock('../hooks/useInviteLogin', () => ({
    useInviteLogin: () => ({ preview: state.preview, enter: state.enter }),
}));
vi.mock('../hooks/useSignOutGuest', () => ({ useSignOutGuest: () => state.signOutGuest }));
vi.mock('../components', () => ({
    AuthCard: ({
        title,
        subtitle,
        children,
        onBack,
        progress,
    }: {
        title: string;
        subtitle: string;
        children: React.ReactNode;
        onBack?: () => void;
        progress?: { current: number; total: number };
    }) => (
        <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {progress && <span data-testid="progress">{`${progress.current}/${progress.total}`}</span>}
            {onBack && <button onClick={onBack}>back</button>}
            {children}
        </div>
    ),
}));

import i18n from '../../../../i18n';
import { useInviteLoginPageStore } from '../stores/useInviteLoginPageStore';
import { InviteLoginPage } from './InviteLoginPage';

const LINK = 'https://app.chatic.io/s?code=invt:1:abc&backend=https://api.eureka.codes/d1';
const previewed = { code: 'invt:1:abc', info: null, placeName: 'Design Team', inviterName: 'Mina', createdGuest: true };

// Lets the promise chains the page starts on a click finish before the next assertion.
const settle = () =>
    act(async () => {
        await Promise.resolve();
    });

const paste = () => {
    fireEvent.change(screen.getByLabelText(i18n.t('auth.invite.placeholder')), { target: { value: LINK } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.invite.continue') }));
};

describe('InviteLoginPage', () => {
    beforeEach(() => {
        useInviteLoginPageStore.getState().release();
        state.isAuthenticated = false;
        state.navigate = vi.fn();
        state.preview = vi.fn();
        state.enter = vi.fn();
        state.signOutGuest = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(cleanup);

    it('moves from paste to a preview that names the place and the inviter', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        render(<InviteLoginPage />);

        paste();

        expect(await screen.findByText('Design Team')).toBeTruthy();
        expect(screen.getByText(i18n.t('auth.invite.preview.invitedBy', { name: 'Mina' }))).toBeTruthy();
        expect(state.preview).toHaveBeenCalledWith(LINK);
        expect(state.enter).not.toHaveBeenCalled();
    });

    it('advances the progress indicator with the step', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        state.enter.mockReturnValue(new Promise(() => undefined));
        render(<InviteLoginPage />);
        expect(screen.getByTestId('progress').textContent).toBe('1/3');

        paste();
        await screen.findByText('Design Team');
        expect(screen.getByTestId('progress').textContent).toBe('2/3');

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.invite.preview.join') }));
        await settle();
        expect(screen.getByTestId('progress').textContent).toBe('3/3');
    });

    it('stays on the paste step and announces a blocked link', async () => {
        state.preview.mockResolvedValue({ error: { kind: 'used' }, createdGuest: false });
        render(<InviteLoginPage />);

        paste();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe(i18n.t('auth.invite.failed.used'));
        expect(screen.getByLabelText(i18n.t('auth.invite.placeholder'))).toBeTruthy();
        expect(screen.queryByText('Design Team')).toBeNull();
    });

    it('joins with the previewed invite and leaves once the session reads as signed in', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        state.enter.mockResolvedValue(null);
        const { rerender } = render(<InviteLoginPage />);
        paste();
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('auth.invite.preview.join') }));
        await settle();

        expect(state.enter).toHaveBeenCalledWith(previewed);
        expect(state.navigate).not.toHaveBeenCalled();

        state.isAuthenticated = true;
        rerender(<InviteLoginPage />);

        expect(state.navigate).toHaveBeenCalledWith('/');
    });

    it('returns to the preview with the reason when the exchange is rejected', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        state.enter.mockResolvedValue({ kind: 'server', message: '400 INVALID - used' });
        render(<InviteLoginPage />);
        paste();
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('auth.invite.preview.join') }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByText('Design Team')).toBeTruthy();
    });

    it('offers no way back while the lookup is running, since its guest is not known yet', async () => {
        state.preview.mockReturnValue(new Promise(() => undefined));
        render(<InviteLoginPage />);

        paste();
        await settle();

        expect(screen.queryByRole('button', { name: 'back' })).toBeNull();
    });

    it('goes back from the preview to the paste step without signing the guest out', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        render(<InviteLoginPage />);
        paste();
        await screen.findByText('Design Team');

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(screen.getByLabelText(i18n.t('auth.invite.placeholder'))).toBeTruthy();
        expect(state.signOutGuest).not.toHaveBeenCalled();
    });

    it('backing out signs out the guest the preview created', async () => {
        state.preview.mockResolvedValue({ preview: previewed });
        render(<InviteLoginPage />);
        paste();
        await screen.findByText('Design Team');
        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        fireEvent.click(screen.getByRole('button', { name: 'back' }));
        await settle();

        expect(state.signOutGuest).toHaveBeenCalledTimes(1);
        expect(useInviteLoginPageStore.getState().held).toBe(false);
    });

    it('backing out leaves a session that existed before the preview alone', async () => {
        state.preview.mockResolvedValue({ preview: { ...previewed, createdGuest: false } });
        render(<InviteLoginPage />);
        paste();
        await screen.findByText('Design Team');
        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        fireEvent.click(screen.getByRole('button', { name: 'back' }));
        await settle();

        expect(state.signOutGuest).not.toHaveBeenCalled();
        expect(state.navigate).toHaveBeenCalledWith('/auth/welcome');
    });

    it('shows a link with no place details as joinable, saying so', async () => {
        state.preview.mockResolvedValue({ preview: { code: 'invt:1:abc', info: null, createdGuest: false } });
        render(<InviteLoginPage />);

        paste();

        expect(await screen.findByText(i18n.t('auth.invite.preview.noDetails'))).toBeTruthy();
        expect(screen.getByRole('button', { name: i18n.t('auth.invite.preview.join') })).toBeTruthy();
    });
});
