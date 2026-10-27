import { isPortError } from '../port/errors';
import { createMockPort } from './createMockPort';
import { memoryStateStore } from './storage';

import type { SubscriptionPort } from '../port';

/**
 * A mock with no latency, a hand-driven wall clock and a URL the test sets. `advance` moves the wall
 * clock past an attempt's settle time; the mock's own today comes from the scenario or `?now=`.
 */
const setup = (search: string) => {
    let url = search;
    let wall = 1_000_000;
    const store = memoryStateStore();
    const mock = createMockPort({
        store,
        readSearch: () => url,
        delayMs: 0,
        settleMs: 1500,
        nowMs: () => wall,
        nonce: () => 'nonce-1',
    });
    return {
        ...mock,
        store,
        go: (next: string) => {
            url = next;
        },
        advance: (ms = 1500) => {
            wall += ms;
        },
    };
};

const expectCode = async (promise: Promise<unknown>, code: Parameters<typeof isPortError>[1]) => {
    const error = await promise.then(
        () => undefined,
        (e: unknown) => e
    );
    expect(isPortError(error, code)).toBe(true);
};

const settle = async (port: SubscriptionPort, attemptId: string, advance: () => void) => {
    advance();
    return port.getPaymentAttempt(attemptId);
};

describe('createMockPort — scenarios and the URL', () => {
    it('starts signed out as a visitor when the URL names no scenario', async () => {
        const { port } = setup('');
        expect(await port.getSession()).toBeNull();
        await expectCode(port.listSubscriptions(), 'unauthenticated');
    });

    it('builds the scenario the URL names', async () => {
        const { port } = setup('?mock=active');
        expect((await port.getSession())?.email).toBe('minji.kim@gmail.com');
        const subs = await port.listSubscriptions();
        expect(subs.map(s => [s.planId, s.status])).toEqual([
            ['pro-tier-02', 'active'],
            ['pro-tier-01', 'expired'],
        ]);
    });

    it('keeps changed state when the same URL is read again, and starts over on another scenario', async () => {
        const { port, go } = setup('?mock=active');
        await port.cancelSubscription('sub-2');
        go('');
        go('?mock=active');
        // Same scenario as the state already holds: a reload, not a reset.
        expect((await port.getSubscription('sub-2')).status).toBe('cancelScheduled');
        go('?mock=trial');
        expect((await port.listSubscriptions())[0].status).toBe('trial');
    });

    it('does not spend a one-shot flag twice when a sign-in returns to the same URL', async () => {
        const { port, go } = setup('?mock=active&fail=session-ended');
        await expectCode(port.listInvoices(), 'unauthenticated');
        go('?reason=session-ended&next=x');
        const { redirectUrl } = await port.startSignIn({ provider: 'google' });
        const nonce = new URL(redirectUrl, 'https://x.invalid').searchParams.get('nonce') as string;
        await port.completeSignIn(new URLSearchParams({ nonce, result: 'continue' }));
        go('?mock=active&fail=session-ended');
        expect(await port.listInvoices()).toHaveLength(2);
    });

    it('empties the cards with cards=0', async () => {
        const { port } = setup('?mock=cancel-scheduled&cards=0');
        expect(await port.listPaymentMethods()).toEqual([]);
    });

    it("moves the mock's today with now= and nothing else", async () => {
        const { controller, go } = setup('?mock=downgrade-scheduled');
        expect(controller.getState().today).toBe('2026-11-01');
        go('?mock=downgrade-scheduled&now=2026-11-20');
        expect(controller.getState().today).toBe('2026-11-20');
        expect(controller.getState().subscriptions[0].pendingChange?.effectiveAt).toBe('2026-11-20');
    });

    it('brings a hidden panel back with panel=1 on a page load', async () => {
        const first = setup('?mock=active&panel=1');
        first.controller.setPanelHidden(true);
        const second = createMockPort({ store: first.store, readSearch: () => '?mock=active&panel=1', delayMs: 0 });
        expect(second.controller.peek().panelHidden).toBe(false);
    });

    it('survives a reload through its store', async () => {
        const first = setup('?mock=active');
        await first.port.cancelSubscription('sub-2');
        const second = createMockPort({ store: first.store, readSearch: () => '?mock=active', delayMs: 0 });
        expect((await second.port.getSubscription('sub-2')).status).toBe('cancelScheduled');
    });
});

