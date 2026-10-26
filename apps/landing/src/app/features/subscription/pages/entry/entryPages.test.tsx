import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../../i18n';
import { createMockPort } from '../../lib/mock';
import { memoryStateStore } from '../../lib/mock/storage';
import { SubscriptionRoutes } from '../../routes';

import type { PortSetup } from '../../lib/createPortSetup';

// jsdom has no matchMedia; these pages are drawn at desktop width.
beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await i18n.changeLanguage('en');
});

const mockSetup = (search: string): PortSetup => {
    const { port, clock, controller } = createMockPort({
        store: memoryStateStore(),
        readSearch: () => `${search}&panel=0`,
        delayMs: 0,
    });
    return { port, clock, mock: controller };
};

const Where = () => {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
};

const renderAt = (url: string, setup: PortSetup, { strict = false } = {}) => {
    const tree = (
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/subscription/*" element={<SubscriptionRoutes setup={setup} />} />
            </Routes>
            <Where />
        </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const where = () => screen.getByTestId('where').textContent;

describe('W-01 plans', () => {
    it('offers a visitor the entry plan and sends them to sign in on the way to checkout', async () => {
        const setup = mockSetup('?mock=visitor');
        const listSubscriptions = vi.spyOn(setup.port, 'listSubscriptions');
        renderAt('/subscription/plans', setup);

        expect(await screen.findByRole('heading', { name: 'DoU plans' })).toBeTruthy();
        expect(screen.getByText('First plan · 7 days free')).toBeTruthy();
        expect(screen.getAllByText('After subscribing')).toHaveLength(4);
        // Asking for a visitor's subscriptions would read as a lost session and bounce them to sign in.
        expect(listSubscriptions).not.toHaveBeenCalled();
        expect(where()).toBe('/subscription/plans');

        fireEvent.click(screen.getByRole('button', { name: 'Subscribe to DoU Cloud 1' }));

        expect(where()).toBe('/subscription/login?next=%2Fsubscription%2Fcheckout%3Fplan%3Dpro-tier-01');
    });

    it("shows a signed-in reader whose trial is used today's charge and goes straight to checkout", async () => {
        renderAt('/subscription/plans', mockSetup('?mock=new-trial-used'));

        expect(await screen.findByText('Trial used')).toBeTruthy();
        expect(screen.getByText(/day 1 of each month/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /^Subscribe to DoU Cloud 1 — .*8,600 today$/ }));

        expect(where()).toBe('/subscription/checkout?plan=pro-tier-01');
    });

    it('offers a subscriber the adjacent plans and opens the change for the one picked', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=active'));

        expect(await screen.findByRole('heading', { name: 'Change plan' })).toBeTruthy();
        expect(screen.getByText('Current plan')).toBeTruthy();
        expect(screen.getAllByText('One step at a time')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Downgrade to DoU Cloud 1' }));
        expect(where()).toBe('/subscription/change?plan=pro-tier-01');
    });

    it('opens the upgrade from the step-up button', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=active'));

        fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to DoU Cloud 3' }));
        expect(where()).toBe('/subscription/change?plan=pro-tier-03');
    });

    it('subscribes from the entry card as well as from the button', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=new'));

        fireEvent.click(await screen.findByRole('button', { name: /DoU Cloud 1/, pressed: true }));

        expect(where()).toBe('/subscription/checkout?plan=pro-tier-01');
    });

    it('treats an expired subscription as none, without a second trial', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=expired'));

        expect(await screen.findByRole('heading', { name: 'DoU plans' })).toBeTruthy();
        expect(screen.getByText('Trial used')).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Subscribe to DoU Cloud 1 — .* today$/ })).toBeTruthy();
    });

    it.each(['past-due', 'cancel-scheduled', 'downgrade-scheduled'])(
        'sends a %s subscriber to their subscription instead of offering a change',
        async scenario => {
            renderAt('/subscription/plans', mockSetup(`?mock=${scenario}`));

            expect(await screen.findByText("You can't change your plan right now")).toBeTruthy();
            expect(screen.queryByRole('button', { name: /^(Upgrade|Downgrade) to/ })).toBeNull();
            expect(screen.queryByText('You can move one step up or down from your current plan.')).toBeNull();
            expect(screen.getByRole('link', { name: 'View subscription' }).getAttribute('href')).toMatch(
                /^\/subscription\/sub-\d$/
            );
        }
    );

    it('does not mistake a failed subscription list for no subscription', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=active&fail=network'));

        expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Subscribe/ })).toBeNull();
    });

    it('points a store subscriber to the store instead of offering a plan', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=store-android'));

        expect(await screen.findByText('Change your plan in the store you subscribed through.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Subscribe/ })).toBeNull();
        expect(screen.queryByText(/charges you today|free trial/)).toBeNull();
        expect(screen.getByRole('link', { name: 'Learn more' }).getAttribute('href')).toBe(
            '/subscription/store-managed'
        );
    });
});

describe('W-02 sign-in', () => {
    it('draws both providers and the phone-number note', async () => {
        renderAt('/subscription/login', mockSetup('?mock=visitor'));

        expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy();
        expect(screen.getByText('Signed up with a phone number only?')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it.each([
        ['canceled', 'You canceled the sign-in'],
        ['expired-attempt', 'The sign-in timed out. Please try again'],
        ['failed', "We couldn't sign you in. Please try again"],
        ['session-ended', 'You were signed out. Please sign in again'],
    ])('shows the %s banner', async (reason, text) => {
        renderAt(`/subscription/login?reason=${reason}`, mockSetup('?mock=visitor'));

        expect(await screen.findByText(text)).toBeTruthy();
    });

    it('ignores a reason it has no banner for', async () => {
        renderAt('/subscription/login?reason=nonsense', mockSetup('?mock=visitor'));

        await screen.findByRole('button', { name: 'Continue with Google' });
        expect(screen.queryByText(/canceled the sign-in|timed out|couldn't sign you in|were signed out/)).toBeNull();
    });

    it('shows a failure when the sign-in cannot start', async () => {
        renderAt('/subscription/login', mockSetup('?mock=visitor&fail=network'));

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Apple' }));

        expect(await screen.findByText("We couldn't sign you in. Please try again")).toBeTruthy();
        expect(where()).toBe('/subscription/login');
    });

    it('takes a reader who is already signed in straight to next', async () => {
        renderAt('/subscription/login?next=%2Fsubscription%2Fcheckout%3Fplan%3Dpro-tier-01', mockSetup('?mock=new'));

        await waitFor(() => expect(where()).toBe('/subscription/checkout?plan=pro-tier-01'));
    });
});

describe('W-02 return', () => {
    // The sign-in record is single-use; under StrictMode a second exchange would report it expired.
    it('completes a sign-in once under StrictMode and lands on next', async () => {
        renderAt('/subscription/login?next=%2Fsubscription%2Fhistory', mockSetup('?mock=visitor'), { strict: true });

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Return to DoU' }));

        await waitFor(() => expect(where()).toBe('/subscription/history'));
    });

    it('lands on the subscription list without a next', async () => {
        renderAt('/subscription/login', mockSetup('?mock=visitor'));

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Return to DoU' }));

        await waitFor(() => expect(where()).toBe('/subscription'));
    });

    it('sends a store subscriber to the store notice', async () => {
        const setup = mockSetup('?mock=store-ios');
        await setup.port.signOut();
        renderAt('/subscription/login?next=%2Fsubscription%2Fhistory', setup);

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByText('Subscribed via App Store')).toBeTruthy();
        expect(where()).toBe('/subscription/store-managed');
    });

    it('comes back to sign in with the canceled banner', async () => {
        renderAt('/subscription/login', mockSetup('?mock=visitor'));

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
        fireEvent.click(await screen.findByLabelText('Cancel'));
        fireEvent.click(screen.getByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByText('You canceled the sign-in')).toBeTruthy();
        expect(where()).toBe('/subscription/login?reason=canceled');
    });

    it('treats a callback with no sign-in behind it as expired', async () => {
        renderAt(
            '/subscription/login/callback?provider=google&nonce=stale&result=continue',
            mockSetup('?mock=visitor')
        );

        expect(await screen.findByText('The sign-in timed out. Please try again')).toBeTruthy();
        expect(where()).toBe('/subscription/login?reason=expired-attempt');
    });
});

describe('W-02b no linked account', () => {
    it('names the masked Google address it was', async () => {
        renderAt('/subscription/login', mockSetup('?mock=no-linked-account'));

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByRole('heading', { name: 'No DoU account found' })).toBeTruthy();
        expect(screen.getByText(/No DoU account is linked to mi\*\*\*@gmail\.com \(Google\)/)).toBeTruthy();
        expect(where()).toBe('/subscription/login/no-account');
        expect(screen.getByRole('link', { name: 'Get it on the App Store' }).getAttribute('href')).toMatch(
            /^https:\/\/apps\.apple\.com\//
        );
        expect(screen.getByRole('link', { name: 'Sign in with another account' }).getAttribute('href')).toBe(
            '/subscription/login'
        );
    });

    it('names no address for Apple', async () => {
        renderAt('/subscription/login', mockSetup('?mock=no-linked-account-apple'));

        fireEvent.click(await screen.findByRole('button', { name: 'Continue with Apple' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByText(/No DoU account is linked to this Apple account/)).toBeTruthy();
        expect(screen.queryByText(/@/)).toBeNull();
    });

    it('still reads when opened without the hand-over', async () => {
        renderAt('/subscription/login/no-account', mockSetup('?mock=visitor'));

        expect(await screen.findByText(/linked to this Google or Apple account/)).toBeTruthy();
    });
});

describe('W-17 store-managed', () => {
    it('explains an App Store subscription', async () => {
        renderAt('/subscription/store-managed', mockSetup('?mock=store-ios'));

        expect(await screen.findByText('Subscribed via App Store')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'You subscribe in the app' })).toBeTruthy();
        expect(screen.getByText('iPhone Settings › Apple ID › Subscriptions › DoU')).toBeTruthy();
        expect(screen.getByText('DoU Cloud 2')).toBeTruthy();
        expect(screen.getByText('2026.11.03')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        expect(where()).toBe('/');
    });

    it('explains a Google Play subscription', async () => {
        renderAt('/subscription/store-managed', mockSetup('?mock=store-android'));

        expect(await screen.findByText('Subscribed via Google Play')).toBeTruthy();
        expect(screen.getByText('Managing it in Google Play')).toBeTruthy();
    });

    it('sends a web-billed reader on to their subscriptions', async () => {
        renderAt('/subscription/store-managed', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription'));
    });
});
