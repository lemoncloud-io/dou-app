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

const openConfirm = async (page: Page): Promise<void> => {
    await page.goto('/');
    await myTab(page).click();
    await page.getByRole('button', { name: 'Subscription', exact: true }).click();
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await page
        .getByRole('button', { name: `${PLAN.name} ${PLAN.displayPrice}/mo (VAT incl.) Up to 1 account(s)` })
        .click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Selected plan' })).toBeVisible();
};

const subscribeButton = (page: Page) => page.getByRole('button', { name: 'Subscribe', exact: true });
const processing = (page: Page) => page.getByRole('status').filter({ hasText: /^Processing payment$/ });
const paymentFailed = (page: Page) => page.getByText('Payment failed', { exact: true });

const expectedPurchaseRequest = (platform: ShellPlatform) =>
    platform === 'ios'
        ? { id: PLAN.storeId }
        : { id: PLAN.androidParentSku, offerToken: PLAN.androidOfferToken, newPlanId: PLAN.storeId };

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

    await expect.poll(() => relay.validations.length).toBe(1);
    expect(relay.validations[0]).toMatchObject({
        paymentType: shellPlatform === 'ios' ? 'apple-inapp' : 'google-inapp',
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
    });
    await expect.poll(() => finished).toEqual([1]);
    expect(shell.received('FinishPurchaseTransaction').map(message => message.data.purchase.id)).toEqual([purchase.id]);

    await expect(processing(page)).toHaveCount(0);
    await page.goto('/subscription');
    await expect(page.getByRole('button', { name: `PRO ${PLAN.name} Active`, exact: true })).toBeVisible();
    await expect(page.getByText('You have no active subscription.')).toHaveCount(0);
});

test('a completed purchase is confirmed with "You are subscribed."', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    setUp(backend, shell, shellPlatform);
    await buyAndComplete(page, shell, shellPlatform);

    const done = page.getByRole('dialog').filter({ hasText: 'You are subscribed.' });
    await expect(done).toBeVisible({ timeout: 15_000 });
    await expect(done).toContainText('Active');
    await expect(done).toContainText(shellPlatform === 'ios' ? 'App Store' : 'Google Play');
    await done.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByText('You have no active subscription.')).toHaveCount(0);
});

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

    await expect(processing(page)).toHaveCount(0);
    await expect(subscribeButton(page)).toBeEnabled();
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
    await page.clock.install();
    const { relay, finished } = setUp(backend, shell, shellPlatform);
    await openConfirm(page);

    await subscribeButton(page).click();
    await shell.waitFor('Purchase');
    await expect(processing(page)).toBeVisible();
    await page.clock.fastForward('00:55');
    await expect(processing(page)).toBeVisible();
    await page.clock.fastForward('00:06');

    await expect(paymentFailed(page)).toBeVisible();
    await expect(processing(page)).toHaveCount(0);
    expect(relay.validations).toEqual([]);
    expect(finished).toEqual([]);
});
