import type { Request } from '@playwright/test';

import { chatView, DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { bringToForeground, composer, roomRow, sendToBackground } from '../../support/app';
import { expect, test } from '../../support/test';

const WHILE_AWAY = 'Your token expired but I did not';

test(
    'a credential that expired while away is renewed on the socket, and the session carries on as the same guest',
    { tag: '@chaos' },
    async ({ page, shell, backend, chaos, evidence }) => {
        const room = dmRoom();
        backend.useSocket(roomsSocket(backend, [room]));
        const logins: Request[] = [];
        page.on('request', request => {
            if (request.url().endsWith('/oauth/register-device')) logins.push(request);
        });
        await page.goto('/');
        await expect(roomRow(page, MINA.nick)).toBeVisible();
        await expect.poll(() => logins.length).toBe(1);

        sendToBackground(shell);
        room.chats.push(chatView(DM_CHANNEL.id, 2, WHILE_AWAY));
        room.channel.chatNo = 2;
        await chaos.expireToken({ refreshFailures: 1 });
        bringToForeground(shell);

        const onNewSocket = (type: string) => backend.sent(type).filter(frame => frame.connection > 1);
        await expect.poll(() => onNewSocket('auth.update').length).toBeGreaterThan(0);
        await expect.poll(() => onNewSocket('auth.refresh').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
        chaos.recovered('credential renewed over the socket');
        await expect.poll(() => onNewSocket('channel.sync').length, { timeout: 15_000 }).toBeGreaterThan(0);
        expect(logins).toHaveLength(1);
        await expect(roomRow(page, MINA.nick)).toBeVisible();
        await evidence.shot('after renewal: home as it was, same guest');

        await roomRow(page, MINA.nick).click();
        await expect(page.getByText(WHILE_AWAY)).toBeVisible({ timeout: 15_000 });
        await expect(composer(page)).toBeVisible();
        chaos.recovered('room caught up');
        await evidence.shot('the room shows what arrived while away');
    }
);
