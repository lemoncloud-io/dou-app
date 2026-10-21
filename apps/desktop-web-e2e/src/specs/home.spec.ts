import { SANDBOX } from '../support/env';
import { go, homeList, openPlace, openSelfRoom, panel, switchCloud } from '../support/app';
import { expect, test } from '../support/test';

test.describe('home', () => {
    test('lists Saved items, then Favorites, Channels and Direct messages, each folding away', async ({ app }) => {
        await openSelfRoom(app);
        const sidebar = app.getByRole('complementary');
        await expect(sidebar.getByRole('button', { name: 'Saved items' })).toBeVisible();

        const list = homeList(app);
        for (const section of ['Favorites', 'Channels', 'Direct messages']) {
            await expect(list.getByRole('button', { name: section, exact: true })).toHaveAttribute(
                'aria-expanded',
                'true'
            );
        }
        // Folding Channels takes its rows (or its empty line) away; the open room is a DM, so none of
        // them is kept, as the selected row would be.
        const channels = list.getByRole('button', { name: 'Channels', exact: true });
        const drawn = list.locator('button, p');
        const unfolded = await drawn.count();
        await channels.click();
        await expect(channels).toHaveAttribute('aria-expanded', 'false');
        await expect.poll(() => drawn.count()).toBeLessThan(unfolded);
        await channels.click();
        await expect(channels).toHaveAttribute('aria-expanded', 'true');
        await expect(drawn).toHaveCount(unfolded);
    });

    test('shows an empty Saved page when nothing is saved', async ({ app }) => {
        await app.evaluate(() => localStorage.removeItem('chatic-saved-items'));
        await app.reload();
        await app.getByRole('button', { name: 'Saved items' }).click();
        const saved = app.getByRole('region', { name: 'Saved items' });
        await expect(saved.getByRole('heading', { level: 1 })).toHaveText(/Saved items\s*0/);
        await expect(saved.getByText('Nothing saved yet')).toBeVisible();
        for (const filter of ['All', 'Messages', 'Files']) {
            await expect(saved.getByRole('button', { name: filter })).toBeDisabled();
        }
    });

    test('opens a place with no conversation on its welcome page, until Later', async ({ app }) => {
        const { cloud, emptyPlace } = SANDBOX;
        if (!cloud || !emptyPlace) return test.skip(true, 'DESKTOP_E2E_CLOUD / DESKTOP_E2E_EMPTY_PLACE are not set');
        await switchCloud(app, cloud);
        await openPlace(app, emptyPlace);

        const welcome = app.getByRole('region', { name: 'Home' }).filter({
            has: app.getByRole('heading', { level: 1, name: `Welcome to ${emptyPlace}` }),
        });
        await expect(welcome).toBeVisible();
        for (const step of ['Create a channel', 'Invite members', 'Send a DM', 'Set up your profile']) {
            await expect(welcome.getByRole('button', { name: new RegExp(step) })).toBeVisible();
        }
        await expect(welcome.getByText(/^\d\/4 done$/)).toBeVisible();

        await welcome.getByRole('button', { name: 'Later' }).click();
        await expect(welcome).toBeHidden();
    });
});

test.describe('direct messages list', () => {
    test('finds a conversation by name and says when nothing matches', async ({ app }) => {
        await openSelfRoom(app);
        await go(app, 'DM');
        const dms = panel(app, 'Direct messages');
        const search = dms.getByRole('searchbox', { name: 'Search direct messages' });

        await search.fill('You');
        await expect(dms.getByRole('listitem').first()).toContainText('You');
        await search.fill('zz-no-such-person');
        await expect(dms.getByText('No conversations match “zz-no-such-person”')).toBeVisible();
        await search.fill('');

        await dms.getByRole('listitem').filter({ hasText: 'You' }).first().getByRole('button').click();
        await expect(app.getByRole('main').getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
    });
});
