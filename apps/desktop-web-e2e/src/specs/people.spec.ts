import type { Browser, Locator, Page } from '@playwright/test';

import { INVITE_PHONE, SANDBOX } from '../support/env';
import {
    channelRow,
    composer,
    feed,
    go,
    homeList,
    marker,
    message,
    navTile,
    openPlace,
    panel,
    placeTile,
    pressMessageButton,
    send,
    switchCloud,
} from '../support/app';
import { banners } from '../support/shell';
import { expect, openAs, ready, saveSession, test } from '../support/test';

/**
 * Two people. The main account invites someone into the sandbox place by phone, the invitee joins on a
 * device of their own with the link the server answered with, and from then on the two talk: a 1:1
 * both ways, then what the invitee does — a 1:1 message, a reaction and a thread reply to the main
 * account's message, a mention in a channel — reaching the main account's Notifications panel and its
 * desktop banners, marking rows and nav tiles unread until they are opened, and opening in their own
 * place from a notification read in another.
 *
 * The scenarios run in order and share the invitee: the first one makes them, and the rest skip when it
 * did not. Every run invites a new guest, so the place gains a member each run (README § Limits).
 *
 * The main account runs as if inside the desktop shell, because the app raises banners only there; the
 * stand-in shell records them (`banners()`).
 */
test.describe.configure({ mode: 'serial' });
test.use({ shell: true });

// Empty when not configured; the scenarios skip then.
const { cloud = '', place = '', emptyPlace = '' } = SANDBOX;
const phone = INVITE_PHONE ?? '';
const tag = Date.now().toString(36);
/** The invitee's name in the place: unique per run, so the main account finds this run's invitee. */
const peerName = `E2E Peer ${tag}`;
/** The link the server answered the invite with, read off the socket. */
let inviteLink = '';
/** The main account's name as the invitee sees it: the title of their 1:1. */
let mainName = '';

/** The invitee's pages a scenario opened, closed after it whether it passed or not. */
const peers: Page[] = [];

/** The invitee, on `/` with the shell drawn, in the sandbox place. */
const openPeer = async (browser: Browser): Promise<Page> => {
    const peer = await openAs(browser, 'peer');
    peers.push(peer);
    await ready(peer);
    await openPlace(peer, place);
    return peer;
};

/** The main account in the sandbox place. */
const enterSandbox = async (app: Page) => {
    await switchCloud(app, cloud);
    await openPlace(app, place);
};

/**
 * The main account's 1:1 with the invitee, through New message: searched by name, then opened, which
 * starts it the first time and returns to it after that.
 */
const openDmWithPeer = async (app: Page) => {
    await go(app, 'Home');
    await homeList(app).getByRole('button', { name: 'New message' }).click();
    const dialog = app.getByRole('dialog', { name: 'New message' });
    await dialog.getByRole('textbox', { name: 'Search by name or user ID' }).fill(peerName);
    await dialog
        .getByRole('button', { name: new RegExp(peerName) })
        .first()
        .click();
    await expect(app.getByRole('main').getByRole('heading', { level: 1 })).toContainText(peerName, {
        timeout: 20_000,
    });
};

