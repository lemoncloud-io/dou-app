import { expect, type Locator, type Page } from '@playwright/test';

export type Destination = 'Home' | 'Notifications' | 'Channels' | 'DM';

export const marker = (what: string) => `e2e ${what} ${Date.now().toString(36)}`;

export const navRail = (page: Page) => page.getByRole('navigation', { name: 'Navigation' });

export const navTile = (page: Page, destination: Destination) =>
    navRail(page).getByRole('button', { name: new RegExp(`^${destination}(,|$)`) });

export const go = async (page: Page, destination: Destination) => {
    await navTile(page, destination).click();
    await expect(navTile(page, destination)).toHaveAttribute('aria-current', 'page');
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const homeList = (page: Page) => page.getByRole('navigation', { name: 'Channels' });

export const channelRow = (page: Page, name: string) =>
    homeList(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(?!-)`) });

export const panel = (page: Page, title: 'Notifications' | 'Channels' | 'Direct messages') =>
    page.getByRole('complementary').getByRole('region', { name: title });

export const switchCloud = async (page: Page, name: string) => {
    const rail = page.getByRole('navigation', { name: 'Clouds and places' });
    const current = rail.getByRole('button', { name: /^Switch cloud: / });
    if ((await current.getAttribute('aria-label')) === `Switch cloud: ${name}`) return;
    await current.click();
    await page.getByRole('menuitem', { name, exact: true }).click();
    await expect(current).toHaveAccessibleName(`Switch cloud: ${name}`, { timeout: 30_000 });
};

export const placeTile = (page: Page, name: string) =>
    page
        .getByRole('navigation', { name: 'Clouds and places' })
        .getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(, unread messages)?$`) });

export const openPlace = async (page: Page, name: string) => {
    await placeTile(page, name).click();
    await expect(page.getByRole('complementary').getByRole('heading', { level: 2, name })).toBeVisible();
    await expect(
        page
            .getByRole('main')
            .or(page.getByRole('region', { name: 'Home' }))
            .getByRole('heading', { level: 1 })
    ).toBeVisible();
};

export const openSelfRoom = async (page: Page) => {
    await switchCloud(page, 'Home');
    await go(page, 'Home');
    await homeList(page)
        .getByRole('button', { name: /^\S* ?You$/ })
        .click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
};

export const feed = (page: Page) => page.getByRole('main').getByRole('log', { name: 'Messages' });

export const message = (page: Page, text: string, within: Locator = feed(page)) =>
    within.getByRole('article').filter({ has: page.getByRole('paragraph').filter({ hasText: text }) });

export const pressMessageButton = async (page: Page, target: Locator, name: string) => {
    const button = target.getByRole('button', { name });
    await expect
        .poll(async () => {
            await target.focus();
            return button.evaluate(el => !el.closest('[inert]'));
        })
        .toBe(true);
    await button.focus();
    await page.keyboard.press('Enter');
};

export const composer = (page: Page) =>
    page.getByRole('main').getByRole('textbox', { name: /^(Message|Write a note)/ });

export const send = async (page: Page, text: string, box: Locator = composer(page), within: Locator = feed(page)) => {
    await box.click();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    const sent = message(page, text, within);
    await expect(sent.and(page.locator('[data-chat-no]:not([data-chat-no="0"])'))).toBeVisible();
    await expect(sent).toHaveCount(1);
    return sent;
};

export const messageAction = async (page: Page, target: Locator, item: string) => {
    await expect(async () => {
        await pressMessageButton(page, target, 'More actions');
        await page
            .getByRole('menu', { name: 'More actions' })
            .getByRole('menuitem', { name: item })
            .click({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
};

export const deleteMessage = async (page: Page, target: Locator) => {
    await messageAction(page, target, 'Delete message');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(target).toBeHidden();
};

export const deleteChannel = async (page: Page, name: string) => {
    await go(page, 'Home');
    const row = channelRow(page, name);
    const listed = await row.waitFor({ timeout: 10_000 }).then(
        () => true,
        () => false
    );
    if (!listed) return;
    await row.click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(name);
    await page.getByRole('main').getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Channel settings' }).click();
    await page.getByRole('button', { name: 'Delete channel' }).click();
    await page
        .getByRole('alertdialog')
        .or(page.getByRole('dialog', { name: `Delete #${name}?` }))
        .getByRole('button', { name: 'Delete channel' })
        .click();
    await expect(row).toBeHidden();
};

export const createChannel = async (page: Page, name: string) => {
    await go(page, 'Home');
    await homeList(page).getByRole('button', { name: 'Add channel' }).click();
    const dialog = page.getByRole('dialog', { name: 'New channel' });
    await dialog.getByRole('textbox', { name: 'Channel name' }).fill(name);
    await dialog.getByRole('button', { name: 'Create channel' }).click();
    await expect(dialog).toBeHidden();
    const listed = channelRow(page, name);
    await expect(listed).toBeVisible();
    const header = page.getByRole('main').getByRole('heading', { level: 1 });
    if (!(await header.textContent())?.includes(name)) await listed.click();
    await expect(header).toContainText(name);
};

export const sampleFiles = (tag: string) => [
    { name: `e2e-${tag}.png`, mimeType: 'image/png', buffer: Buffer.from(SQUARE_PNG, 'base64') },
    { name: `e2e-${tag}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(EMPTY_PDF) },
];

const SQUARE_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfB/inMZQpD+HEIgwW4zT7r64YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLXjsAtXtoYfgUoOoAAAAAElFTkSuQmCC';
const EMPTY_PDF =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

export const attach = async (page: Page, files: ReturnType<typeof sampleFiles>) => {
    await page.getByRole('main').locator('input[type=file]').setInputFiles(files);
    await expect(page.getByRole('main').getByRole('list', { name: 'Attachments' }).getByRole('listitem')).toHaveCount(
        files.length
    );
};
