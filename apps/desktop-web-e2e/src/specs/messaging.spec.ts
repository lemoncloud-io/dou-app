import type { Locator, Page } from '@playwright/test';

import {
    attach,
    channelRow,
    composer,
    deleteMessage,
    feed,
    go,
    homeList,
    marker,
    message,
    messageAction,
    openSelfRoom,
    panel,
    pressMessageButton,
    sampleFiles,
    send,
} from '../support/app';
import { expect, test } from '../support/test';

/**
 * Text, edits, reactions, threads and Saved, in a room made for each scenario (the `room` fixture) and
 * deleted with everything in it afterwards.
 */
test.describe('messages', () => {
    /** In the notes-to-self fallback nothing deletes the room, so what was sent is deleted here. */
    const tidy = async (page: Page, room: string, sent: Locator) => {
        if (room === 'You') await deleteMessage(page, sent);
    };

    test('sends a text message, edits it, and deletes it', async ({ app, room }) => {
        await expect(app.getByRole('main').getByRole('heading', { level: 1 })).toContainText(room);
        const text = marker('text');
        const sent = await send(app, text);

        const edited = `${text} edited`;
        await messageAction(app, sent, 'Edit message');
        await feed(app).getByRole('textbox').press('ControlOrMeta+a');
        await app.keyboard.type(edited);
        await app.keyboard.press('Enter');
        const after = message(app, edited);
        await expect(after).toContainText('(edited)');

        await deleteMessage(app, after);
        // The confirmation leaves nothing over the app: the rest of it still takes a click.
        await expect(app.locator('body')).not.toHaveCSS('pointer-events', 'none');
        await go(app, 'Channels');
        await go(app, 'Home');
    });

    test('reacts to a message and takes the reaction back', async ({ app, room }) => {
        const sent = await send(app, marker('reaction'));
        await pressMessageButton(app, sent, 'React with 👍');
        const chip = sent.getByRole('button', { name: /👍/ }).filter({ hasText: '1' });
        await expect(chip).toBeVisible();
        await chip.click();
        await expect(chip).toBeHidden();
        await tidy(app, room, sent);
    });

    test('replies in a thread and shows the reply count under the root', async ({ app, room }) => {
        const text = marker('thread root');
        const root = await send(app, text);
        await pressMessageButton(app, root, 'Reply in thread');

        const thread = app.getByRole('complementary', { name: 'Thread' });
        await expect(thread.getByRole('log', { name: 'Messages' })).toContainText(text);
        await send(
            app,
            marker('thread reply'),
            thread.getByRole('textbox', { name: 'Reply in thread' }),
            thread.getByRole('log')
        );
        await expect(root).toContainText('1 reply');

        await thread.getByRole('button', { name: 'Close thread' }).click();
        await expect(thread).toBeHidden();
        await tidy(app, room, root);
    });

    test('saves a message for later, finds it on the Saved page, opens it, and unsaves it', async ({ app, room }) => {
        const text = marker('saved');
        const sent = await send(app, text);
        await messageAction(app, sent, 'Save for later');

        await go(app, 'Home');
        await app.getByRole('button', { name: 'Saved items' }).click();
        const saved = app.getByRole('region', { name: 'Saved items' });
        const card = saved.getByRole('article').filter({ hasText: text });
        await expect(card).toBeVisible();
        // Where it was saved from: the channel by name, or a DM.
        await expect(card).toContainText(room === 'You' ? 'DM' : `# ${room}`);
        await saved.getByRole('button', { name: 'Files' }).click();
        await expect(card).toBeHidden();
        await saved.getByRole('button', { name: 'Messages' }).click();
        await expect(card).toBeVisible();

        // Opening a card goes to its message and puts the page away.
        await card.getByRole('button', { name: new RegExp(text) }).click();
        await expect(saved).toBeHidden();
        await expect(sent).toBeVisible();

        await app.getByRole('button', { name: 'Saved items' }).click();
        await card.getByRole('button', { name: 'Remove' }).click();
        await expect(card).toBeHidden();
        await expect(saved.getByText('Nothing saved yet')).toBeVisible();

        await homeList(app)
            .getByRole('button', { name: room === 'You' ? /You$/ : room })
            .click();
        await tidy(app, room, message(app, text));
    });
});

test.describe('files', () => {
    test('sends an image and a document, and finds the message under Files on the Saved page', async ({
        app,
        room,
    }) => {
        const tag = Date.now().toString(36);
        const [image, doc] = sampleFiles(tag);
        await attach(app, [image, doc]);
        await composer(app).click();
        await app.keyboard.press('Enter');

        // Delivered and uploaded: numbered, the image can be saved, the document has its card.
        const sent = feed(app)
            .getByRole('article')
            .filter({ has: app.getByRole('button', { name: `Open ${image.name}` }) });
        await expect(sent.getByRole('button', { name: 'Save image' })).toBeVisible({ timeout: 30_000 });
        await expect(sent.getByRole('button', { name: `Save ${doc.name}` })).toBeVisible();
        await expect(sent.and(app.locator('[data-chat-no]:not([data-chat-no="0"])'))).toBeVisible();
        await expect(app.getByRole('main').getByRole('list', { name: 'Attachments' })).toBeHidden();

        await messageAction(app, sent, 'Save for later');
        await go(app, 'Home');
        await app.getByRole('button', { name: 'Saved items' }).click();
        const saved = app.getByRole('region', { name: 'Saved items' });
        // The card names the first file.
        const card = saved.getByRole('article').filter({ hasText: image.name });
        await expect(card).toBeVisible();
        await saved.getByRole('button', { name: 'Files' }).click();
        await expect(card).toBeVisible();
        await saved.getByRole('button', { name: 'Messages' }).click();
        await expect(card).toBeHidden();
        await saved.getByRole('button', { name: 'All' }).click();
        await card.getByRole('button', { name: 'Remove' }).click();
        await expect(card).toBeHidden();

        await (room === 'You' ? homeList(app).getByRole('button', { name: /You$/ }) : channelRow(app, room)).click();
        if (room === 'You') await deleteMessage(app, sent);
    });
});

test.describe('the DM list', () => {
    test('puts the latest message of a conversation on its row', async ({ app }) => {
        // The one 1:1 every account has. The message is deleted again; see README § Limits.
        await openSelfRoom(app);
        const text = marker('preview');
        await send(app, text);

        await go(app, 'DM');
        const row = panel(app, 'Direct messages').getByRole('button', { name: /You/ }).first();
        await expect(row).toContainText(text);

        await row.click();
        await deleteMessage(app, message(app, text));
    });
});