describe('createMockPort — what the scenarios carry', () => {
    it('gives a store subscriber the store plan and its next charge', async () => {
        const { port } = setup('?mock=store-android');
        expect((await port.getSession())?.storeSubscription).toEqual({
            planId: 'pro-tier-02',
            nextBillingAt: '2026-11-03',
        });
    });

    it('gives a failing subscription its decline reason and the retry days from the policy', async () => {
        const { port } = setup('?mock=past-due');
        expect(await port.getSubscription('sub-2')).toMatchObject({
            failureReason: '카드 한도 초과',
            retryAt: ['2026-10-31', '2026-11-02', '2026-11-04'],
        });
    });

    it('gives an expired subscription its restore deadline from the policy, and why it ended', async () => {
        const { port } = setup('?mock=expired');
        expect(await port.getSubscription('sub-2')).toMatchObject({
            restoreUntil: '2026-11-19',
            endedReason: 'canceled',
        });
    });

    it('carries every way a subscription ends in history-mixed', async () => {
        const { port } = setup('?mock=history-mixed');
        const reasons = (await port.listSubscriptions()).map(s => s.endedReason).filter(Boolean);
        expect(reasons.sort()).toEqual(['paymentFailed', 'replaced']);
    });
});

describe('createMockPort — fail flags', () => {
    it('fails the next call once with network', async () => {
        const { port } = setup('?mock=active&fail=network');
        await expectCode(port.listSubscriptions(), 'network');
        expect(await port.listSubscriptions()).toHaveLength(2);
    });

    it('ends the session on the next call with session-ended', async () => {
        const { port } = setup('?mock=active&fail=session-ended');
        // Reading the session is how a page learns of it, so it is not the call that fails.
        expect(await port.getSession()).not.toBeNull();
        await expectCode(port.listSubscriptions(), 'unauthenticated');
        expect(await port.getSession()).toBeNull();
    });

    it('closes the payment window with closed', async () => {
        const { port } = setup('?mock=active&fail=closed');
        expect(await port.startPaymentMethodRegistration({ purpose: 'addCard' })).toEqual({ outcome: 'closed' });
    });

    it('refuses card registration with attempt-limit', async () => {
        const { port } = setup('?mock=active&fail=attempt-limit');
        await expectCode(port.startPaymentMethodRegistration({ purpose: 'addCard' }), 'limit');
    });

    it('fails an added card with card-declined, and stops after the attempt limit', async () => {
        const { port } = setup('?mock=active&fail=card-declined');
        for (let i = 0; i < 5; i++) {
            expect(await port.startPaymentMethodRegistration({ purpose: 'addCard' })).toEqual({ outcome: 'failed' });
        }
        await expectCode(port.startPaymentMethodRegistration({ purpose: 'addCard' }), 'limit');
    });
});

describe('createMockPort — the payment window', () => {
    it('asks a registered window for the outcome, preselecting the fail flag', async () => {
        const { port, controller } = setup('?mock=active&fail=card-declined');
        const presenter = vi.fn().mockResolvedValue('registered');
        controller.setPaymentWindow(presenter);
        expect(await port.startPaymentMethodRegistration({ purpose: 'addCard' })).toEqual({ outcome: 'registered' });
        expect(presenter).toHaveBeenCalledWith({ purpose: 'addCard', planId: undefined, suggested: 'failed' });
        expect(await port.listPaymentMethods()).toHaveLength(3);
    });

    it('adds nothing when the window is closed', async () => {
        const { port, controller } = setup('?mock=active');
        controller.setPaymentWindow(() => Promise.resolve('closed'));
        expect(await port.startPaymentMethodRegistration({ purpose: 'addCard' })).toEqual({ outcome: 'closed' });
        expect(await port.listPaymentMethods()).toHaveLength(2);
    });

    it('makes a card registered ahead of a charge the default', async () => {
        const { port } = setup('?mock=past-due');
        await port.startPaymentMethodRegistration({ purpose: 'retry' });
        const methods = await port.listPaymentMethods();
        expect(methods.filter(pm => pm.isDefault).map(pm => pm.id)).toEqual([methods[1].id]);
        expect((await port.getSubscription('sub-2')).defaultPaymentMethodId).toBe(methods[1].id);
    });
});

