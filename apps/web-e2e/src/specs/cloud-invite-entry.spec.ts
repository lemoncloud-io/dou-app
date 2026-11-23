import type { Page } from '@playwright/test';

import { CLOUD, CLOUD_PLACE, CLOUD_ROOM, cloudInvitePath, installCloud } from '../fixtures/cloud';
import { currentPath } from '../support/app';
import { expect, test } from '../support/test';

const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept' });
const profileDialog = (page: Page) =>
    page.getByRole('dialog').getByRole('heading', { level: 2, name: `Create your profile for ${CLOUD_PLACE.name}` });

const acceptIntoRoom = async (page: Page): Promise<void> => {
    await acceptButton(page).click();
    await expect(acceptButton(page)).toBeHidden();
    await expect.poll(() => currentPath(page)).toBe(`/channels/${CLOUD_ROOM.id}/room`);
    await expect(page.getByText(CLOUD_ROOM.name).first()).toBeVisible();
};

test('an invite back into the place already open switches into it, and asks for no profile', async ({
    page,
    shell,
    backend,
}) => {
    const cloud = installCloud(backend, { profileInPlace: true });

    shell.push('OnNavigate', { path: cloudInvitePath('E2EFIRST'), replace: false });
    await page.goto('/');
    await acceptIntoRoom(page);
    expect(cloud.sessionSite).toBe(CLOUD_PLACE.id);

    const switchesBefore = cloud.switches.length;
    const readsBefore = cloud.profileReads.length;
    shell.push('OnNavigate', { path: cloudInvitePath('E2ESECOND'), replace: false });
    await acceptIntoRoom(page);

    expect(cloud.switches.slice(switchesBefore)).toContain(CLOUD_PLACE.id);
    const reads = cloud.profileReads.slice(readsBefore);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter(site => site !== CLOUD_PLACE.id)).toEqual([]);
    expect(cloud.sessionSite).toBe(CLOUD_PLACE.id);
    await expect(profileDialog(page)).toHaveCount(0);
    expect(cloud.profileWrites).toEqual([]);
});

test('an invite into a place with no profile yet asks for one, and saves it there', async ({
    page,
    shell,
    backend,
}) => {
    const cloud = installCloud(backend, { profileInPlace: false });

    shell.push('OnNavigate', { path: cloudInvitePath('E2EFIRST'), replace: false });
    await page.goto('/');
    await acceptButton(page).click();

    await expect(profileDialog(page)).toBeVisible();
    await page.getByPlaceholder('Enter a name').fill('Kim');
    await page.getByRole('button', { name: 'Done' }).click();

    await expect.poll(() => currentPath(page)).toBe(`/channels/${CLOUD_ROOM.id}/room`);
    expect(cloud.profileWrites.map(write => write.site)).toEqual([CLOUD_PLACE.id]);
});

test('offers no Accept until the invite has been read, so an early press cannot spend it', async ({
    page,
    shell,
    backend,
}) => {
    const cloud = installCloud(backend, { profileInPlace: true });
    let releaseLookup: () => void = () => undefined;
    const lookupHeld = new Promise<void>(resolve => (releaseLookup = resolve));
    backend.gateHttp(`GET ${CLOUD.backend}/hello/invite-code`, () => lookupHeld);

    shell.push('OnNavigate', { path: cloudInvitePath('E2EFIRST'), replace: false });
    await page.goto('/');
    await expect(page.getByText('Checking your invitation')).toBeVisible();
    await expect(acceptButton(page)).toHaveCount(0);

    releaseLookup();
    await acceptIntoRoom(page);
    expect(cloud.sessionSite).toBe(CLOUD_PLACE.id);
});
