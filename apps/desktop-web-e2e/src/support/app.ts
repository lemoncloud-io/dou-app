import { expect, type Locator, type Page } from '@playwright/test';

/** Steps the scenarios share. Every control is found by its role and English name, as a reader would. */

export type Destination = 'Home' | 'Notifications' | 'Channels' | 'DM';

/** A unique marker for text a scenario writes, so it can find its own message among real history. */
export const marker = (what: string) => `e2e ${what} ${Date.now().toString(36)}`;

export const navRail = (page: Page) => page.getByRole('navigation', { name: 'Navigation' });

/** A nav destination's tile. Its name gains ", something unread" while it holds something unread. */
export const navTile = (page: Page, destination: Destination) =>
    navRail(page).getByRole('button', { name: new RegExp(`^${destination}(,|$)`) });

export const go = async (page: Page, destination: Destination) => {
    await navTile(page, destination).click();
    await expect(navTile(page, destination)).toHaveAttribute('aria-current', 'page');
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The Home sidebar's list of favorites, channels and DMs. */
export const homeList = (page: Page) => page.getByRole('navigation', { name: 'Channels' });

/**
 * A channel's row in the Home list, by its name. The row's name runs straight on into what it shows
 * beside the channel's ("Unread", a mention), so it is matched by how it starts. A hyphen may not
 * follow, so a scenario's `name-1` and `name-2` are told from `name`; names here are unique tags, so
 * that is the only kind of longer name that starts the same way.
 */
export const channelRow = (page: Page, name: string) =>
    homeList(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(?!-)`) });

/** The sidebar panel a nav destination other than Home opens, by its title. */
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

/** A place's tile in the left rail. Its name gains ", unread messages" while the place holds some. */
export const placeTile = (page: Page, name: string) =>
    page
        .getByRole('navigation', { name: 'Clouds and places' })
        .getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(, unread messages)?$`) });

/**
 * Opens a place and waits for it to land. Until it has, the landing still to come takes the main pane
 * back from anything opened in the meantime.
 */
export const openPlace = async (page: Page, name: string) => {
    await placeTile(page, name).click();
    // Landed: the sidebar is titled with the place, and the main pane holds a room or the welcome page.
    await expect(page.getByRole('complementary').getByRole('heading', { level: 2, name })).toBeVisible();
    await expect(
        page
            .getByRole('main')
            .or(page.getByRole('region', { name: 'Home' }))
            .getByRole('heading', { level: 1 })
    ).toBeVisible();
};

/** The default cloud's notes-to-self room: Home, then the "You" row under Direct messages. */
export const openSelfRoom = async (page: Page) => {
    await switchCloud(page, 'Home');
    await go(page, 'Home');
    await homeList(page)
        .getByRole('button', { name: /^\S* ?You$/ })
        .click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
};

export const feed = (page: Page) => page.getByRole('main').getByRole('log', { name: 'Messages' });

/** The message whose text is `text`, in the room's feed (or `within` another feed, such as a thread's). */
export const message = (page: Page, text: string, within: Locator = feed(page)) =>
    within.getByRole('article').filter({ has: page.getByRole('paragraph').filter({ hasText: text }) });

/**
 * Presses one of the buttons a message shows on hover (React with 👍, Reply in thread, More actions).
 * By keyboard, as the bar allows: it stays inert until its message is hovered or focused, and a
 * pointer travelling to it crosses the row above (the bar floats over it), which takes the hover away
 * and the bar with it. Focus does not move that way: the message is a tab stop, and focus inside it
 * keeps its bar live.
 */
export const pressMessageButton = async (page: Page, target: Locator, name: string) => {
    const button = target.getByRole('button', { name });
    // Focus again on each look: a row drawn anew (a message arriving above it) drops the focus.
    await expect
        .poll(async () => {
            await target.focus();
            return button.evaluate(el => !el.closest('[inert]'));
        })
        .toBe(true);
    await button.focus();
    await page.keyboard.press('Enter');
};

/** The room's composer, whatever it is called there ("Message #name", "Write a note to yourself", …). */
export const composer = (page: Page) =>
    page.getByRole('main').getByRole('textbox', { name: /^(Message|Write a note)/ });

/**
 * Sends `text` and returns its message once the server has numbered it. Until then the row is a
 * pending copy that is replaced on delivery, and whatever a scenario does to the copy is lost with it.
 */
export const send = async (page: Page, text: string, box: Locator = composer(page), within: Locator = feed(page)) => {
    await box.click();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    const sent = message(page, text, within);
    // Delivered: numbered, and the pending copy gone — a sent message is drawn once.
    await expect(sent.and(page.locator('[data-chat-no]:not([data-chat-no="0"])'))).toBeVisible();
    await expect(sent).toHaveCount(1);
    return sent;
};

/** Opens a message's More actions menu and picks `item`. */
export const messageAction = async (page: Page, target: Locator, item: string) => {
    // The menu closes when its row is drawn anew (the server's echo of a fresh message); open it again.
    await expect(async () => {
        await pressMessageButton(page, target, 'More actions');
        await page
            .getByRole('menu', { name: 'More actions' })
            .getByRole('menuitem', { name: item })
            .click({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
};

/** Deletes a message this scenario sent, so the account's history does not pile up with test text. */
export const deleteMessage = async (page: Page, target: Locator) => {
    await messageAction(page, target, 'Delete message');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(target).toBeHidden();
};

/** Deletes a channel of the open place by name: open it from Home, then settings, Delete channel, confirm. */
export const deleteChannel = async (page: Page, name: string) => {
    await go(page, 'Home');
    const row = channelRow(page, name);
    // Give the list a moment to arrive: a row not drawn yet is not a channel already gone.
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

/**
 * Creates a public channel in the open place and returns it opened. If the app does not open it by
 * itself, it is opened from the Home list: a scenario that only needs a room to work in should not
 * fail on that (the channels scenario checks the open itself).
 */
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

/**
 * A small image and a short document named after `tag`, so a scenario finds its own upload. Made here
 * so the suite carries no binary files.
 */
export const sampleFiles = (tag: string) => [
    { name: `e2e-${tag}.png`, mimeType: 'image/png', buffer: Buffer.from(SQUARE_PNG, 'base64') },
    { name: `e2e-${tag}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(EMPTY_PDF) },
];

/** A 64×64 lime square. */
const SQUARE_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfB/inMZQpD+HEIgwW4zT7r64YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLXjsAtXtoYfgUoOoAAAAAElFTkSuQmCC';
const EMPTY_PDF =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

/**
 * Puts files in the composer's tray, as the "+" button's picker would. The picker's input is hidden and
 * has no role, so it is the one control found by its tag.
 */
export const attach = async (page: Page, files: ReturnType<typeof sampleFiles>) => {
    await page.getByRole('main').locator('input[type=file]').setInputFiles(files);
    await expect(page.getByRole('main').getByRole('list', { name: 'Attachments' }).getByRole('listitem')).toHaveCount(
        files.length
    );
};
