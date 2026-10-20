import { go, homeList, navRail, navTile, panel } from '../support/app';
import { expect, test } from '../support/test';

test.describe('nav rail shell', () => {
    test('lists the four destinations and the account menu, with Home open on arrival', async ({ app }) => {
        for (const destination of ['Home', 'Notifications', 'Channels', 'DM'] as const) {
            await expect(navTile(app, destination)).toBeVisible();
        }
        await expect(navRail(app).getByRole('button', { name: /^Account menu: / })).toBeVisible();
        await expect(navTile(app, 'Home')).toHaveAttribute('aria-current', 'page');
    });

    test('swaps the sidebar for each destination and keeps the open room in the main pane', async ({ app }) => {
        const room = app.getByRole('main').getByRole('heading', { level: 1 });
        await expect(room).toBeVisible();
        const roomName = await room.textContent();

        await go(app, 'Notifications');
        await expect(panel(app, 'Notifications').getByRole('heading', { name: 'Notifications' })).toBeVisible();
        await expect(homeList(app)).toBeHidden();
        await expect(room).toHaveText(roomName ?? '');

        await go(app, 'Channels');
        await expect(panel(app, 'Channels').getByRole('searchbox', { name: 'Search channels' })).toBeVisible();

        await go(app, 'DM');
        await expect(
            panel(app, 'Direct messages').getByRole('searchbox', { name: 'Search direct messages' })
        ).toBeVisible();

        await go(app, 'Home');
        await expect(app.getByRole('complementary').getByRole('heading', { level: 2, name: 'Home' })).toBeVisible();
        await expect(homeList(app)).toBeVisible();
        await expect(room).toHaveText(roomName ?? '');
    });

    test('switches clouds from the dropdown under the current cloud tile', async ({ app }) => {
        const rail = app.getByRole('navigation', { name: 'Clouds and places' });
        await rail.getByRole('button', { name: 'Switch cloud: Home' }).click();
        const menu = app.getByRole('menu');
        await expect(menu.getByRole('menuitem', { name: 'Home', exact: true })).toBeVisible();
        // The default cloud and at least one more: what the account belongs to.
        expect(await menu.getByRole('menuitem').count()).toBeGreaterThan(1);
        await app.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    });
});