/** The invitee's 1:1 with the main account: the DM list's row whose preview is `text`. */
const openDmOnPeer = async (peer: Page, text: string) => {
    await go(peer, 'DM');
    await panel(peer, 'Direct messages').getByRole('button').filter({ hasText: text }).first().click();
    await expect(message(peer, text)).toBeVisible();
    mainName = (await peer.getByRole('main').getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
};

/** Adds the invitee to the channel open in the main pane, from its More menu. */
const addPeerToChannel = async (app: Page) => {
    await app.getByRole('main').getByRole('button', { name: 'More', exact: true }).click();
    await app.getByRole('menuitem', { name: 'Add members' }).click();
    const add = app.getByRole('dialog', { name: 'Add members' });
    await add.getByRole('textbox', { name: 'Search by name or user ID' }).fill(peerName);
    await add
        .getByRole('checkbox', { name: new RegExp(peerName) })
        .or(add.getByRole('button', { name: new RegExp(peerName) }))
        .first()
        .click();
    await add.getByRole('button', { name: 'Add to channel' }).click();
    await expect(add).toBeHidden();
};

/** The inbox card for `text`, under `tab`. */
const inboxCard = async (app: Page, tab: 'DM' | 'Threads' | 'Mentions', text: string): Promise<Locator> => {
    await go(app, 'Notifications');
    const inbox = panel(app, 'Notifications');
    await inbox.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    return inbox.getByRole('listitem').filter({ hasText: text });
};

/** Waits for a banner whose body has `text`, and returns it. */
const bannerWith = async (app: Page, text: string) => {
    await expect
        .poll(async () => (await banners(app)).some(b => b.body.includes(text)), { timeout: 30_000 })
        .toBe(true);
    const banner = (await banners(app)).find(b => b.body.includes(text));
    if (!banner) throw new Error(`no banner says "${text}"`);
    return banner;
};

test.describe('two people', () => {
    test.skip(!cloud || !place, 'DESKTOP_E2E_CLOUD / DESKTOP_E2E_PLACE are not set');
    test.skip(!phone, 'DESKTOP_E2E_INVITE_PHONE is not set');
    test.afterEach(async () => {
        for (const peer of peers.splice(0)) await peer.context().close();
    });

    test('invites someone by phone, and they join the place with the link the server answers with', async ({
        app,
        browser,
    }) => {
        // The link comes back on the socket (`user.invite:ok`, as `Location`), before the dialog shows it.
        app.on('websocket', ws =>
            ws.on('framereceived', frame => {
                const text = String(frame.payload);
                if (!text.includes('"user.invite:ok"')) return;
                const link = (JSON.parse(text) as { data?: { Location?: string; deeplink?: string } }).data;
                inviteLink = link?.deeplink || link?.Location || inviteLink;
            })
        );
        // Reloaded so the socket opens with the listener on it.
        await ready(app);
        await enterSandbox(app);

        // The place tile's context menu. A menu opened while the rail redraws closes again; open it anew.
        await expect(async () => {
            await placeTile(app, place).click({ button: 'right' });
            await app.getByRole('menuitem', { name: 'Invite by phone' }).click({ timeout: 3_000 });
        }).toPass({ timeout: 20_000 });
        const send = app.getByRole('dialog', { name: `Invite to ${place}` });
        await send.getByRole('textbox', { name: 'Name' }).fill(peerName);
        await send.getByRole('textbox', { name: 'Phone number' }).fill(phone);
        await send.getByRole('button', { name: 'Send invite' }).click();

        // The dialog that follows shows the same link the server answered with.
        const linkDialog = app.getByRole('dialog', { name: 'Invite link ready' });
        await expect(linkDialog).toBeVisible();
        await expect.poll(() => inviteLink).toMatch(/^https:\/\/\S+\/i\?t=\S+$/);
        await expect(linkDialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(inviteLink);
        await linkDialog.getByRole('button', { name: 'Close' }).click();

        // A device that has never signed in joins with the link, as a guest of the place.
        const context = await browser.newContext();
        const peer = await context.newPage();
        await peer.goto('/');
        await peer.getByRole('button', { name: 'I have an invite' }).click();
        await peer.getByRole('textbox', { name: 'Paste an invite link or code' }).fill(inviteLink);
        await peer.getByRole('button', { name: 'Join', exact: true }).click();
        const tour = peer.getByRole('dialog').filter({ hasText: 'Welcome to DoU' });
        const shell = peer.getByRole('navigation', { name: 'Navigation' });
        await expect(shell.or(tour)).toBeVisible({ timeout: 30_000 });
        if (await tour.isVisible()) await tour.getByRole('button', { name: 'Close' }).click();
        await openPlace(peer, place);

        // Named in the place, so the main account can tell this run's invitee from earlier ones.
        await peer.getByRole('button', { name: 'Edit my profile here' }).click();
        const profile = peer.getByRole('dialog', { name: 'Place profile' });
        await profile.getByRole('textbox', { name: 'Nickname' }).fill(peerName);
        await profile.getByRole('button', { name: 'Save' }).click();
        await expect(profile).toBeHidden();
        await saveSession(peer, 'peer');
        await context.close();
    });

    test('talks with them in a 1:1, both ways, as it happens', async ({ app, browser }) => {
        test.skip(!inviteLink, 'the invite scenario did not run');
        await enterSandbox(app);
        const peer = await openPeer(browser);

        await openDmWithPeer(app);
        const hello = marker('hello');
        await send(app, hello);
        await openDmOnPeer(peer, hello);

        const reply = marker('reply');
        await send(peer, reply);
        await expect(message(app, reply)).toBeVisible();
    });

    test('a 1:1 message from them lands in Notifications and raises a desktop banner', async ({
        app,
        browser,
        room,
    }) => {
        test.skip(!inviteLink, 'the invite scenario did not run');
        const peer = await openPeer(browser);
        await openDmWithPeer(app);
        const opener = marker('opener');
        await send(app, opener);
        // Looking at another room, so the 1:1 is neither open nor read.
        await go(app, 'Home');
        await channelRow(app, room).click();

        await openDmOnPeer(peer, opener);
        const text = marker('dm');
        await send(peer, text);

        // Titled with the sender, by the name on their message (`owner$.name`), which is their account's
        // name rather than the one they set in this place.
        const banner = await bannerWith(app, text);
        expect(banner.title).not.toBe('');
        await expect(navTile(app, 'Notifications')).toHaveAccessibleName(/^Notifications, /);

        const card = await inboxCard(app, 'DM', text);
        await expect(card).toContainText('Direct message');
        await expect(card.getByText('Unread')).toBeVisible();
        await card.click();
        await expect(app.getByRole('main').getByRole('heading', { level: 1 })).toContainText(peerName);
        await expect(message(app, text)).toBeVisible();
        await expect(card.getByText('Unread')).toBeHidden();
    });

    test('a reaction and a thread reply to my message land in Notifications', async ({ app, browser, room }) => {
        test.skip(!inviteLink, 'the invite scenario did not run');
        const peer = await openPeer(browser);
        await openDmWithPeer(app);
        const original = marker('original');
        await send(app, original);
        await go(app, 'Home');
        await channelRow(app, room).click();

        await openDmOnPeer(peer, original);
        const theirs = message(peer, original);
        await pressMessageButton(peer, theirs, 'React with 👍');
        const reacted = await inboxCard(app, 'DM', original);
        await expect(reacted).toContainText('Reacted to your message 👍', { timeout: 30_000 });

        // One at a time: a background room hands over only its newest event, so a reply sent in the
        // same moment would stand in for the reaction.
        await pressMessageButton(peer, theirs, 'Reply in thread');
        const thread = peer.getByRole('complementary', { name: 'Thread' });
        const reply = marker('thread reply');
        await send(peer, reply, thread.getByRole('textbox', { name: 'Reply in thread' }), thread.getByRole('log'));
        await bannerWith(app, reply);
        const replied = await inboxCard(app, 'Threads', reply);
        await expect(replied).toContainText(`Original: ${original}`, { timeout: 30_000 });
    });

    test('a mention in a channel lands under Mentions and raises a banner', async ({ app, browser, room }) => {
        test.skip(!inviteLink || !mainName, 'the earlier scenarios did not run');
        // The invitee joins the scenario's channel.
        await addPeerToChannel(app);
        // Looking at the 1:1, so the channel is neither open nor read.
        await openDmWithPeer(app);

        const peer = await openPeer(browser);
        await go(peer, 'Home');
        await channelRow(peer, room).click();
        await composer(peer).click();
        // Picked from the suggestions by the start of the name, as a person would.
        const typed = mainName.slice(0, 6);
        await peer.keyboard.type(`@${typed}`);
        await peer.getByRole('listbox').getByRole('option').filter({ hasText: typed }).first().click();
        const text = marker('mention');
        await peer.keyboard.type(` ${text}`);
        await peer.keyboard.press('Enter');
        await expect(message(peer, text, feed(peer))).toBeVisible();

        const banner = await bannerWith(app, text);
        expect(banner.title).toContain(`#${room}`);
        const card = await inboxCard(app, 'Mentions', text);
        await expect(card).toContainText('Channel mention', { timeout: 30_000 });
        await expect(card).toContainText(`# ${room}`);
    });

    test('what they send shows as unread on its row and on the nav rail, until it is opened', async ({
        app,
        browser,
        room,
    }) => {
        test.skip(!inviteLink, 'the invite scenario did not run');
        await addPeerToChannel(app);
        await openDmWithPeer(app);
        const opener = marker('opener');
        await send(app, opener);
        // Looking at neither room: the place's own notes-to-self room.
        await go(app, 'Home');
        await homeList(app)
            .getByRole('button', { name: /^\S* ?You$/ })
            .click();
        await expect(app.getByRole('main').getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
        // What else is unread here (earlier runs' rooms, other people) keeps a tile's dot on; a tile
        // is checked for going quiet only if it was quiet before.
        const quiet = {
            DM: (await navTile(app, 'DM').getAttribute('aria-label')) === 'DM',
            Channels: (await navTile(app, 'Channels').getAttribute('aria-label')) === 'Channels',
        };

        const peer = await openPeer(browser);
        await openDmOnPeer(peer, opener);
        const dm = marker('unread dm');
        await send(peer, dm);
        await go(peer, 'Home');
        await channelRow(peer, room).click();
        const said = marker('unread channel');
        await send(peer, said);

        // Each destination says it holds something unread, and its row counts it.
        await expect(navTile(app, 'DM')).toHaveAccessibleName('DM, something unread', { timeout: 30_000 });
        await expect(navTile(app, 'Channels')).toHaveAccessibleName('Channels, something unread');
        await go(app, 'DM');
        const dmRow = panel(app, 'Direct messages').getByRole('listitem').filter({ hasText: dm });
        await expect(dmRow).toContainText('1 unread message');
        await go(app, 'Channels');
        const roomRow = panel(app, 'Channels').getByRole('listitem').filter({ hasText: room });
        await expect(roomRow).toContainText(said);
        await expect(roomRow).toContainText('1 unread message');

        // Opened, each is read: the count leaves the row and the dot leaves the tile.
        await roomRow.getByRole('button').first().click();
        await expect(message(app, said)).toBeVisible();
        await expect(roomRow).not.toContainText('unread message');
        if (quiet.Channels) await expect(navTile(app, 'Channels')).toHaveAccessibleName('Channels');
        await go(app, 'DM');
        await dmRow.getByRole('button').first().click();
        await expect(message(app, dm)).toBeVisible();
        await expect(dmRow).not.toContainText('unread message');
        if (quiet.DM) await expect(navTile(app, 'DM')).toHaveAccessibleName('DM');
    });

    test('lists a notification only in the place it came from, and opens it at its message', async ({
        app,
        browser,
    }) => {
        test.skip(!inviteLink, 'the invite scenario did not run');
        test.skip(!emptyPlace, 'DESKTOP_E2E_EMPTY_PLACE is not set');
        await enterSandbox(app);
        await openDmWithPeer(app);
        const opener = marker('opener');
        await send(app, opener);
        // Standing in another place of the same cloud while it arrives: capture still files it.
        await openPlace(app, emptyPlace);

        const peer = await openPeer(browser);
        await openDmOnPeer(peer, opener);
        const text = marker('elsewhere');
        await send(peer, text);

        // The place it was sent in lists it…
        await go(app, 'Home');
        await openPlace(app, place);
        await expect(await inboxCard(app, 'DM', text)).toBeVisible({ timeout: 30_000 });
        // …another place does not…
        await go(app, 'Home');
        await openPlace(app, emptyPlace);
        await expect(await inboxCard(app, 'DM', text)).toHaveCount(0);
        // …and switching back brings it back, opening at its message.
        await go(app, 'Home');
        await openPlace(app, place);
        const card = await inboxCard(app, 'DM', text);
        await expect(card).toBeVisible();
        // An open while the place switch still runs is dropped, as the place rail is locked; the rail
        // taking clicks again is the switch finishing.
        await expect(placeTile(app, emptyPlace)).toBeEnabled({ timeout: 15_000 });
        await card.click();
        await expect(app.getByRole('main').getByRole('heading', { level: 1 })).toContainText(peerName);
        await expect(message(app, text)).toBeVisible();
    });
});
