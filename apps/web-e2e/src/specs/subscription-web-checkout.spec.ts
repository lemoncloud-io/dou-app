import type { Page } from '@playwright/test';

import { GUEST } from '../fixtures/guest';
import { installSubscriptions, PLAN, planRow, signedInMember } from '../fixtures/subscription';
import { home, myTab } from '../support/app';
import { expect, test } from '../support/test';

test.use({ inApp: false });

const WEBSITE = 'https://app-dev.chatic.io';
const IN_APP_CHECKOUT = /\/subscription\/checkout$/;
const WEB_PLANS = `${WEBSITE}/subscription/plans`;
const WEB_SUBSCRIPTIONS = `${WEBSITE}/subscription`;

const answerWebsite = (backend: Parameters<typeof signedInMember>[0]): void => {
    backend.useHttp({
        [`GET ${WEB_PLANS}`]: () => ({ page: 'plans' }),
        [`GET ${WEB_SUBSCRIPTIONS}`]: () => ({ page: 'subscriptions' }),
    });
};

const WEB_PLAN = {
    ...planRow('apple'),
    id: '#dou-web-tier-01_dev',
    platform: 'portone',
    planId: 'dou-web-tier-01_dev',
    price: 8600,
};

const answerPlansByProvider = (backend: Parameters<typeof signedInMember>[0]): void => {
    backend.useHttp({
        'GET /products/plans': request => {
            const provider = new URL(request.url()).searchParams.get('platform');
            const list = provider === 'portone' ? [WEB_PLAN] : provider ? [] : [planRow('apple'), planRow('google')];
            return { list, total: list.length, page: 0, limit: -1 };
        },
    });
};

const webBilledMembership = {
    id: `MS${GUEST.uid}`,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    deletedAt: 0,
    $: { sid: GUEST.sid, uid: GUEST.uid },
    userId: GUEST.uid,
    status: 'active',
    isValid: true,
    productId: WEB_PLAN.id,
    platform: 'portone',
    validFrom: GUEST.createdAt,
    validUntil: 4_102_444_800_000,
    autoRenewing: true,
    trialUsed: true,
    cloudIds: [],
    cloudNo: 0,
};

const openSubscriptions = async (page: Page): Promise<void> => {
    await page.goto('/');
    await myTab(page).click();
    await page.getByRole('button', { name: 'Subscription', exact: true }).click();
};

const openGuide = async (page: Page): Promise<void> => {
    await openSubscriptions(page);
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
};

const openDetail = async (page: Page): Promise<void> => {
    await openSubscriptions(page);
    await page.getByRole('button', { name: `PRO ${PLAN.name} Active`, exact: true }).click();
    await expect(page.getByText('Subscription info').first()).toBeVisible();
};

test('with no subscription, the plan picker opens the in-app checkout, and back returns to the guide', async ({
    page,
    backend,
}) => {
    signedInMember(backend);
    installSubscriptions(backend, 'ios');
    answerWebsite(backend);

    await openGuide(page);
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page).toHaveURL(IN_APP_CHECKOUT);
    await expect(page.getByRole('button', { name: 'Register a card and subscribe', exact: true })).toBeVisible();
    expect(page.url().startsWith(WEBSITE)).toBe(false);

    await page.goBack();
    await expect(page.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(IN_APP_CHECKOUT);
});

test('a guest gets the in-app checkout too, which asks for a Google sign-in before any payment call', async ({
    page,
    backend,
}) => {
    installSubscriptions(backend, 'ios');
    answerWebsite(backend);
    const payerCalls: string[] = [];
    page.on('request', request => {
        if (/\/subscriptions\/0\/(issue|cards)/.test(request.url())) payerCalls.push(request.url());
    });

    await page.goto('/');
    await expect(home(page)).toBeVisible();
    await page.getByRole('button', { name: 'Add Cloud' }).click();
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page).toHaveURL(IN_APP_CHECKOUT);
    await expect(page.getByText('Sign in with Google to subscribe here.', { exact: false })).toBeVisible();
    expect(payerCalls).toEqual([]);
});

test('with a running App Store subscription, the detail names the store and offers no change', async ({
    page,
    backend,
}) => {
    signedInMember(backend);
    const relay = installSubscriptions(backend, 'ios');
    relay.active = true;
    answerWebsite(backend);

    await openDetail(page);
    await expect(page.getByText('You subscribe through App Store.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change plan', exact: true })).toHaveCount(0);
    expect(page.url().startsWith(WEBSITE)).toBe(false);
});

test('with a subscription the website bills, the detail manages it on the website and changes the plan in the app', async ({
    page,
    backend,
}) => {
    signedInMember(backend);
    installSubscriptions(backend, 'ios');
    backend.useHttp({ 'GET /memberships/0/mine': () => webBilledMembership });
    answerPlansByProvider(backend);
    answerWebsite(backend);

    await openDetail(page);
    await expect(page.getByText(WEB_PLAN.id.slice(1))).toHaveCount(0);
    await expect(page.getByText('DoU website', { exact: true })).toBeVisible();
    await expect(page.getByText('Moving up a plan takes effect immediately.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Manage on the web', exact: true }).click();
    await expect(page).toHaveURL(WEB_SUBSCRIPTIONS);

    await page.goBack();
    await page.getByRole('button', { name: 'Change plan', exact: true }).click();
    await expect(page).toHaveURL(IN_APP_CHECKOUT);
});
