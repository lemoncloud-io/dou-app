import type { Page } from '@playwright/test';

import { NO_REPLY } from '../fixtures/backend';
import { GUEST_NICK } from '../fixtures/guest';
import { expect, test } from '../support/test';

/**
 * The composer's files entry inside the app (apps/web/docs/feature/channels/image-send.md, and the
 * shell's half in `attachmentPickerHandlers`). The page asks the shell to open the OS picker with
 * `PickAttachments`; the shell keeps what was picked and answers with addresses, which the page sends
 * as a message. A shell without the picker answers `NOT_FOUND`, and the page falls back to its own
 * file input for the rest of its life.
 *
 * Every scenario stops at the room showing the message: the relay never answers the upload's first
 * step, so what follows (the shell's file transfer, `chat.send`) is not decided here.
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

/** A file message in the room — a button named by the file, which opens it. */
const fileCard = (page: Page, name: string) => page.getByRole('button', { name });

const openSelfChat = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.getByText(GUEST_NICK).first().click();
    await expect(page.getByPlaceholder('Enter a message')).toBeVisible();
};

test('a document the app picks arrives in the room as a file message', async ({ page, shell }) => {
    shell.handle('PickAttachments', () => ({ items: [REPORT], refused: [] }));
    let pageInputOpened = false;
    page.on('filechooser', () => (pageInputOpened = true));

    await openSelfChat(page);
    await chooseFromFiles(page);

    const request = await shell.waitFor('PickAttachments');
    expect(request.data).toMatchObject({ source: 'document', selectionLimit: 10 });

    await expect(fileCard(page, REPORT.name)).toBeVisible();
    await expect(page.getByText('47 KB')).toBeVisible();
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
    await expect(page.getByText('Files can be up to 50MB')).toBeVisible();

    // A second pick that is sent. Once its message is on screen, anything the first pick sent would
    // have gone out before it — so the upload requests now are the whole answer.
    await chooseFromFiles(page);
    await expect(fileCard(page, REPORT.name)).toBeVisible();
    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    expect(JSON.stringify(backend.sent('upload.start'))).not.toContain('site-backup.zip');
    await expect(fileCard(page, 'site-backup.zip')).toHaveCount(0);
});

test('an app without the picker gets the page own file input, and is not asked again', async ({ page, shell }) => {
    // No `PickAttachments` handler: the host answers `NOT_FOUND`, as an app built before the picker does.
    await openSelfChat(page);

    const firstChooser = page.waitForEvent('filechooser');
    await chooseFromFiles(page);
    await (
        await firstChooser
    ).setFiles({ name: REPORT.name, mimeType: REPORT.contentType, buffer: Buffer.alloc(REPORT.size) });
    await expect(fileCard(page, REPORT.name)).toBeVisible();
    expect(shell.received('PickAttachments')).toHaveLength(1);

    // The page learned the answer: the next tap opens its own input straight away.
    const secondChooser = page.waitForEvent('filechooser');
    await chooseFromFiles(page);
    await secondChooser;
    expect(shell.received('PickAttachments')).toHaveLength(1);
});
