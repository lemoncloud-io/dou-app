import type { Page } from '@playwright/test';

import { go, navTile, openSelfRoom, panel } from '../support/app';
import { expect, test } from '../support/test';

/**
 * The Notifications panel. The inbox is kept on the device, filled from what the socket delivers while
 * the app runs, so a scenario puts items into that store itself — pointing at the account's own
 * notes-to-self room, so opening one has somewhere real to go — instead of waiting for another person
 * to mention this account.
 */
/**
 * Replaces what the inbox holds, through the running app's own store. Not by rewriting its
 * `localStorage` copy and reloading: the app writes that copy whenever the store changes, and a write
 * landing between the two lost the items. The dev server serves the module at its source path.
 */
const setInbox = (page: Page, items: object[]) =>
    page.evaluate(async seeded => {
        const path = '/src/app/shared/stores/useMentionsStore.ts';
        const { useMentionsStore } = await import(/* @vite-ignore */ path);
        useMentionsStore.setState({
            items: Object.fromEntries(seeded.map(item => [(item as { id: string }).id, item])),
        });
    }, items);

const seedInbox = async (page: Page) => {
    await openSelfRoom(page);
    const channelId = await page.evaluate(
        () => JSON.parse(localStorage.getItem('chatic-selected-channel') ?? '{}').state?.selectedChannelId as string
    );
    // Far past the room's last message: the room is open, and anything at or below what I have read in
    // it is marked read along with it.
    const chatNo = 1_000_000_000;
    const now = Date.now();
    const items = [
        {
            id: 'e2e-mention',
            channelId,
            chatNo,
            content: 'e2e hello @me',
            ownerName: 'Ada',
            createdAt: now - 60_000,
            kind: 'direct',
        },
        {
            id: 'e2e-dm',
            channelId,
            chatNo,
            content: 'e2e a direct message',
            ownerName: 'Bo',
            createdAt: now - 120_000,
            kind: 'dm',
        },
        {
            id: 'e2e-reply',
            channelId,
            chatNo,
            content: 'e2e a reply',
            ownerName: 'Cy',
            createdAt: now - 26 * 3_600_000,
            kind: 'reply',
            parentId: '1',
            readAt: now,
        },
    ];
    await setInbox(page, items);
    await go(page, 'Notifications');
    return panel(page, 'Notifications');
};

const cards = (inbox: ReturnType<typeof panel>) => inbox.getByRole('listitem');
const card = (inbox: ReturnType<typeof panel>, text: string) => cards(inbox).filter({ hasText: text });

test.describe('notifications', () => {
    test('says there is nothing new when the inbox is empty', async ({ app }) => {
        await setInbox(app, []);
        await go(app, 'Notifications');
        const inbox = panel(app, 'Notifications');
        await expect(inbox.getByText('No new notifications')).toBeVisible();
        await expect(inbox.getByRole('button', { name: 'Select notifications' })).toBeDisabled();
        await expect(inbox.getByRole('button', { name: 'Unread', exact: true })).toBeDisabled();
    });

    test('groups items by day, filters by tab and to unread, and sorts', async ({ app }) => {
        const inbox = await seedInbox(app);
        // An unread mention marks the destination's tile.
        await expect(navTile(app, 'Notifications')).toHaveAccessibleName('Notifications, something unread');

        await expect(inbox.getByRole('region', { name: 'Today' })).toBeVisible();
        await expect(inbox.getByRole('region', { name: 'Yesterday' })).toBeVisible();
        await expect(cards(inbox)).toHaveCount(3);
        await expect(card(inbox, 'e2e hello @me')).toContainText('Channel mention');
        await expect(card(inbox, 'e2e a direct message')).toContainText('Direct message');
        await expect(card(inbox, 'e2e a reply')).toContainText('Replied to your message');

        await inbox.getByRole('tab', { name: /^DM/ }).click();
        await expect(cards(inbox)).toHaveCount(1);
        await expect(cards(inbox)).toContainText('e2e a direct message');
        await inbox.getByRole('tab', { name: /^Threads/ }).click();
        await expect(cards(inbox)).toContainText('e2e a reply');
        await inbox.getByRole('tab', { name: /^All/ }).click();

        const unread = inbox.getByRole('button', { name: 'Unread', exact: true });
        await unread.click();
        await expect(unread).toHaveAttribute('aria-pressed', 'true');
        await expect(cards(inbox)).toHaveCount(2);
        await expect(card(inbox, 'e2e a reply')).toHaveCount(0);
        await unread.click();

        await inbox.getByRole('button', { name: 'Sort: Newest' }).click();
        const sort = app.getByRole('menu', { name: 'Sort: Newest' });
        await expect(sort.getByRole('menuitemradio')).toHaveText(['Newest', 'Oldest', 'Unread first']);
        await sort.getByRole('menuitemradio', { name: 'Oldest' }).click();
        await expect(inbox.getByRole('button', { name: 'Sort: Oldest' })).toBeVisible();
        await expect(cards(inbox).first()).toContainText('e2e a reply');
    });

    test('opens an unread item in its room, keeps it marked for a moment, then lets the unread filter drop it', async ({
        app,
    }) => {
        const inbox = await seedInbox(app);
        await inbox.getByRole('button', { name: 'Unread', exact: true }).click();
        const item = card(inbox, 'e2e hello @me');
        await item.getByRole('button').click();

        await expect(app.getByRole('main').getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
        // Read now, but still listed under Unread while it shows as the one just opened…
        await expect(item).toBeVisible();
        await expect(item.getByRole('button')).toHaveAttribute('aria-current', 'true');
        // …and gone once the three seconds are up.
        await expect(item).toHaveCount(0, { timeout: 6_000 });
        await expect(cards(inbox)).toHaveCount(1);
    });

    test('selects items to mark read, then deletes them after a confirmation', async ({ app }) => {
        const inbox = await seedInbox(app);
        await inbox.getByRole('button', { name: 'Select notifications' }).click();
        await expect(inbox.getByText('0 selected')).toBeVisible();

        await inbox.getByRole('checkbox', { name: /e2e hello @me/ }).check();
        await expect(inbox.getByText('1 selected')).toBeVisible();
        await inbox.getByRole('button', { name: 'Mark as read' }).click();

        await inbox.getByRole('checkbox', { name: 'Select all' }).check();
        await expect(inbox.getByText('3 selected')).toBeVisible();
        await inbox.getByRole('button', { name: 'Delete' }).click();
        const confirm = app.getByRole('alertdialog').or(app.getByRole('dialog', { name: 'Delete 3 notifications?' }));
        await expect(confirm).toContainText('Delete 3 notifications?');
        await confirm.getByRole('button', { name: 'Delete' }).click();

        await expect(inbox.getByText('No new notifications')).toBeVisible();
        await expect(navTile(app, 'Notifications')).toHaveAccessibleName('Notifications');
    });

    test('marks everything read at once, and can undo it', async ({ app }) => {
        const inbox = await seedInbox(app);
        await inbox.getByRole('button', { name: 'Select notifications' }).click();
        await inbox.getByRole('button', { name: 'Selection options' }).click();
        await app.getByRole('menuitem', { name: 'Mark all as read' }).click();

        // The toast's text, and its copy read out by the live region.
        const toast = app.getByText('Marked 2 notifications as read').first();
        await expect(toast).toBeVisible();
        await expect(navTile(app, 'Notifications')).toHaveAccessibleName('Notifications');
        await app.getByRole('button', { name: 'Undo' }).click();
        await expect(navTile(app, 'Notifications')).toHaveAccessibleName('Notifications, something unread');
    });
});