describe('createMockPort — the state machine', () => {
    it('schedules the end on cancel, and resumes it', async () => {
        const { port } = setup('?mock=active');
        const cancelled = await port.cancelSubscription('sub-2');
        expect(cancelled).toMatchObject({ status: 'cancelScheduled', endsAt: '2026-11-20' });
        expect(cancelled.nextBillingAt).toBeUndefined();
        await expectCode(port.cancelSubscription('sub-2'), 'conflict');

        const resumed = await port.resumeSubscription('sub-2');
        expect(resumed).toMatchObject({ status: 'active', nextBillingAt: '2026-11-20' });
        expect(resumed.endsAt).toBeUndefined();
    });

    it('refuses to resume with no card to renew with', async () => {
        const { port } = setup('?mock=cancel-scheduled&cards=0');
        await expectCode(port.resumeSubscription('sub-2'), 'conflict');
    });

    it('changes the plan once an upgrade attempt succeeds', async () => {
        const { port, advance } = setup('?mock=active');
        const preview = await port.previewChange('pro-tier-03');
        expect(preview).toMatchObject({ kind: 'upgrade', effectiveAt: '2026-11-01' });
        expect(preview.blocked).toBeUndefined();
        expect(preview.amountToday?.amount).toBeGreaterThan(0);

        const attempt = await port.changePlan('pro-tier-03');
        expect(attempt).toMatchObject({ purpose: 'upgrade', status: 'processing' });
        expect((await port.getSubscription('sub-2')).planId).toBe('pro-tier-02');

        const settled = await settle(port, (attempt as { id: string }).id, advance);
        expect(settled.status).toBe('succeeded');
        expect((await port.getSubscription('sub-2')).planId).toBe('pro-tier-03');
        expect((await port.listInvoices())[0].kind).toBe('upgrade');
    });

    it('blocks a change two steps away, and any change while a payment is failing', async () => {
        const active = setup('?mock=active');
        expect((await active.port.previewChange('pro-tier-04')).blocked).toBe('notAdjacent');
        await expectCode(active.port.changePlan('pro-tier-04'), 'conflict');

        const pastDue = setup('?mock=past-due');
        expect((await pastDue.port.previewChange('pro-tier-03')).blocked).toBe('pastDue');
    });

    it('schedules a downgrade, and cancels it', async () => {
        const { port } = setup('?mock=active');
        expect(await port.changePlan('pro-tier-01')).toEqual({ scheduled: true, effectiveAt: '2026-11-20' });
        const scheduled = await port.getSubscription('sub-2');
        expect(scheduled.pendingChange).toEqual({ planId: 'pro-tier-01', effectiveAt: '2026-11-20' });
        expect(scheduled.nextAmount).toEqual({ amount: 8600, currency: 'KRW' });

        const cancelled = await port.cancelScheduledChange('sub-2');
        expect(cancelled.pendingChange).toBeUndefined();
        expect(cancelled.nextAmount).toEqual({ amount: 17200, currency: 'KRW' });
    });

    it('refuses to cancel a scheduled downgrade on the day it applies', async () => {
        const { port } = setup('?mock=downgrade-scheduled&now=2026-11-20');
        await expectCode(port.cancelScheduledChange('sub-4'), 'conflict');
        expect((await port.previewChange('pro-tier-04')).blocked).toBe('sameDayAsChange');
    });

    it('returns a failing subscription to active when a retry succeeds', async () => {
        const { port, advance } = setup('?mock=past-due');
        const attempt = await port.retryPayment('sub-2');
        expect(attempt).toMatchObject({ purpose: 'retry', status: 'processing' });
        expect((await settle(port, attempt.id, advance)).status).toBe('succeeded');
        const sub = await port.getSubscription('sub-2');
        expect(sub).toMatchObject({ status: 'active', nextBillingAt: '2026-11-30' });
        expect(sub.restrictAt).toBeUndefined();
        expect(sub.failureReason).toBeUndefined();
        expect(sub.retryAt).toBeUndefined();
    });

    it('leaves a failing subscription failing when the retry is declined', async () => {
        const { port, advance, go } = setup('?mock=past-due');
        go('?mock=past-due&fail=card-declined');
        const attempt = await port.retryPayment('sub-2');
        expect(await settle(port, attempt.id, advance)).toMatchObject({ status: 'failed', failure: 'declined' });
        expect((await port.getSubscription('sub-2')).status).toBe('pastDue');
    });

    it('starts a trial on a first checkout', async () => {
        const { port, advance } = setup('?mock=new');
        const preview = await port.previewCheckout('pro-tier-01');
        expect(preview).toMatchObject({ withTrial: true, amountToday: { amount: 0 }, trialEndsAt: '2026-11-08' });

        expect(await port.startPaymentMethodRegistration({ purpose: 'start', planId: 'pro-tier-01' })).toEqual({
            outcome: 'registered',
        });
        const { emailId } = await port.requestEmailCode('minji.kim@gmail.com');
        await expectCode(port.verifyEmailCode(emailId, '000000'), 'invalidCode');
        expect(await port.verifyEmailCode(emailId, '123456')).toMatchObject({ status: 'verified', primary: true });

        const attempt = await port.startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId });
        expect(attempt.withTrial).toBe(true);
        const settled = await settle(port, attempt.id, advance);
        expect(settled.status).toBe('succeeded');

        const [sub] = await port.listSubscriptions();
        expect(sub).toMatchObject({ id: settled.subscriptionId, status: 'trial', trialEndsAt: '2026-11-08' });
        expect(await port.listInvoices()).toEqual([]);
        expect((await port.getSession())?.trialUsed).toBe(true);
    });

    it('charges at once and restores held clouds when an expired subscriber returns within the window', async () => {
        const { port, advance } = setup('?mock=expired');
        const { emails } = await port.getBillingInfo();
        const attempt = await port.startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId: emails[0].id });
        expect(attempt.withTrial).toBe(false);
        await settle(port, attempt.id, advance);
        const [sub] = await port.listSubscriptions();
        expect(sub).toMatchObject({ status: 'active', restored: true, nextBillingAt: '2026-12-01' });
        expect((await port.listInvoices())[0]).toMatchObject({ kind: 'first', status: 'paid' });
    });

    it('refuses a checkout outside Korea, and a second subscription', async () => {
        const { port } = setup('?mock=active');
        await expectCode(port.startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId: 'em-1' }), 'conflict');
        const fresh = setup('?mock=new-trial-used');
        await fresh.port.startPaymentMethodRegistration({ purpose: 'start' });
        await expectCode(fresh.port.startCheckout({ planId: 'pro-tier-01', country: 'US', emailId: 'x' }), 'conflict');
    });

    it('returns the same attempt for a second checkout while the first is processing', async () => {
        const { port, advance } = setup('?mock=new-trial-used');
        await port.startPaymentMethodRegistration({ purpose: 'start' });
        const { emailId } = await port.requestEmailCode('minji.kim@gmail.com');
        await port.verifyEmailCode(emailId, '123456');
        const first = await port.startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId });
        const second = await port.startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId });
        expect(second.id).toBe(first.id);
        await settle(port, first.id, advance);
        expect((await port.listSubscriptions()).filter(s => s.status !== 'expired')).toHaveLength(1);
    });

    it('returns the same attempt for a second retry while the first is processing', async () => {
        const { port } = setup('?mock=past-due');
        const first = await port.retryPayment('sub-2');
        expect((await port.retryPayment('sub-2')).id).toBe(first.id);
    });

    it('charges nothing for an upgrade during a trial', async () => {
        const { port, advance } = setup('?mock=trial');
        expect((await port.previewChange('pro-tier-02')).amountToday).toEqual({ amount: 0, currency: 'KRW' });
        const attempt = await port.changePlan('pro-tier-02');
        await settle(port, (attempt as { id: string }).id, advance);
        expect((await port.getSubscription('sub-3')).planId).toBe('pro-tier-02');
        expect(await port.listInvoices()).toEqual([]);
    });

    it('refuses a plan change on a subscription that is ending', async () => {
        const { port } = setup('?mock=cancel-scheduled');
        await expectCode(port.previewChange('pro-tier-01'), 'conflict');
        await expectCode(port.changePlan('pro-tier-03'), 'conflict');
    });

    it('applies the card removal rule', async () => {
        const { port } = setup('?mock=active');
        await expectCode(port.removePaymentMethod('pm-1'), 'conflict');
        expect((await port.removePaymentMethod('pm-2')).map(pm => pm.id)).toEqual(['pm-1']);
        await expectCode(port.removePaymentMethod('pm-1'), 'conflict');
    });

    it('moves the default card', async () => {
        const { port } = setup('?mock=active');
        const methods = await port.setDefaultPaymentMethod('pm-2');
        expect(methods.find(pm => pm.isDefault)?.id).toBe('pm-2');
        expect((await port.getSubscription('sub-2')).defaultPaymentMethodId).toBe('pm-2');
    });

    it('stops at five billing emails and keeps the primary one', async () => {
        const { port } = setup('?mock=active');
        for (const n of [2, 3, 4, 5]) await port.requestEmailCode(`b${n}@lemon.example`);
        await expectCode(port.requestEmailCode('b6@lemon.example'), 'limit');
        await expectCode(port.removeEmail('em-1'), 'conflict');
        const pending = (await port.getBillingInfo()).emails[1];
        await expectCode(port.setPrimaryEmail(pending.id), 'conflict');
    });
});

