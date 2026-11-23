import type { Page } from '@playwright/test';

import { NO_REPLY } from '../fixtures/backend';
import { GUEST_NICK } from '../fixtures/guest';
import { chatView, DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, roomRow } from '../support/app';
import { expect, test } from '../support/test';

const toneWav = (): Buffer => {
    const rate = 8000;
    const samples = rate * 8;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24);
    buffer.writeUInt32LE(rate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i += 1) {
        buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
    }
    return buffer;
};

const AUDIO_URL = 'https://media.test/e2e/meeting.wav';

const audioMessage = () => ({
    ...chatView(DM_CHANNEL.id, 2, ''),
    upload$$: [
        {
            id: 'up-meeting',
            stereo: 'audio',
            status: 'stored',
            name: 'meeting.wav',
            contentType: 'audio/wav',
            contentSize: 128_044,
            orgUrl: AUDIO_URL,
        },
    ],
});

const openRoom = async (page: Page, title: string): Promise<void> => {
    await page.goto('/');
    await roomRow(page, title).click();
    await expect(composer(page)).toBeVisible();
};

test('audio picked on its own is confirmed in a sheet, and goes as one message', async ({ page, shell, backend }) => {
    backend.useSocket({ 'upload.start': () => NO_REPLY });
    const audio = (name: string, size: number) => ({
        kind: 'file' as const,
        uri: `file:///e2e/attach-pick/${name}`,
        name,
        contentType: 'audio/mp4',
        size,
    });
    shell.handle('PickAttachments', () => ({
        items: [audio('take-1.m4a', 120_000), audio('take-2.m4a', 240_000)],
        refused: [],
    }));

    await page.goto('/');
    await page.getByText(GUEST_NICK).first().click();
    await expect(composer(page)).toBeVisible();
    await page.getByRole('button', { name: 'Open attachments' }).click();
    await page.getByText('Files', { exact: true }).click();
    await page.getByText('Choose from files').click();

    const sheet = page.getByRole('dialog', { name: 'Send 2 audio files' });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('group', { name: 'Files to send' })).toHaveCount(0);
    expect(backend.sent('upload.start')).toHaveLength(0);

    await sheet.getByRole('button', { name: 'Remove take-2.m4a' }).click();
    const one = page.getByRole('dialog', { name: 'Send 1 audio file' });
    await expect(one).toBeVisible();
    await one.getByRole('button', { name: 'Send 1', exact: true }).click();

    await expect.poll(() => backend.sent('upload.start').length).toBe(1);
    const asked = JSON.stringify(backend.sent('upload.start')[0]?.data);
    expect(asked).toContain('take-1.m4a');
    expect(asked).not.toContain('take-2.m4a');
    await expect(page.getByRole('button', { name: 'Cancel uploading take-1.m4a' })).toBeVisible();
});

test('a sent audio file plays in place, opens its detail, is in the room files, and hides with an undo', async ({
    page,
    backend,
}) => {
    await page.route(AUDIO_URL, route =>
        route.fulfill({
            status: 200,
            contentType: 'audio/wav',
            body: toneWav(),
            headers: { 'access-control-allow-origin': '*' },
        })
    );
    const room = dmRoom();
    room.chats.push(audioMessage());
    room.channel.chatNo = 2;
    backend.useSocket(roomsSocket(backend, [room]));

    await openRoom(page, MINA.nick);

    await page.getByRole('button', { name: 'Play meeting.wav' }).click();
    await expect(page.getByRole('slider', { name: 'Playback position of meeting.wav' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Playback speed 1x$/ })).toBeVisible();

    await page.getByRole('button', { name: 'Open meeting.wav' }).click({ position: { x: 80, y: 18 } });
    await expect(page).toHaveURL(new RegExp(`/channels/${DM_CHANNEL.id}/audio/2/0$`));
    await expect(page.getByText(MINA.nick, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Room files' }).click();
    await expect(page).toHaveURL(new RegExp(`/channels/${DM_CHANNEL.id}/files\\?tab=audio$`));
    await expect(page.getByText('meeting.wav', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('checkbox', { name: /meeting\.wav/ }).click();
    await page.getByRole('toolbar').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('meeting.wav', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('meeting.wav', { exact: true })).toBeVisible();
});
