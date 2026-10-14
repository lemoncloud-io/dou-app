import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let pushHandler: ((message: unknown) => void) | null = null;
const request = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
// The channel cache the push is looked up in; a test fills it to give the channel a server notify mode.
let cacheRecords: unknown[] = [];

vi.mock('@chatic/bridges', () => ({
    webClient: {
        request,
        onEvent: (_type: string, handler: (message: unknown) => void) => {
            pushHandler = handler;
            return () => undefined;
        },
    },
}));

vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: () => ({
                identity: { userId: ACCOUNT_UID },
                activeServer: { kind: 'relay' },
            }),
        },
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    readCacheRecords: async () => cacheRecords,
    resolveMyMentionNames: () => ['Me'],
}));

import { useNotificationPrefsStore } from '../stores';
import { useCrossCloudPushNotifications } from './useCrossCloudPushNotifications';

const push = (data: Record<string, string>) => ({
    data: {
        notification: {
            title: 'general',
            body: 'hello',
            data: { channelId: 'ch-1', channelName: 'general', ownerId: 'someone-else', uid: CLOUD_UID, ...data },
        },
    },
});

const shown = () => toast.mock.calls.length + request.mock.calls.length;

beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(undefined);
    pushHandler = null;
    cacheRecords = [];
    useNotificationPrefsStore.setState({
        desktopEnabled: true,
        mutedChannels: {},
        channelNotify: {},
        snoozeUntil: null,
        quietHours: null,
    });
    renderHook(() => useCrossCloudPushNotifications());
});

describe('useCrossCloudPushNotifications', () => {
    it('presents a push for a message from someone else', async () => {
        pushHandler?.(push({}));
        await waitFor(() => expect(shown()).toBe(1));
    });

    it('drops a push for my own message identified by my account id', async () => {
        pushHandler?.(push({ ownerId: ACCOUNT_UID }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(shown()).toBe(0);
    });

    // The push carries the owner as the cloud's own user id; `data.uid` is the recipient in that
    // same id space, so an owner equal to it is me.
    it('drops a push for my own message identified by my per-cloud user id', async () => {
        pushHandler?.(push({ ownerId: CLOUD_UID }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(shown()).toBe(0);
    });

    // Same rule as the feed: a webhook is never mine, whatever owner id it carries.
    it('presents a push for a webhook message even when its owner id is mine', async () => {
        pushHandler?.(push({ ownerId: CLOUD_UID, stereo: 'webhook' }));
        await waitFor(() => expect(shown()).toBe(1));
    });

    // A push carries no mention record, so the quiet-hours breakthrough cannot tell that it names
    // me: another cloud stays silent in quiet hours with the toggle on, even when the text has my name.
    describe('in quiet hours', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 14, 23, 0));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('stays silent with the mention breakthrough on', async () => {
            useNotificationPrefsStore.setState({
                quietHours: { start: '22:00', end: '07:00' },
                mentionBreaksQuietHours: true,
            });
            pushHandler?.(push({ content: 'hello @Me' }));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(shown()).toBe(0);
        });
    });

    describe('for a channel set to mentions only', () => {
        // The server sends a mentions-only member a push only when the message's record names
        // them, so the push arriving is the answer. Checking the text again dropped it whenever
        // the sender's list showed me under another name.
        it('presents a push the server already filtered, though the text does not have my name', async () => {
            cacheRecords = [
                {
                    type: 'channel',
                    cid: 'cloud-9',
                    data: { id: 'ch-1', $join: { userId: CLOUD_UID, notify: 'mention' } },
                },
            ];
            pushHandler?.(push({ content: '@Nickname hello' }));
            await waitFor(() => expect(shown()).toBe(1));
        });

        // A 1:1 has no such level, so a mode this device still holds for one filters nothing.
        it('presents every push of a 1:1 that this device left on mentions only', async () => {
            cacheRecords = [
                { type: 'channel', cid: 'cloud-9', data: { id: 'ch-1', stereo: 'dm', $join: { userId: CLOUD_UID } } },
            ];
            useNotificationPrefsStore.setState({ channelNotify: { 'ch-1': 'mention' } });
            pushHandler?.(push({ content: 'hello there' }));
            await waitFor(() => expect(shown()).toBe(1));
        });

        // No cached channel: the mode is this device's own setting, and the server may be sending
        // everything. The text is all there is to go by.
        it("still reads the text when the mode is only this device's", async () => {
            useNotificationPrefsStore.setState({ channelNotify: { 'ch-1': 'mention' } });
            pushHandler?.(push({ content: 'hello there' }));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(shown()).toBe(0);

            pushHandler?.(push({ content: 'hello @Me' }));
            await waitFor(() => expect(shown()).toBe(1));
        });
    });
});
