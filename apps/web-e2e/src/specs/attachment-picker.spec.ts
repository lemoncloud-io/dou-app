import type { Page } from '@playwright/test';

import { NO_REPLY } from '../fixtures/backend';
import { GUEST_NICK } from '../fixtures/guest';
import { expect, test } from '../support/test';

/**
 * The composer's files entry inside the app (apps/web/docs/feature/channels/image-send.md, and the
 * shell's half in `attachmentPickerHandlers`). The page asks the shell to open the OS picker with
 * `PickAttachments`; the shell keeps what was picked and answers with addresses. What was picked waits
 * above the composer in the "Files to send" tray, and goes to the room as a message only when Send is
 * pressed. A shell without the picker answers `NOT_FOUND`, and the page falls back to its own file
 * input for the rest of its life — whose files wait in the same tray.
 *
 * Every scenario stops at the room showing the message as sending: the relay never answers the
 * upload's first step, so what follows (the shell's file transfer, `chat.send`) is not decided here.
 */

const REPORT = {
    kind: 'file' as const,
    uri: 'file:///e2e/attach-pick/quarterly-report.pdf',
    name: 'quarterly-report.pdf',
    contentType: 'application/pdf',
    size: 48_213,
};

test.beforeEach(({ backend }) => {
    backend.useSocket({ 'upload.start': () => NO_REPLY });
});

/** From home into the guest's self chat, then the composer's attach menu → files → choose from files. */
const chooseFromFiles = async (page: Page): Promise<void> => {
    await page.getByRole('button', { name: 'Open attachments' }).click();
    await page.getByText('Files', { exact: true }).click();
    await page.getByText('Choose from files').click();
};

const openSelfChat = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.getByText(GUEST_NICK).first().click();
    await expect(page.getByPlaceholder('Enter a message')).toBeVisible();
};

/** The files waiting above the composer. Not a message: nothing has been sent from here. */
const filesTray = (page: Page) => page.getByRole('group', { name: 'Files to send' });

/** One file waiting in the tray — a chip, whose name is drawn twice (in full, and shortened to fit). */
const trayFile = (page: Page, name: string) => filesTray(page).getByRole('listitem').filter({ hasText: name });

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A file message in the room: a button whose name starts with the file's name (then its size). The
 * name is anchored at the start on purpose — a plain substring match also finds the tray's
 * "Remove <name>" button, which is how these scenarios once passed with the file never sent.
 */
const roomFile = (page: Page, name: string) =>
    page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(\\s|$)`) });

const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true }).click();

test('a document the app picks waits in the tray, and Send makes it a file message', async ({
    page,
    shell,
    backend,
}) => {
    shell.handle('PickAttachments', () => ({ items: [REPORT], refused: [] }));
    let pageInputOpened = false;
    page.on('filechooser', () => (pageInputOpened = true));

    await openSelfChat(page);
    await chooseFromFiles(page);

    const request = await shell.waitFor('PickAttachments');
    expect(request.data).toMatchObject({ source: 'document', selectionLimit: 10 });

    // Picked, not sent: the file waits in the tray, and nothing has gone to the relay.
    await expect(trayFile(page, REPORT.name)).toBeVisible();
    await expect(trayFile(page, REPORT.name)).toContainText('47 KB');
    await expect(roomFile(page, REPORT.name)).toHaveCount(0);
    expect(backend.sent('upload.start')).toHaveLength(0);

    await send(page);

    await expect(filesTray(page)).toHaveCount(0);
    await expect(roomFile(page, REPORT.name)).toBeVisible();
    await expect(page.getByRole('status', { name: 'Sending' })).toBeVisible();
    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    expect(JSON.stringify(backend.sent('upload.start')[0]?.data)).toContain(REPORT.name);
    // The shell's picker answered, so the page never opened one of its own.
    expect(pageInputOpened).toBe(false);
});

test('a file the app would not copy is reported, and nothing is sent', async ({ page, shell, backend }) => {
    let picks = 0;
    shell.handle('PickAttachments', () =>
        ++picks === 1
            ? { items: [], refused: [{ name: 'site-backup.zip', kind: 'file', reason: 'too-large' }] }
            : { items: [REPORT], refused: [] }
    );

    await openSelfChat(page);
    await chooseFromFiles(page);
    // Exact: the toast's text also sits, prefixed, in the toaster's live region, which strict mode would trip on.
    await expect(page.getByText('Files can be up to 50MB', { exact: true })).toBeVisible();

    // A second pick that is sent. Once its message is in the room, anything the first pick put in the
    // tray or sent would have shown by then — so the tray and the upload requests now are the answer.
    await chooseFromFiles(page);
    await expect(trayFile(page, REPORT.name)).toBeVisible();
    await expect(trayFile(page, 'site-backup.zip')).toHaveCount(0);
    await send(page);
    await expect(roomFile(page, REPORT.name)).toBeVisible();
    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    expect(JSON.stringify(backend.sent('upload.start'))).not.toContain('site-backup.zip');
    await expect(roomFile(page, 'site-backup.zip')).toHaveCount(0);
});

test('an app without the picker gets the page own file input, and is not asked again', async ({
    page,
    shell,
    backend,
}) => {
    // No `PickAttachments` handler: the host answers `NOT_FOUND`, as an app built before the picker does.
    await openSelfChat(page);

    const firstChooser = page.waitForEvent('filechooser');
    await chooseFromFiles(page);
    await (
        await firstChooser
    ).setFiles({ name: REPORT.name, mimeType: REPORT.contentType, buffer: Buffer.alloc(REPORT.size) });
    await expect(trayFile(page, REPORT.name)).toBeVisible();
    await send(page);
    await expect(roomFile(page, REPORT.name)).toBeVisible();
    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    expect(shell.received('PickAttachments')).toHaveLength(1);

    // The page learned the answer: the next tap opens its own input straight away.
    const secondChooser = page.waitForEvent('filechooser');
    await chooseFromFiles(page);
    await secondChooser;
    expect(shell.received('PickAttachments')).toHaveLength(1);
});
