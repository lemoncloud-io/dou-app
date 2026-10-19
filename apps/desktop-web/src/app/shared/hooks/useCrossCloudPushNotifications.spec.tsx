import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let pushHandler: ((message: unknown) => void) | null = null;
const request = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const readRecords = vi.hoisted(() => vi.fn());
// The channel cache the push is looked up in; a test fills it to give the channel a server notify mode.
let cacheRecords: unknown[] = [];
// The server the session is on; a test moves it into a cloud.
let activeServer: { kind: 'relay' } | { kind: 'cloud'; cloudId: string } = { kind: 'relay' };

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
                activeServer,
            }),
        },
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    readCacheRecords: () => readRecords(),
    resolveMyMentionNames: () => ['Me'],
}));

import { parsePushDeeplink } from '../utils';
import { useNotificationPrefsStore, usePendingOpenStore } from '../stores';
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
    readRecords.mockImplementation(async () => cacheRecords);
    pushHandler = null;
    cacheRecords = [];
    activeServer = { kind: 'relay' };
    usePendingOpenStore.setState({ target: null });
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
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

    // A 1:1 belongs to the place it was opened in, and its push names the place its sender wrote
    // from. B wrote from P1; the room lives in P2.
    describe("a 1:1's push", () => {
        const dmPush = () => push({ channelId: 'P2@me@peer', cid: 'cloud-9', sid: 'P1' });

        beforeEach(() => {
            cacheRecords = [
                {
                    type: 'channel',
                    cid: 'cloud-9',
                    data: { id: 'P2@me@peer', sid: 'P2', stereo: 'dm', $join: { userId: CLOUD_UID } },
                },
            ];
        });

        afterEach(() => vi.restoreAllMocks());

        it("opens the banner click on the room's place", async () => {
            vi.spyOn(document, 'hasFocus').mockReturnValue(false);
            pushHandler?.(dmPush());

            await waitFor(() => expect(request).toHaveBeenCalled());
            const deeplink = request.mock.calls[0][0].data.deeplink as string;
            expect(parsePushDeeplink(deeplink)).toMatchObject({ placeId: 'P2', channelId: 'P2@me@peer' });
        });

        it("opens the toast click on the room's place", async () => {
            vi.spyOn(document, 'hasFocus').mockReturnValue(true);
            pushHandler?.(dmPush());

            await waitFor(() => expect(toast).toHaveBeenCalled());
            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'P2', channelId: 'P2@me@peer' });
        });

        it("keeps a group channel's push on the place it names", async () => {
            cacheRecords = [];
            vi.spyOn(document, 'hasFocus').mockReturnValue(true);
            pushHandler?.(push({ channelId: '1000006', cid: 'cloud-9', sid: 'P1' }));

            await waitFor(() => expect(toast).toHaveBeenCalled());
            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'P1', channelId: '1000006' });
        });
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
    // A relay push names its source `'#'`, which is the Home tile (`'default'`) and not a cloud: read
    // raw, a click switched to cloud `'#'` and failed with "cloud not found" — on the relay too.
    describe('for a relay push', () => {
        const relayPush = () => push({ cid: '#', sid: 'relay-site' });
        const focus = () => vi.spyOn(document, 'hasFocus').mockReturnValue(true);

        it('opens the channel on the relay, with no place, when the toast is clicked', async () => {
            focus();
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            pushHandler?.(relayPush());
            await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({
                cloudId: 'default',
                placeId: '',
                channelId: 'ch-1',
            });
        });

        it('banners with a link to the relay while another cloud is open', async () => {
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            pushHandler?.(relayPush());
            await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

            expect(parsePushDeeplink(request.mock.calls[0][0].data.deeplink)).toMatchObject({
                cloudId: 'default',
                placeId: '',
                channelId: 'ch-1',
            });
        });

        /** Lets the presenter finish its cache read before asserting it stayed quiet. */
        const settle = async () => {
            await waitFor(() => expect(readRecords).toHaveBeenCalled());
            await new Promise(resolve => setTimeout(resolve, 20));
        };

        // The relay's own socket banners the message already, as an active cloud's does.
        it('does not banner a second time while the relay is open', async () => {
            pushHandler?.(relayPush());
            await settle();
            expect(shown()).toBe(0);
        });

        // A cloud push with no `cid` that the channel cache happens to place on the relay is a guess,
        // not the relay's stamp: shown, since a duplicate beats a missed one.
        it('banners a push only guessed to be from the open relay', async () => {
            cacheRecords = [{ type: 'channel', cid: 'default', data: { id: 'ch-1', $join: { userId: CLOUD_UID } } }];
            pushHandler?.(push({}));
            await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
        });

        it("honours the server's mute for a relay channel", async () => {
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            cacheRecords = [{ type: 'channel', cid: 'default', data: { id: 'ch-1', $join: { notify: 'none' } } }];
            pushHandler?.(relayPush());
            await settle();
            expect(shown()).toBe(0);
        });

        it("keeps a cloud push's place", async () => {
            focus();
            pushHandler?.(push({ cid: 'cloud-9', sid: 'place-3' }));
            await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ cloudId: 'cloud-9', placeId: 'place-3' });
        });
    });
});
