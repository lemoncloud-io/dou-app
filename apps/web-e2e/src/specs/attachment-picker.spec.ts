import type { Page } from '@playwright/test';

import { NO_REPLY } from '../fixtures/backend';
import { GUEST_NICK } from '../fixtures/guest';
import { expect, test } from '../support/test';

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

const filesTray = (page: Page) => page.getByRole('group', { name: 'Files to send' });

const trayFile = (page: Page, name: string) => filesTray(page).getByRole('listitem').filter({ hasText: name });

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    await expect(page.getByText('Files can be up to 50MB', { exact: true })).toBeVisible();

    await chooseFromFiles(page);
    await expect(trayFile(page, REPORT.name)).toBeVisible();
    await expect(trayFile(page, 'site-backup.zip')).toHaveCount(0);
    await send(page);
    await expect(roomFile(page, REPORT.name)).toBeVisible();
    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    expect(JSON.stringify(backend.sent('upload.start'))).not.toContain('site-backup.zip');
    await expect(roomFile(page, 'site-backup.zip')).toHaveCount(0);
});
