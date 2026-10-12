import type { Page } from '@playwright/test';

import {
    installSubscriptions,
    PLAN,
    signedInMember,
    storeError,
    storeHandlers,
    storePurchase,
    type RelayMembership,
} from '../fixtures/subscription';
import { myTab } from '../support/app';
import type { FakeShell, ShellPlatform } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

/**
 * Buying a subscription through the app's store (apps/web/docs/feature/subscription/README.md
 * § Boundaries, and apps/web/docs/bridge/README.md § The Purchase exception). The confirm screen asks the shell for the store's
 * products (`FetchProducts`), then for the purchase (`Purchase`) — which the shell acknowledges with
 * nothing to read: the store's outcome comes later as an event of its own, `OnPurchaseSuccess` or
 * `OnPurchaseError`. A success is checked with the relay (`POST /memberships/0`), and only a checked
 * purchase is finished with the store (`FinishPurchaseTransaction`) — an unfinished one is offered
 * again by the store, a finished unchecked one is money taken for nothing. A cancel says nothing; any
 * other failure says "Payment failed".
 *
 * A pending purchase (one waiting on a parent's approval, say) is not told apart: the app's shell
 * passes nothing on for it, and the page gives up after its own 60s wait like any other failure.
 */

/** The signed-in member, from MY to the confirm screen of the entry tier. */
const openConfirm = async (page: Page): Promise<void> => {
    await page.goto('/');
    await myTab(page).click();
    await page.getByRole('button', { name: 'Subscription', exact: true }).click();
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    // The card shows the store's price for the tier, so it is drawn from `FetchProducts`.
    await page
        .getByRole('button', { name: `${PLAN.name} ${PLAN.displayPrice}/mo (VAT incl.) Up to 1 account(s)` })
        .click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Selected plan' })).toBeVisible();
};

const subscribeButton = (page: Page) => page.getByRole('button', { name: 'Subscribe', exact: true });
/** The overlay over the whole screen while the store or the relay works. A status with no name of its own. */
const processing = (page: Page) => page.getByRole('status').filter({ hasText: /^Processing payment$/ });
/** The failure toast. Exact: the toaster also carries its text, prefixed, in a live region. */
const paymentFailed = (page: Page) => page.getByText('Payment failed', { exact: true });

/** What the page asks the store for, per platform: Apple by the tier's product id, Google by base plan. */
const expectedPurchaseRequest = (platform: ShellPlatform) =>
    platform === 'ios'
        ? { id: PLAN.storeId }
        : { id: PLAN.androidParentSku, offerToken: PLAN.androidOfferToken, newPlanId: PLAN.storeId };

/**
 * Sets up a signed-in member with nothing bought, the relay's plans and the shell's store. `finished`
 * records, for each `FinishPurchaseTransaction`, how many relay checks had been made by then.
 */
const setUp = (
    backend: Parameters<typeof signedInMember>[0],
    shell: FakeShell,
    platform: ShellPlatform
): { relay: RelayMembership; finished: number[] } => {
    signedInMember(backend);
    const relay = installSubscriptions(backend, platform);
    const finished: number[] = [];
    shell.use(storeHandlers(platform));
    shell.handle('FinishPurchaseTransaction', data => {
        finished.push(relay.validations.length);
        return { purchase: data.purchase };
    });
    return { relay, finished };
};

/** Into the store and back with a completed purchase; resolves once the shell has been asked. */
const buyAndComplete = async (page: Page, shell: FakeShell, platform: ShellPlatform) => {
    await openConfirm(page);
    await subscribeButton(page).click();
    const request = await shell.waitFor('Purchase');
    expect(request.data).toEqual(expectedPurchaseRequest(platform));
    await expect(processing(page)).toBeVisible();
    const purchase = storePurchase(platform);
    shell.push('OnPurchaseSuccess', { purchase });
    return purchase;
};

