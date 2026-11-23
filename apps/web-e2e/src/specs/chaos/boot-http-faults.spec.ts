import { DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { signedInMember } from '../../fixtures/subscription';
import { composer, home, myTab, roomRow } from '../../support/app';
import { expect, test } from '../../support/test';

test(
    'a signed-in boot whose membership read fails with 503 and cloud list hangs still opens home, its rooms and MY',
    { tag: '@chaos' },
    async ({ page, backend, chaos, evidence }) => {
        backend.useSocket(roomsSocket(backend, [dmRoom()]));
        signedInMember(backend);
        chaos.failHttp('GET /memberships/0/mine', { status: 503 });
        chaos.failHttp('GET /clouds/0/list', { hang: true, hangMs: 10_000 });

        await page.goto('/');
        await expect(home(page)).toBeVisible({ timeout: 15_000 });
        await expect(roomRow(page, MINA.nick)).toBeVisible();
        chaos.recovered('home drawn');
        await evidence.shot('home despite a 503 membership read and a hanging cloud list');

        await roomRow(page, MINA.nick).click();
        await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
        await expect(composer(page)).toBeVisible();
        chaos.recovered('room opened');

        await page.goBack();
        await myTab(page).click();
        await expect(page.getByRole('button', { name: 'Subscription', exact: true })).toBeVisible();
        await expect(page.getByText('Sign in required')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'An Error Occurred' })).toHaveCount(0);
        await evidence.shot('MY opens');
    }
);
