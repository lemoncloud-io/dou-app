import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import '../../../../i18n';

import { useWelcomeStore, welcomeKey } from '../../../shared';
import { shouldShowWelcome, welcomeProgress, type WelcomeSignals } from '../utils';
import { WelcomePage } from './WelcomePage';

const NONE: WelcomeSignals = { ownsChannel: false, invited: false, hasDm: false, hasProfile: false };

const renderPage = (signals: Partial<WelcomeSignals> = {}, actions: Partial<Parameters<typeof WelcomePage>[0]> = {}) => {
    const props = {
        placeName: 'Lemon',
        signals: { ...NONE, ...signals },
        onCreateChannel: vi.fn(),
        onInvite: vi.fn(),
        onStartDm: vi.fn(),
        onEditProfile: vi.fn(),
        onLater: vi.fn(),
        ...actions,
    };
    render(<WelcomePage {...props} />);
    return props;
};

const step = (name: RegExp) => screen.getByRole('button', { name });

const channel = (over: Partial<DomainChannel>) => ({ id: 'c', name: 'general', stereo: 'public', ...over }) as DomainChannel;

beforeEach(() => {
    useWelcomeStore.setState({ dismissed: {}, invited: {} });
});

describe('WelcomePage', () => {
    it('welcomes the reader to the place with four steps, none done', () => {
        renderPage();

        expect(screen.getByRole('heading', { name: 'Welcome to Lemon' })).toBeTruthy();
        expect(screen.getByText('0/4 done')).toBeTruthy();
        for (const name of [/Create a channel/, /Invite members/, /Send a DM/, /Set up your profile/]) {
            expect(step(name)).toBeTruthy();
        }
    });

    it('counts the steps the place already shows done, and marks each one', () => {
        renderPage({ invited: true, hasProfile: true });

        expect(screen.getByText('2/4 done')).toBeTruthy();
        expect(step(/Invite members/).textContent).toContain('Done');
        expect(step(/Set up your profile/).textContent).toContain('Done');
        expect(step(/Create a channel/).textContent).not.toContain('Done');
    });

    it('takes each step to where it is done, and offers none that cannot be taken here', () => {
        const props = renderPage({}, { onStartDm: undefined });

        fireEvent.click(step(/Create a channel/));
        fireEvent.click(step(/Invite members/));
        fireEvent.click(step(/Set up your profile/));

        expect(props.onCreateChannel).toHaveBeenCalled();
        expect(props.onInvite).toHaveBeenCalled();
        expect(props.onEditProfile).toHaveBeenCalled();
        expect(step(/Send a DM/).hasAttribute('disabled')).toBe(true);
    });

    it('puts the page away on Later', () => {
        const props = renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Later' }));

        expect(props.onLater).toHaveBeenCalled();
    });
});

describe('welcomeProgress', () => {
    it('counts each signal once', () => {
        expect(welcomeProgress(NONE).done).toBe(0);
        expect(welcomeProgress({ ownsChannel: true, invited: true, hasDm: true, hasProfile: true }).done).toBe(4);
        expect(welcomeProgress({ ...NONE, hasDm: true }).steps.find(s => s.key === 'dm')?.done).toBe(true);
    });
});

describe('shouldShowWelcome', () => {
    const base = { isDefaultMode: false, hasPlace: true, isLoading: false, channels: [], dismissed: false };

    it('shows for a place with no channel and no 1:1, my notes-to-self room aside', () => {
        expect(shouldShowWelcome(base)).toBe(true);
        expect(shouldShowWelcome({ ...base, channels: [channel({ id: 's', stereo: 'self', name: '' })] })).toBe(true);
    });

    it('steps aside once the place has a channel or a 1:1', () => {
        expect(shouldShowWelcome({ ...base, channels: [channel({})] })).toBe(false);
        expect(
            shouldShowWelcome({ ...base, channels: [channel({ id: 'd', stereo: 'dm', name: '', memberIds: ['me', 'ada'] })] })
        ).toBe(false);
    });

    it('never shows in the default cloud, without a place, while the list loads, or once put away', () => {
        expect(shouldShowWelcome({ ...base, isDefaultMode: true })).toBe(false);
        expect(shouldShowWelcome({ ...base, hasPlace: false })).toBe(false);
        expect(shouldShowWelcome({ ...base, isLoading: true })).toBe(false);
        expect(shouldShowWelcome({ ...base, dismissed: true })).toBe(false);
    });
});

describe('useWelcomeStore', () => {
    it('keeps Later and a sent invite for that place and that person only', () => {
        useWelcomeStore.getState().dismiss(welcomeKey('me', 'P1'));
        useWelcomeStore.getState().markInvited(welcomeKey('me', 'P1'));

        const { dismissed, invited } = useWelcomeStore.getState();
        expect(dismissed[welcomeKey('me', 'P1')]).toBe(true);
        expect(dismissed[welcomeKey('me', 'P2')]).toBeUndefined();
        expect(dismissed[welcomeKey('ada', 'P1')]).toBeUndefined();
        expect(invited[welcomeKey('me', 'P1')]).toBe(true);
    });
});
