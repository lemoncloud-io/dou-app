import type { Page } from '@playwright/test';

import {
    CLOUD,
    CLOUD_PLACE,
    CLOUD_ROOM,
    installCloud,
    ownCloud,
    SECOND_PLACE,
    SECOND_PLACE_ROOM,
} from '../../fixtures/cloud';
import { GUEST_NICK } from '../../fixtures/guest';
import { dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { roomRow } from '../../support/app';
import { expect, test } from '../../support/test';

const switcher = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Switch Cloud', exact: true });
const placeChips = (page: Page) => page.getByRole('group', { name: 'Places', exact: true });
const placeRow = (page: Page, name: string) =>
    placeChips(page).getByRole('button', { name: new RegExp(`^${name}(, .*)?$`) });
const isSelectedPlace = (page: Page, name: string) =>
    placeChips(page).getByRole('button', { name: new RegExp(`^${name}(, .*)?$`), pressed: true });
const cloudEntry = (page: Page) =>
    page
        .getByRole('dialog', { name: 'Switch Cloud' })
        .getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) });

const expectRelayHome = async (page: Page) => {
    await expect(switcher(page).getByRole('img', { name: 'DoU' })).toBeVisible();
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect(placeChips(page)).toHaveCount(0);
    for (const room of [CLOUD_ROOM, SECOND_PLACE_ROOM]) await expect(roomRow(page, room.name)).toHaveCount(0);
};

const expectCloudPlace = async (
    page: Page,
    place: { name: string },
    room: { name: string },
    other: { name: string }
) => {
    await expect(switcher(page)).toContainText(CLOUD.name);
    await expect(isSelectedPlace(page, place.name)).toBeVisible();
    await expect(roomRow(page, room.name)).toBeVisible();
    for (const title of [MINA.nick, GUEST_NICK, other.name]) await expect(roomRow(page, title)).toHaveCount(0);
};

const SETTLED_FOR_MS = 1_500;

const sideOf = async (page: Page): Promise<'relay' | string> => {
    if ((await switcher(page).getByRole('img', { name: 'DoU' }).count()) > 0) return 'relay';
    if ((await isSelectedPlace(page, CLOUD_PLACE.name).count()) > 0) return CLOUD_PLACE.id;
    if ((await isSelectedPlace(page, SECOND_PLACE.name).count()) > 0) return SECOND_PLACE.id;
    return '';
};

const settledHome = async (page: Page): Promise<'relay' | string> => {
    let side: 'relay' | string = '';
    let since = Date.now();
    await expect
        .poll(
            async () => {
                const now = await sideOf(page);
                if (now !== side) {
                    side = now;
                    since = Date.now();
                }
                return side && Date.now() - since >= SETTLED_FOR_MS;
            },
            { timeout: 20_000, intervals: [200] }
        )
        .toBe(true);
    if (side === 'relay') await expectRelayHome(page);
    else if (side === CLOUD_PLACE.id) await expectCloudPlace(page, CLOUD_PLACE, CLOUD_ROOM, SECOND_PLACE_ROOM);
    else await expectCloudPlace(page, SECOND_PLACE, SECOND_PLACE_ROOM, CLOUD_ROOM);
    return side;
};

const switchTargets = (frames: { endpoint: string; type: string; data: unknown }[]) =>
    frames
        .filter(frame => frame.endpoint === CLOUD.wss && frame.type === 'auth.switch')
        .map(frame => String((frame.data as { target?: string }).target).split('@')[1]);

test(
    'entering a cloud that refuses the switch once, on a slow cloud socket, settles on one side and the next try gets in',
    { tag: '@chaos' },
    async ({ page, backend, chaos, evidence }) => {
        backend.useSocket(roomsSocket(backend, [dmRoom()]));
        ownCloud(backend);
        const cloud = installCloud(backend, { profileInPlace: true, secondPlace: true });
        await page.goto('/');
        await expectRelayHome(page);
        await expect.poll(() => backend.sentAt(CLOUD.wss, 'channel.sync').length).toBeGreaterThan(0);

        chaos.failSocket('auth.switch', {
            endpoint: CLOUD.wss,
            error: '503 SERVICE UNAVAILABLE - e2e: cloud busy',
            times: 1,
        });
        chaos.latency(1_500, {
            socket: [/^(channel\.sync|profile\.get-mine|user\.profile)$/],
            endpoint: CLOUD.wss,
        });

        await switcher(page).click();
        await cloudEntry(page).click();
        await expect.poll(() => backend.sentAt(CLOUD.wss, 'auth.switch').length).toBeGreaterThan(0);
        const first = await settledHome(page);
        chaos.recovered(`home settled on ${first}`);
        await evidence.shot(`switch refused once: home settled on ${first === 'relay' ? 'DoU home' : 'the cloud'}`);

        if (first === 'relay') {
            await switcher(page).click();
            await cloudEntry(page).click();
        }
        await expectCloudPlace(page, CLOUD_PLACE, CLOUD_ROOM, SECOND_PLACE_ROOM);
        await expect.poll(() => cloud.sessionSite, { timeout: 15_000 }).toBe(CLOUD_PLACE.id);
        chaos.recovered('inside the cloud, session on its first place');
        await evidence.shot('inside the cloud, its first place only');
    }
);

test(
    'the cloud socket dropping during a place switch leaves home and the session on the same place, and the switch can be retried',
    { tag: '@chaos' },
    async ({ page, backend, chaos, evidence }) => {
        backend.useSocket(roomsSocket(backend, [dmRoom()]));
        ownCloud(backend);
        const cloud = installCloud(backend, { profileInPlace: true, secondPlace: true });
        await page.goto('/');
        await expectRelayHome(page);
        await switcher(page).click();
        await cloudEntry(page).click();
        await expectCloudPlace(page, CLOUD_PLACE, CLOUD_ROOM, SECOND_PLACE_ROOM);
        await expect.poll(() => cloud.sessionSite).toBe(CLOUD_PLACE.id);
        const cloudConnections = () =>
            new Set(backend.allFrames.filter(frame => frame.endpoint === CLOUD.wss).map(frame => frame.connection))
                .size;
        const connectionsBefore = cloudConnections();

        const lift = chaos.latency(1_200, { socket: ['auth.switch'], endpoint: CLOUD.wss });
        await placeRow(page, SECOND_PLACE.name).click();
        await expect.poll(() => switchTargets(backend.allFrames)).toContain(SECOND_PLACE.id);
        await chaos.dropSocket({ endpoint: CLOUD.wss });
        lift();

        await expect.poll(cloudConnections, { timeout: 20_000 }).toBeGreaterThan(connectionsBefore);
        chaos.recovered('cloud socket reopened');
        const settled = await settledHome(page);
        expect(settled).not.toBe('relay');
        await expect.poll(() => cloud.sessionSite, { timeout: 15_000 }).toBe(settled);
        chaos.recovered(
            `home and session agree on ${settled === SECOND_PLACE.id ? SECOND_PLACE.name : CLOUD_PLACE.name}`
        );
        await evidence.shot(
            `after the drop: home and the session both on ${settled === SECOND_PLACE.id ? SECOND_PLACE.name : CLOUD_PLACE.name}`
        );

        if (settled !== SECOND_PLACE.id) await placeRow(page, SECOND_PLACE.name).click();
        await expectCloudPlace(page, SECOND_PLACE, SECOND_PLACE_ROOM, CLOUD_ROOM);
        await expect.poll(() => cloud.sessionSite, { timeout: 15_000 }).toBe(SECOND_PLACE.id);
        chaos.recovered(`on ${SECOND_PLACE.name}`);
    }
);
