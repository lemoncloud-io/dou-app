import { connect, type ChaticApps } from './chaticApps';
import { ChaticAppsError } from './errors';
import { installChaticAppsMock, type MockController, type MockOptions } from './mock';
import { createBridgeClient } from './client';
import { LISTENER, browserRuntime, runtimeOver } from './runtime';
import type { CloudChannel, CloudList, CloudProfile, CloudSession } from './runtimeTypes';
import type { Transport } from './transport';

/** Lets the mock's asynchronous replies and pushes land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

const rooms: CloudChannel[] = [{ id: 'ch1', cid: 'c1', sid: 's1', isNotificationEnabled: true, name: 'General' }];
const listOf = (list: CloudChannel[]): CloudList<CloudChannel> => ({ list, meta: { total: list.length } });

describe('apps.data, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('is offered only to a page with a runtime permission', async () => {
        const { apps } = await start({ permissions: ['share'] });

        expect(apps.supports('data')).toBe(false);
        await expect(apps.data.connect()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
    });

    it('connects, and reports what the page may use', async () => {
        const { apps } = await start({
            permissions: ['channel'],
            data: { calls: { 'channel.cacheReadList': () => listOf(rooms) }, streams: {} },
        });

        expect(apps.supports('data')).toBe(true);
        expect(apps.data.can('channel.cacheReadList')).toBe(false);
        await expect(apps.data.connect()).resolves.toEqual({
            contract: 1,
            allowed: { calls: ['channel.cacheReadList'], streams: [] },
        });
        expect(apps.data.can('channel.cacheReadList')).toBe(true);
        expect(apps.data.can('chat.getChat')).toBe(false);
    });

    it('calls a read method and resolves with what it returned', async () => {
        const read = jest.fn((query: unknown) => ({ ...listOf(rooms), query }));
        const { apps } = await start({
            permissions: ['channel'],
            data: { calls: { 'channel.cacheReadList': read } },
        });

        await expect(apps.data.call('channel.cacheReadList', { sid: 's1' })).resolves.toEqual({
            ...listOf(rooms),
            query: { sid: 's1' },
        });
        expect(read).toHaveBeenCalledWith({ sid: 's1' });
    });

    it('refuses a method outside what the app allowed, without asking it', async () => {
        const { apps } = await start({ permissions: ['channel'], data: { calls: {} } });

        await expect(apps.data.call('chat.sendChat', { channelId: 'r1', content: 'hi' })).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
    });

    it("rejects with the user's refusal, and asks again on the next connect", async () => {
        const { apps } = await start({ permissions: ['channel'], data: { consent: 'refuse' } });

        await expect(apps.data.connect()).rejects.toEqual(expect.objectContaining({ code: 'CONSENT_REFUSED' }));
        await expect(apps.data.connect()).rejects.toEqual(expect.objectContaining({ code: 'CONSENT_REFUSED' }));
    });

    it('hands each event to the listener, with the listener marker added where the page left none', async () => {
        let emit: (...event: unknown[]) => void = () => undefined;
        const open = jest.fn((send: (result: CloudList<CloudChannel> | null) => void) => {
            emit = send as (...event: unknown[]) => void;
            return () => undefined;
        });
        const { apps } = await start({
            permissions: ['channel'],
            data: { streams: { 'channel.observeList': open } },
        });
        const listener = jest.fn();

        await apps.data.subscribe('channel.observeList', [{ sid: 's1' }], listener);
        emit(listOf(rooms));
        await settle();

        expect(open).toHaveBeenCalledWith(expect.any(Function), { sid: 's1' });
        expect(listener).toHaveBeenCalledWith(listOf(rooms));
    });

    it('keeps a listener marker the page placed itself', async () => {
        const open = jest.fn(() => () => undefined);
        const { apps } = await start({
            permissions: ['channel'],
            data: { streams: { 'channel.observeItem': open } },
        });

        await apps.data.subscribe('channel.observeItem', ['ch1', LISTENER], jest.fn());

        expect(open).toHaveBeenCalledWith(expect.any(Function), 'ch1');
    });

    it('stops a stream: no event reaches the listener after', async () => {
        let emit: (...event: unknown[]) => void = () => undefined;
        const stop = jest.fn();
        const { apps } = await start({
            permissions: ['channel'],
            data: {
                streams: {
                    'channel.observeList': send => {
                        emit = send as (...event: unknown[]) => void;
                        return stop;
                    },
                },
            },
        });
        const listener = jest.fn();

        const stream = await apps.data.subscribe('channel.observeList', [{}], listener);
        await stream.stop();
        emit({ list: [] });
        await settle();

        expect(stop).toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });

    it('ends streams and tells the page once when the cloud changes', async () => {
        const { apps, mock } = await start({
            permissions: ['channel'],
            data: {
                calls: { 'channel.fetchList': () => listOf([]) },
                streams: { 'channel.observeList': () => undefined },
            },
        });
        const onEnd = jest.fn();
        const onCloudChanged = jest.fn();
        apps.data.onCloudChanged(onCloudChanged);
        await apps.data.subscribe('channel.observeList', [{}], jest.fn(), onEnd);

        mock.changeCloud();
        await settle();

        expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLOUD_CHANGED' }));
        expect(onEnd.mock.calls[0][0]).toBeInstanceOf(ChaticAppsError);
        await expect(apps.data.call('channel.fetchList', {})).rejects.toEqual(
            expect.objectContaining({ code: 'CLOUD_CHANGED' })
        );
        expect(onCloudChanged).toHaveBeenCalledTimes(1);
    });

    it('gives the session only with the `session` permission', async () => {
        const session: CloudSession = {
            context: {
                cloud: { cloudId: 'c1', siteId: 's1', isActive: true },
                identity: { userId: 'u1', isAuthenticated: true },
            },
            committedSiteId: 's1',
        };

        const without = await start({ permissions: ['channel'], data: { session } });
        await without.apps.data.connect();
        expect(without.apps.data.session()).toBeNull();
        without.apps.disconnect();
        without.mock.uninstall();

        const withIt = await start({ permissions: ['session'], data: { session } });
        await withIt.apps.data.connect();
        expect(withIt.apps.data.session()).toEqual(session);
    });
});

describe('apps.data.sendMessage, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('sends through chat.sendChat, and the mock records it', async () => {
        const { apps, mock } = await start({ permissions: ['chatSend'] });

        const sent = await apps.data.sendMessage('ch1', 'hello');

        expect(sent).toEqual(expect.objectContaining({ channelId: 'ch1', content: 'hello', chatNo: 1 }));
        expect(mock.sentMessages).toEqual([{ channelId: 'ch1', text: 'hello' }]);
        expect(apps.data.can('chat.sendChat')).toBe(true);
    });

    it("answers with the page's own mock answer when it gives one, and still records", async () => {
        const answer = jest.fn((input: { channelId: string; content: string }) => ({
            id: 'm1',
            cid: 'c1',
            channelId: input.channelId,
            chatNo: 7,
            isPending: false,
            isFailed: false,
            createdAtMs: 1,
            updatedAtMs: 1,
            content: input.content,
        }));
        const { apps, mock } = await start({
            permissions: ['chatSend'],
            data: { calls: { 'chat.sendChat': answer } },
        });

        await expect(apps.data.call('chat.sendChat', { channelId: 'ch1', content: 'hi' })).resolves.toEqual(
            expect.objectContaining({ id: 'm1', chatNo: 7 })
        );
        expect(answer).toHaveBeenCalledWith({ channelId: 'ch1', content: 'hi' });
        expect(mock.sentMessages).toEqual([{ channelId: 'ch1', text: 'hi' }]);
    });

    it('refuses a send without the chatSend permission, even with an answer given', async () => {
        const { apps, mock } = await start({
            permissions: ['chat'],
            data: { calls: { 'chat.sendChat': () => Promise.reject(new Error('never asked')) } },
        });

        await expect(apps.data.sendMessage('ch1', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        expect(mock.sentMessages).toEqual([]);
    });

    it('numbers sends in flight together apart', async () => {
        const { apps } = await start({ permissions: ['chatSend'] });

        const [one, two] = await Promise.all([
            apps.data.sendMessage('ch1', 'one'),
            apps.data.sendMessage('ch1', 'two'),
        ]);

        expect(one.id).not.toBe(two.id);
        expect([one.chatNo, two.chatNo]).toEqual([1, 2]);
    });

    it('records nothing for a send its answer failed', async () => {
        const { apps, mock } = await start({
            permissions: ['chatSend'],
            data: { calls: { 'chat.sendChat': () => Promise.reject(new Error('the server said no')) } },
        });

        await expect(apps.data.sendMessage('ch1', 'x')).rejects.toBeInstanceOf(ChaticAppsError);
        expect(mock.sentMessages).toEqual([]);
    });

    it.each([
        ['blank text', 'ch1', '   '],
        ['text over 1000 characters', 'ch1', 'x'.repeat(1001)],
        ['a room id over 200 characters', 'r'.repeat(201), 'hello'],
    ])('refuses %s as the app does, and records nothing', async (_, room, text) => {
        const { apps, mock } = await start({ permissions: ['chatSend'] });

        await expect(apps.data.sendMessage(room, text)).rejects.toEqual(
            expect.objectContaining({
                code: 'RUNTIME_NOT_ALLOWED',
                details: expect.objectContaining({ reason: 'guard' }),
            })
        );
        expect(mock.sentMessages).toEqual([]);
    });
});

describe('apps.data.react, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('sets and takes off a reaction through chat.setReaction, and the mock records both', async () => {
        const { apps, mock } = await start({ permissions: ['chatReact'] });

        await expect(apps.data.react('m1', '👍', true)).resolves.toEqual(expect.objectContaining({ id: 'm1' }));
        await apps.data.react('m1', '👍', false);

        expect(mock.reactions).toEqual([
            { messageId: 'm1', emoji: '👍', on: true },
            { messageId: 'm1', emoji: '👍', on: false },
        ]);
        expect(apps.data.can('chat.setReaction')).toBe(true);
    });

    it('sends the shape the app takes', async () => {
        const answer = jest.fn((input: { chatId: string }) => ({
            id: input.chatId,
            cid: 'c1',
            channelId: 'ch1',
            chatNo: 3,
            isPending: false,
            isFailed: false,
            createdAtMs: 1,
            updatedAtMs: 1,
        }));
        const { apps } = await start({ permissions: ['chatReact'], data: { calls: { 'chat.setReaction': answer } } });

        await apps.data.react('m1', '🎉', false);

        expect(answer).toHaveBeenCalledWith({ chatId: 'm1', emoji: '🎉', action: 'off' });
    });

    it('refuses a reaction without the chatReact permission', async () => {
        const { apps, mock } = await start({ permissions: ['chat', 'chatSend'] });

        await expect(apps.data.react('m1', '👍', true)).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        expect(mock.reactions).toEqual([]);
    });

    it.each([
        ['two emoji', 'm1', '👍👍'],
        ['a word', 'm1', 'ok'],
        ['no emoji', 'm1', ''],
        ['a space', 'm1', ' '],
        ['a zero-width space', 'm1', '\u200b'],
        ['a private-use character', 'm1', '\ue000'],
        ['a letter with three combining marks', 'm1', 'a\u0301\u0302\u0303'],
        ['a message id over 200 characters', 'm'.repeat(201), '👍'],
    ])('refuses %s as the app does, and records nothing', async (_, message, emoji) => {
        const { apps, mock } = await start({ permissions: ['chatReact'] });

        await expect(apps.data.react(message, emoji, true)).rejects.toEqual(
            expect.objectContaining({
                code: 'RUNTIME_NOT_ALLOWED',
                details: expect.objectContaining({ reason: 'guard' }),
            })
        );
        expect(mock.reactions).toEqual([]);
    });

    it('takes one emoji built of several code points', async () => {
        const { apps, mock } = await start({ permissions: ['chatReact'] });

        await apps.data.react('m1', '👍🏽', true);
        await apps.data.react('m1', '👨‍👩‍👧', true);

        expect(mock.reactions.map(reaction => reaction.emoji)).toEqual(['👍🏽', '👨‍👩‍👧']);
    });
});

describe('the display and the safe area, in the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;
    const insetsOnPage = () =>
        ['top', 'right', 'bottom', 'left'].map(edge =>
            document.documentElement.style.getPropertyValue(`--chatic-safe-area-inset-${edge}`)
        );

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
        document.documentElement.removeAttribute('style');
    });

    it('shows a page padded by default: clean, and 0 on every edge', async () => {
        mock = installChaticAppsMock({ log: false });
        apps = await connect({ reportErrors: false });

        expect(apps.context).toEqual(
            expect.objectContaining({ display: 'clean', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } })
        );
        expect(insetsOnPage()).toEqual(['', '', '', '']);
    });

    it("gives an immersive page a phone's insets, and new ones when the phone turns", async () => {
        mock = installChaticAppsMock({ log: false, context: { display: 'immersive' } });
        apps = await connect({ reportErrors: false });
        const heard = jest.fn();
        apps.onContextChange(heard);

        expect(apps.context?.safeArea).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
        expect(insetsOnPage()).toEqual(['47px', '0px', '34px', '0px']);

        mock.rotate();
        await settle();
        expect(heard).toHaveBeenLastCalledWith(
            expect.objectContaining({ safeArea: { top: 0, right: 47, bottom: 21, left: 47 } })
        );
        expect(apps.context?.safeArea).toEqual({ top: 0, right: 47, bottom: 21, left: 47 });
        expect(insetsOnPage()).toEqual(['0px', '47px', '21px', '47px']);

        mock.rotate();
        await settle();
        expect(apps.context?.safeArea).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
    });

    it('tells a padded page nothing when the phone turns', async () => {
        mock = installChaticAppsMock({ log: false, context: { display: 'titled' } });
        apps = await connect({ reportErrors: false });
        const heard = jest.fn();
        apps.onContextChange(heard);

        mock.rotate();
        await settle();

        expect(heard).not.toHaveBeenCalled();
    });

    it('stands in for an app that sends neither field', async () => {
        mock = installChaticAppsMock({ log: false, context: { display: undefined, safeArea: undefined } });
        apps = await connect({ reportErrors: false });

        expect(apps.context?.display).toBeUndefined();
        expect(apps.context?.safeArea).toBeUndefined();
        expect(insetsOnPage()).toEqual(['', '', '', '']);
    });
});

describe('apps.data place profiles, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const onPlace = (committedSiteId: string | null): CloudSession => ({
        context: {
            cloud: { cloudId: 'c1', siteId: committedSiteId, isActive: true },
            identity: { userId: 'u1', isAuthenticated: true },
        },
        committedSiteId,
    });
    const mine: CloudProfile = {
        id: 's1@u1',
        cid: 'c1',
        sid: 's1',
        uid: 'u1',
        userId: 'u1',
        updatedAtMs: 1,
        nick: 'Me',
    };
    const theirs: CloudProfile = { ...mine, id: 's1@u2', uid: 'u2', userId: 'u2', nick: 'Them' };
    const elsewhere: CloudProfile = { ...mine, id: 's3@u2', sid: 's3', uid: 'u2', userId: 'u2', nick: 'Them in s3' };
    const profiles = new Map([mine, theirs, elsewhere].map(profile => [profile.id, profile]));

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return apps;
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it("reads the user's own place profile, by the session's place and user id", async () => {
        const read = jest.fn((id: string) => profiles.get(id) ?? null);
        const apps = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace('s1'), calls: { 'profile.cacheRead': read } },
        });

        await expect(apps.data.myProfile()).resolves.toEqual(expect.objectContaining({ id: 's1@u1', nick: 'Me' }));
        expect(read).toHaveBeenCalledWith('s1@u1');
    });

    it('answers null when the device holds no profile for the place', async () => {
        const apps = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace('s2'), calls: { 'profile.cacheRead': (id: string) => profiles.get(id) ?? null } },
        });

        await expect(apps.data.myProfile()).resolves.toBeNull();
    });

    it('hears the profile and its changes through profile.observeItem', async () => {
        let push: ((item: CloudProfile | null) => void) | undefined;
        const observed = jest.fn((emit: (item: CloudProfile | null) => void, id: string) => {
            push = emit;
            emit(profiles.get(id) ?? null);
        });
        const apps = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace('s1'), streams: { 'profile.observeItem': observed } },
        });
        const heard: (CloudProfile | null)[] = [];

        await apps.data.observeMyProfile(profile => heard.push(profile));
        await settle();
        push?.({ ...mine, nick: 'Renamed' });
        await settle();

        expect(observed).toHaveBeenCalledWith(expect.any(Function), 's1@u1');
        expect(heard.map(profile => profile?.nick)).toEqual(['Me', 'Renamed']);
    });

    it('refuses without the session permission, or before the session is on a place', async () => {
        const withoutSession = await start({
            permissions: ['user'],
            data: { session: onPlace('s1'), calls: { 'profile.cacheRead': () => mine } },
        });
        await expect(withoutSession.data.myProfile()).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_SUPPORTED' })
        );
        withoutSession.disconnect();
        mock?.uninstall();

        const noPlace = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace(null), calls: { 'profile.cacheRead': () => mine } },
        });
        await expect(noPlace.data.observeMyProfile(() => undefined)).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_SUPPORTED' })
        );
    });

    it("reads another member's profile in the session's place only", async () => {
        const read = jest.fn((id: string) => profiles.get(id) ?? null);
        const apps = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace('s1'), calls: { 'profile.cacheRead': read } },
        });

        await expect(apps.data.placeProfile('u2')).resolves.toEqual(expect.objectContaining({ nick: 'Them' }));
        expect(read.mock.calls).toEqual([['s1@u2']]);
    });

    it('reads no profile without the session permission, which names the place', async () => {
        const apps = await start({
            permissions: ['user'],
            data: { calls: { 'profile.cacheRead': (id: string) => profiles.get(id) ?? null } },
        });

        await expect(apps.data.placeProfile('u2')).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
        await expect(apps.data.placeProfiles()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
        await expect(apps.data.myProfile()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
    });

    it("lists a place's profiles by the place's id", async () => {
        const list = jest.fn((query?: { sid?: string }) => ({
            list: [...profiles.values()].filter(profile => profile.sid === query?.sid),
            meta: { total: 0 },
        }));
        const apps = await start({
            permissions: ['session', 'user'],
            data: { session: onPlace('s1'), calls: { 'profile.cacheReadList': list } },
        });

        const result = await apps.data.placeProfiles();

        expect(list).toHaveBeenCalledWith({ sid: 's1' });
        expect(result?.list.map(profile => profile.nick)).toEqual(['Me', 'Them']);
    });

    it('refuses when profile reads are not open to the page (the user permission, in the app)', async () => {
        const apps = await start({ permissions: ['session'], data: { session: onPlace('s1') } });

        await expect(apps.data.myProfile()).rejects.toEqual(expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' }));
    });
});

describe('apps.data, called untyped as before the types', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
    });

    it('answers a known method through an explicit type, a method name in a variable, and an unknown name', async () => {
        mock = installChaticAppsMock({
            log: false,
            permissions: ['channel'],
            data: {
                calls: {
                    'channel.cacheReadList': () => listOf(rooms),
                    'channel.fromANewerApp': (...args: unknown[]) => ({ echoed: args }),
                },
            },
        });
        apps = await connect({ reportErrors: false });

        // The untyped spelling, typed by the caller.
        await expect(apps.data.call<{ list: unknown[] }>('channel.cacheReadList', { sid: 's1' })).resolves.toEqual(
            listOf(rooms)
        );
        const method = 'channel.cacheReadList' as string;
        await expect(apps.data.call(method, {})).resolves.toEqual(listOf(rooms));
        await expect(apps.data.call('channel.fromANewerApp', 1, 'two')).resolves.toEqual({ echoed: [1, 'two'] });
    });

    it('subscribes to an unknown stream with the listener marker where the page put it', async () => {
        const open = jest.fn((emit: (...event: unknown[]) => void, first: unknown) => {
            emit('event', first);
        });
        mock = installChaticAppsMock({
            log: false,
            permissions: ['channel'],
            data: { streams: { 'channel.observeSomethingNew': open } },
        });
        apps = await connect({ reportErrors: false });
        const listener = jest.fn();

        await apps.data.subscribe('channel.observeSomethingNew', ['a', LISTENER, 'b'], listener);
        await settle();

        expect(open).toHaveBeenCalledWith(expect.any(Function), 'a', 'b');
        expect(listener).toHaveBeenCalledWith('event', 'a');
    });
});

describe('browserRuntime', () => {
    it('answers NOT_IN_APP and reads nothing', async () => {
        const runtime = browserRuntime();

        await expect(runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        await expect(runtime.call('channel.fetchList', {})).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_IN_APP' })
        );
        expect(runtime.can('channel.fetchList')).toBe(false);
        await expect(runtime.sendMessage('ch1', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_IN_APP' })
        );
        await expect(runtime.myProfile()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        await expect(runtime.react('m1', '👍', true)).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        expect(runtime.session()).toBeNull();
    });
});

describe('apps.data.connect, against a slow answer', () => {
    afterEach(() => jest.useRealTimers());

    it('waits for the user however long they take, past the default request timeout', async () => {
        jest.useFakeTimers();
        const sent: Array<Record<string, any>> = [];
        let deliver: ((message: string) => void) | undefined;
        const transport: Transport = {
            send: message => sent.push(JSON.parse(message)),
            listen: next => {
                deliver = next;
                return () => (deliver = undefined);
            },
        };
        const runtime = runtimeOver(
            createBridgeClient(transport, 1_000),
            () => true,
            () => undefined
        );

        const connecting = runtime.connect();
        const outcome = jest.fn();
        connecting.then(outcome, outcome);
        // The app is showing the consent question; a request with the default timeout would have failed.
        await jest.advanceTimersByTimeAsync(60_000);
        expect(outcome).not.toHaveBeenCalled();

        const hello = sent.find(message => message.type === 'RuntimeHello')!;
        deliver?.(
            JSON.stringify({
                type: 'OnRuntimeHello',
                success: true,
                refId: hello.refId,
                data: {
                    sessionOwner: 'native',
                    contract: 1,
                    seq: 1,
                    session: null,
                    allowed: { calls: [], streams: [] },
                },
            })
        );

        await expect(connecting).resolves.toEqual({ contract: 1, allowed: { calls: [], streams: [] } });
    });
});

describe('apps.data.connect, across a back-forward-cache restore', () => {
    it('ends a hello still waiting for the user, and asks afresh on the next connect', async () => {
        const sent: Array<Record<string, any>> = [];
        let deliver: ((message: string) => void) | undefined;
        const transport: Transport = {
            send: message => sent.push(JSON.parse(message)),
            listen: next => {
                deliver = next;
                return () => (deliver = undefined);
            },
        };
        const runtime = runtimeOver(
            createBridgeClient(transport),
            () => true,
            () => undefined
        );

        const waiting = runtime.connect();
        runtime.reset();
        await expect(waiting).rejects.toEqual(expect.objectContaining({ code: 'DISCONNECTED' }));

        const again = runtime.connect();
        const hellos = sent.filter(message => message.type === 'RuntimeHello');
        expect(hellos).toHaveLength(2);
        deliver?.(
            JSON.stringify({
                type: 'OnRuntimeHello',
                success: true,
                refId: hellos[1].refId,
                data: {
                    sessionOwner: 'native',
                    contract: 1,
                    seq: 1,
                    session: null,
                    allowed: { calls: [], streams: [] },
                },
            })
        );
        await expect(again).resolves.toEqual({ contract: 1, allowed: { calls: [], streams: [] } });
    });
});