test('a purchase the store completes is checked with the relay, then finished, and the membership is active', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    const { relay, finished } = setUp(backend, shell, shellPlatform);
    const purchase = await buyAndComplete(page, shell, shellPlatform);

    // Checked once, with the store's own token for the purchase…
    await expect.poll(() => relay.validations.length).toBe(1);
    expect(relay.validations[0]).toMatchObject({
        paymentType: shellPlatform === 'ios' ? 'apple-inapp' : 'google-inapp',
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
    });
    // …and finished once, only after that check.
    await expect.poll(() => finished).toEqual([1]);
    expect(shell.received('FinishPurchaseTransaction').map(message => message.data.purchase.id)).toEqual([purchase.id]);

    // The work is over, and the subscription screen reads the account's plan back from the relay as
    // the tier, active. Opened afresh rather than read off wherever the purchase left the page — that
    // is the screen the fixme below is about.
    await expect(processing(page)).toHaveCount(0);
    await page.goto('/subscription');
    await expect(page.getByRole('button', { name: `PRO ${PLAN.name} Active`, exact: true })).toBeVisible();
    await expect(page.getByText('You have no active subscription.')).toHaveCount(0);
});

// A product bug, left for its own fix: the purchase above succeeds, but the confirmation never
// appears. `purchaseAndValidate` waits for the membership to be read again before it returns, and
// with the tier now the account's own the confirm screen no longer counts it as one to buy — it sends
// the person back to the plan list before the confirmation it was about to show is set.
test.fixme(
    'a completed purchase is confirmed with "You are subscribed."',
    async ({ page, shell, backend, shellPlatform }) => {
        setUp(backend, shell, shellPlatform);
        await buyAndComplete(page, shell, shellPlatform);

        const done = page.getByRole('dialog').filter({ hasText: 'You are subscribed.' });
        await expect(done).toBeVisible();
        await expect(done).toContainText('Active');
        await expect(done).toContainText(shellPlatform === 'ios' ? 'App Store' : 'Google Play');
        await done.getByRole('button', { name: 'OK', exact: true }).click();
        await expect(page.getByText('You have no active subscription.')).toHaveCount(0);
    }
);

test('a purchase cancelled in the store says nothing, checks nothing, and can be started again', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    const { relay, finished } = setUp(backend, shell, shellPlatform);
    await openConfirm(page);

    await subscribeButton(page).click();
    await shell.waitFor('Purchase');
    shell.push('OnPurchaseError', storeError('user-cancelled', 'Purchase cancelled'));

    // The screen is back to where it was: no message, no work in progress…
    await expect(processing(page)).toHaveCount(0);
    await expect(subscribeButton(page)).toBeEnabled();
    // …and it is not stuck: a second tap asks the store again. Only after that is "nothing was
    // checked or finished" read, so the first attempt has had every chance to do either.
    await subscribeButton(page).click();
    await expect.poll(() => shell.received('Purchase').length).toBe(2);
    await expect(paymentFailed(page)).toHaveCount(0);
    expect(relay.validations).toEqual([]);
    expect(finished).toEqual([]);
});

test('a store error says the payment failed, and nothing is checked or finished', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    const { relay, finished } = setUp(backend, shell, shellPlatform);
    await openConfirm(page);

    await subscribeButton(page).click();
    await shell.waitFor('Purchase');
    shell.push('OnPurchaseError', storeError('service-error', 'The store is not available'));

    await expect(paymentFailed(page)).toBeVisible();
    await expect(processing(page)).toHaveCount(0);
    await expect(subscribeButton(page)).toBeEnabled();
    expect(relay.validations).toEqual([]);
    expect(finished).toEqual([]);
    await expect(page.getByText('You are subscribed.')).toHaveCount(0);
});

test("a pending purchase the store never settles ends in the page's own 60s wait, as a failure", async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    // The page's clock, so its 60s wait can be run through rather than sat out.
    await page.clock.install();
    const { relay, finished } = setUp(backend, shell, shellPlatform);
    await openConfirm(page);

    await subscribeButton(page).click();
    await shell.waitFor('Purchase');
    // The store holds the purchase as pending; the app's shell passes nothing on for that.
    await expect(processing(page)).toBeVisible();
    // Short of the wait by a margin, since the page clock runs on in real time between these steps.
    await page.clock.fastForward('00:55');
    await expect(processing(page)).toBeVisible();
    await page.clock.fastForward('00:06');

    await expect(paymentFailed(page)).toBeVisible();
    await expect(processing(page)).toHaveCount(0);
    expect(relay.validations).toEqual([]);
    expect(finished).toEqual([]);
});
