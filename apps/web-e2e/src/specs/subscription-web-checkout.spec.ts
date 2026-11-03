import type { Page } from '@playwright/test';

import { GUEST } from '../fixtures/guest';
import { installSubscriptions, PLAN, planRow, signedInMember } from '../fixtures/subscription';
import { myTab } from '../support/app';
import { expect, test } from '../support/test';

/**
 * The web app opened in a browser tab rather than inside the app (apps/web/docs/feature/subscription/README.md
 * § Outside the app). A browser has no store, so the screens that sell a tier hand the reader to the
 * website's checkout instead — except for someone a store is billing right now, whom the website cannot
 * serve. The run's environment is a dev one, so the website is the dev host.
 */
test.use({ inApp: false });

const WEBSITE = 'https://app-dev.chatic.io';
const WEB_PLANS = `${WEBSITE}/subscription/plans`;
const WEB_SUBSCRIPTIONS = `${WEBSITE}/subscription`;

/** Answers the website's pages, so the hand-over lands somewhere instead of failing as an unreachable host. */
const answerWebsite = (backend: Parameters<typeof signedInMember>[0]): void => {
    backend.useHttp({
        [`GET ${WEB_PLANS}`]: () => ({ page: 'plans' }),
        [`GET ${WEB_SUBSCRIPTIONS}`]: () => ({ page: 'subscriptions' }),
    });
};

/** The website's entry tier, as the relay lists it to a call naming its provider. */
const WEB_PLAN = {
    ...planRow('apple'),
    id: '#dou-web-tier-01_dev',
    platform: 'portone',
    planId: 'dou-web-tier-01_dev',
    price: 8600,
};

/**
 * The plan list as the relay answers it: the stores' tiers to a call naming no provider, and the
 * website's products only to a call naming theirs.
 */
const answerPlansByProvider = (backend: Parameters<typeof signedInMember>[0]): void => {
    backend.useHttp({
        'GET /products/plans': request => {
            const provider = new URL(request.url()).searchParams.get('platform');
            const list = provider === 'portone' ? [WEB_PLAN] : provider ? [] : [planRow('apple'), planRow('google')];
            return { list, total: list.length, page: 0, limit: -1 };
        },
    });
};

/** A membership the website bills, through the provider the relay records for Korean cards. */
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

/**
 * MY's subscription list. A browser opened on a deep link boots to home, so every scenario walks in
 * from MY rather than going to a subscription address directly.
 */
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

/** The subscription's detail, from its card on the list. */
const openDetail = async (page: Page): Promise<void> => {
    await openSubscriptions(page);
    await page.getByRole('button', { name: `PRO ${PLAN.name} Active`, exact: true }).click();
    await expect(page.getByText('Subscription info').first()).toBeVisible();
};

test('with no subscription, the plan picker hands over to the website, and back returns to the guide', async ({
    page,
    backend,
}) => {
    signedInMember(backend);
    installSubscriptions(backend, 'ios');
    answerWebsite(backend);

    await openGuide(page);
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page).toHaveURL(WEB_PLANS);

    // The picker's entry was replaced, not left behind: back lands on the guide, not on a picker that
    // would only send the reader out again.
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(WEB_PLANS);
});

test('a guest is handed over without signing in here, since the website signs the buyer in itself', async ({
    page,
    backend,
}) => {
    installSubscriptions(backend, 'ios');
    answerWebsite(backend);

    // Home's cloud banner is one way in; MY's subscription row, which a browser guest has too, is the other.
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Cloud' }).click();
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page).toHaveURL(WEB_PLANS);
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

test('with a subscription the website bills, the detail names its plan and manages and changes it on the website', async ({
    page,
    backend,
}) => {
    signedInMember(backend);
    installSubscriptions(backend, 'ios');
    backend.useHttp({ 'GET /memberships/0/mine': () => webBilledMembership });
    answerPlansByProvider(backend);
    answerWebsite(backend);

    // `openDetail` finds the card by the plan's name: the website's product id would mean the plan was
    // never resolved from its provider's list.
    await openDetail(page);
    await expect(page.getByText(WEB_PLAN.id.slice(1))).toHaveCount(0);
    await expect(page.getByText('DoU website', { exact: true })).toBeVisible();
    await expect(page.getByText('Moving up a plan takes effect immediately.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Manage on the web', exact: true }).click();
    await expect(page).toHaveURL(WEB_SUBSCRIPTIONS);

    await page.goBack();
    await page.getByRole('button', { name: 'Change plan', exact: true }).click();
    await expect(page).toHaveURL(WEB_PLANS);
});
