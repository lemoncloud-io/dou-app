import type { Page } from '@playwright/test';

import { CLOUD_PLACE, CLOUD_ROOM, cloudInvitePath, installCloud } from '../fixtures/cloud';
import { currentPath } from '../support/app';
import { expect, test } from '../support/test';

/**
 * Accepting a cloud invite (apps/web/docs/feature/invite/README.md § Accepting a cloud invite). The
 * page logs in with the code on the cloud's backend, enters the cloud with the token that answers,
 * switches the session into the invited place, asks for a place profile only if there is none
 * there, and opens the room.
 *
 * The invite login's token is signed for the cloud's default place, so entering with it moves the
 * session there. Into a cloud already open, the page must still switch into the invited place even
 * when that place is the one it had selected — when it kept the old selection instead, the switch
 * no-opped as "already there", the profile check read the default place, and a member who had a
 * profile was asked to make one again, whose save then failed.
 */

const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept' });
const profileDialog = (page: Page) =>
    page.getByRole('dialog').getByRole('heading', { level: 2, name: `Create your profile for <${CLOUD_PLACE.name}>` });

/** Accepts the invite on screen and waits until the accept screen has handed over to the room. */
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

    // The first invite launches the app, and the guest accepts it into the place and its room.
    shell.push('OnNavigate', { path: cloudInvitePath('E2EFIRST'), replace: false });
    await page.goto('/');
    await acceptIntoRoom(page);
    expect(cloud.sessionSite).toBe(CLOUD_PLACE.id);

    // A second invite into the same cloud and place, opened while the app is in it.
    const switchesBefore = cloud.switches.length;
    const readsBefore = cloud.profileReads.length;
    shell.push('OnNavigate', { path: cloudInvitePath('E2ESECOND'), replace: false });
    await acceptIntoRoom(page);

    // The invite's token put the session on the default place; the page switched it back into the
    // invited place, and looked the profile up only there — never on the default place.
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
