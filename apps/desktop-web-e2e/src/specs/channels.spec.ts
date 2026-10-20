import { SANDBOX } from '../support/env';
import { deleteChannel, go, homeList, marker, openPlace, panel, send, switchCloud } from '../support/app';
import { expect, test } from '../support/test';

/**
 * A channel's whole life in a sandbox place: created, talked in, found from the Channels list, and
 * deleted again — whatever happened in between — so the place is left as it was.
 */
test.describe('channels', () => {
    test('creates a channel, sends to it, finds it in the Channels list, and deletes it', async ({ app }) => {
        const { cloud, place } = SANDBOX;
        if (!cloud || !place) return test.skip(true, 'DESKTOP_E2E_CLOUD / DESKTOP_E2E_PLACE are not set');
        await switchCloud(app, cloud);
        await openPlace(app, place);
        await go(app, 'Home');

        const name = `e2e-${Date.now().toString(36)}`;
        await homeList(app).getByRole('button', { name: 'Add channel' }).click();
        const dialog = app.getByRole('dialog', { name: 'New channel' });
        const submit = dialog.getByRole('button', { name: 'Create channel' });
        await expect(submit).toBeDisabled();
        await dialog.getByRole('textbox', { name: 'Channel name' }).fill(name);
        await submit.click();
        await expect(dialog).toBeHidden();

        try {
            // The Home sidebar lists the new channel, and it opens. The open is soft: now and then the
            // room that was open stays open instead, and the rest of the scenario is still worth
            // running — it opens the channel from the list then.
            const header = app.getByRole('main').getByRole('heading', { level: 1 });
            const listed = homeList(app).getByRole('button', { name, exact: true });
            await expect(listed).toBeVisible();
            await expect.soft(header, 'a created channel opens').toContainText(name);
            if (!(await header.textContent())?.includes(name)) await listed.click();
            await expect(header).toContainText(name);

            const text = marker('channel');
            await send(app, text);

            // The Channels list shows it first (most recent activity), with what was just sent. A
            // channel row names the sender even when it is me; only a 1:1 says "You:".
            await go(app, 'Channels');
            const channels = panel(app, 'Channels');
            const row = channels.getByRole('listitem').filter({ hasText: name });
            await expect(row).toContainText(`: ${text}`);
            await expect(channels.getByRole('listitem').first()).toContainText(name);

            const search = channels.getByRole('searchbox', { name: 'Search channels' });
            await search.fill(name);
            await expect(channels.getByRole('listitem')).toHaveCount(1);
            await search.fill(`${name}-nothing`);
            await expect(channels.getByText(`No channels match “${name}-nothing”`)).toBeVisible();
            await search.fill('');

            await row.getByRole('button').click();
            await expect(header).toContainText(name);
        } finally {
            await deleteChannel(app, name);
        }
        await go(app, 'Channels');
        await expect(panel(app, 'Channels').getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
    });
});