describe('createMockPort — billing email codes', () => {
    const MIN = 60_000;

    it('hands back a ticket with the code lifetime, the resend time and the counts', async () => {
        const { port } = setup('?mock=new');
        const ticket = await port.requestEmailCode('billing@lemon.example');
        expect(ticket).toEqual({
            emailId: ticket.emailId,
            expiresAt: new Date(1_000_000 + 5 * MIN).toISOString(),
            resendAt: new Date(1_000_000 + 60_000).toISOString(),
            resendsLeft: 4,
            attemptsLeft: 5,
        });
    });

    it('refuses a throwaway address', async () => {
        const { port } = setup('?mock=new');
        await expectCode(port.requestEmailCode('temp4821@mailinator.com'), 'disposableEmail');
    });

    it('counts wrong entries down, then kills the code', async () => {
        const { port } = setup('?mock=new');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        for (const left of [4, 3, 2, 1]) {
            const error = await port.verifyEmailCode(emailId, '000000').catch((e: unknown) => e);
            expect(isPortError(error, 'invalidCode') && error.detail).toEqual({ attemptsLeft: left });
        }
        await expectCode(port.verifyEmailCode(emailId, '000000'), 'tooManyAttempts');
        // Even the right code is refused once the attempts are spent.
        await expectCode(port.verifyEmailCode(emailId, '123456'), 'tooManyAttempts');
    });

    it('lets a code die after its lifetime', async () => {
        const { port, advance } = setup('?mock=new');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        advance(5 * MIN + 1);
        await expectCode(port.verifyEmailCode(emailId, '123456'), 'codeExpired');
    });

    it('spaces resends, locks the address when they run out, and starts it over after the lock', async () => {
        const { port, advance } = setup('?mock=new');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        await expectCode(port.resendEmailCode(emailId), 'conflict');
        for (const left of [3, 2, 1, 0]) {
            advance(60_000);
            expect((await port.resendEmailCode(emailId)).resendsLeft).toBe(left);
        }
        advance(60_000);
        const locked = await port.resendEmailCode(emailId).catch((e: unknown) => e);
        expect(isPortError(locked, 'resendLimit') && locked.detail?.retryAt).toBe(
            new Date(1_000_000 + 5 * 60_000 + 10 * MIN).toISOString()
        );
        advance(5 * MIN);
        await expectCode(port.resendEmailCode(emailId), 'resendLimit');
        advance(5 * MIN);
        expect((await port.resendEmailCode(emailId)).resendsLeft).toBe(4);
    });

    it('hands back the live ticket when a waiting address is asked for again', async () => {
        const { port } = setup('?mock=new');
        const first = await port.requestEmailCode('billing@lemon.example');
        expect(await port.requestEmailCode('billing@lemon.example')).toEqual(first);
    });

    it('takes a second check of a verified address as done, and refuses to resend to it', async () => {
        const { port } = setup('?mock=new');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        await port.verifyEmailCode(emailId, '123456');
        expect(await port.verifyEmailCode(emailId, '000000')).toMatchObject({ status: 'verified' });
        await expectCode(port.resendEmailCode(emailId), 'conflict');
    });

    it('keeps the primary mark on a new address that already had it', async () => {
        const { port } = setup('?mock=active');
        const { emailId } = await port.requestEmailCode('second@lemon.example');
        await port.verifyEmailCode(emailId, '123456');
        // The verified primary (em-1) takes the place of the non-primary address: it stays primary.
        const { emails } = await port.replaceEmail(emailId, 'em-1');
        expect(emails.map(e => [e.id, e.primary])).toEqual([['em-1', true]]);
    });

    it('verifies a fresh code after a resend', async () => {
        const { port, advance } = setup('?mock=new');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        advance(60_000);
        await port.resendEmailCode(emailId);
        expect(await port.verifyEmailCode(emailId, '123456')).toMatchObject({ status: 'verified', primary: true });
    });

    it('fails the next verification with code-expired and the next resend with resend-limit', async () => {
        const expired = setup('?mock=new&fail=code-expired');
        const { emailId } = await expired.port.requestEmailCode('billing@lemon.example');
        await expectCode(expired.port.verifyEmailCode(emailId, '123456'), 'codeExpired');

        const limited = setup('?mock=new&fail=resend-limit');
        const ticket = await limited.port.requestEmailCode('billing@lemon.example');
        await expectCode(limited.port.resendEmailCode(ticket.emailId), 'resendLimit');
    });

    it('adopts the Google sign-in address as the verified primary, and refuses it for Apple', async () => {
        const google = setup('?mock=new');
        expect(await google.port.adoptSignInEmail()).toMatchObject({
            address: 'minji.kim@gmail.com',
            status: 'verified',
            primary: true,
        });
        const apple = setup('?mock=new-apple');
        expect((await apple.port.getSession())?.provider).toBe('apple');
        await expectCode(apple.port.adoptSignInEmail(), 'conflict');
    });

    it('replaces an address with a verified new one, keeping its primary mark and what it receives', async () => {
        const { port } = setup('?mock=active');
        const { emailId } = await port.requestEmailCode('billing@lemon.example');
        await expectCode(port.replaceEmail('em-1', emailId), 'conflict');
        await port.verifyEmailCode(emailId, '123456');
        await expectCode(port.replaceEmail('em-1', 'em-1'), 'conflict');

        const { emails } = await port.replaceEmail('em-1', emailId);
        expect(emails).toEqual([
            {
                id: emailId,
                address: 'billing@lemon.example',
                primary: true,
                status: 'verified',
                receives: ['receipt', 'notice'],
            },
        ]);
    });
});

describe('createMockPort — the sign-in round trip', () => {
    const signIn = async (search: string, result: string, nonce = 'nonce-1') => {
        const mock = setup(search);
        const { redirectUrl } = await mock.port.startSignIn({ provider: 'google', next: '/subscription/history' });
        expect(redirectUrl).toBe(
            '/subscription/login/mock-provider?provider=google&nonce=nonce-1&next=%2Fsubscription%2Fhistory'
        );
        const callback = new URLSearchParams({ provider: 'google', nonce, result });
        return { mock, outcome: mock.port.completeSignIn(callback) };
    };

    it('signs in and hands back the return path it started with', async () => {
        const { mock, outcome } = await signIn('', 'continue');
        expect(await outcome).toMatchObject({ account: { provider: 'google' }, next: '/subscription/history' });
        expect(await mock.port.getSession()).not.toBeNull();
    });

    it('reports an account with no link, with its hint', async () => {
        const { mock, outcome } = await signIn('?mock=no-linked-account', 'noAccount');
        expect(await outcome).toEqual({ noLinkedAccount: true, provider: 'google', hint: 'mi***@gmail.com' });
        expect(await mock.port.getSession()).toBeNull();
    });

    it('reports a canceled sign-in, with the return path it started with', async () => {
        const error = await (await signIn('', 'canceled')).outcome.catch((e: unknown) => e);
        expect(isPortError(error, 'signInCanceled') && error.detail).toEqual({ next: '/subscription/history' });
    });

    it('reports a timed-out sign-in', async () => {
        await expectCode((await signIn('', 'expired')).outcome, 'signInExpired');
    });

    it('rejects a callback whose nonce is not the attempt it claims', async () => {
        await expectCode((await signIn('', 'continue', 'forged')).outcome, 'signInExpired');
    });

    it('rejects a callback that arrives after the attempt has expired', async () => {
        const mock = setup('');
        await mock.port.startSignIn({ provider: 'apple' });
        mock.advance(11 * 60_000);
        await expectCode(
            mock.port.completeSignIn(new URLSearchParams({ nonce: 'nonce-1', result: 'continue' })),
            'signInExpired'
        );
    });

    it('rejects a replayed callback', async () => {
        const { mock, outcome } = await signIn('', 'continue');
        await outcome;
        await expectCode(
            mock.port.completeSignIn(new URLSearchParams({ nonce: 'nonce-1', result: 'continue' })),
            'signInExpired'
        );
    });

    it('returns to where the session ended after signing in again', async () => {
        const mock = setup('?mock=active&fail=session-ended');
        await expectCode(mock.port.listInvoices(), 'unauthenticated');
        const { redirectUrl } = await mock.port.startSignIn({ provider: 'google', next: '/subscription/history' });
        const nonce = new URL(redirectUrl, 'https://x.invalid').searchParams.get('nonce') as string;
        const result = await mock.port.completeSignIn(new URLSearchParams({ nonce, result: 'continue' }));
        expect(result).toMatchObject({ next: '/subscription/history' });
        expect(await mock.port.listInvoices()).toHaveLength(2);
    });
});
