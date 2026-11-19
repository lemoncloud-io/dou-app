import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { createSubWebViewRuntimeConsent, type SubWebViewConsentStore } from './subWebViewRuntimeConsent';

const memoryStore = (): SubWebViewConsentStore & { values: Map<string, string> } => {
    const values = new Map<string, string>();
    return { values, getString: key => values.get(key), set: (key, value) => void values.set(key, value) };
};

const key = { userId: 'u1', origin: 'https://quiz.apps.chatic.io', cloudId: 'c1', placeId: 's1' };
const perms = (...names: SubWebViewRuntimePermission[]) => new Set(names);

describe('createSubWebViewRuntimeConsent', () => {
    it('keeps a yes per place: one in place s1 says nothing of s2 in the same cloud', async () => {
        const store = memoryStore();
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store, ask });

        await consent.ensure(key, perms('channel', 'chat'));
        await consent.ensure({ ...key, placeId: 's2' }, perms('channel', 'chat'));
        expect(ask).toHaveBeenCalledTimes(2);

        // Opening the page in s1 again, in a new view, asks nothing.
        await expect(createSubWebViewRuntimeConsent({ store, ask }).ensure(key, perms('chat'))).resolves.toBe(
            'allowed'
        );
        expect(ask).toHaveBeenCalledTimes(2);
        expect(store.values.size).toBe(2);
    });

    it('asks every permission at once, the cloud and the writes included, in one question per place', async () => {
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store: memoryStore(), ask });

        await consent.ensure(key, perms('cloud', 'chat', 'chatSend'));

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask).toHaveBeenCalledWith({ host: 'quiz.apps.chatic.io', permissions: ['chat', 'chatSend', 'cloud'] });
    });

    it('asks again a yes kept per cloud alone, before consent was per place', async () => {
        const store = memoryStore();
        store.set(`runtime\nu1\nhttps://quiz.apps.chatic.io\nc1`, 'chat;2');
        const ask = jest.fn().mockResolvedValue(true);

        await createSubWebViewRuntimeConsent({ store, ask }).ensure(key, perms('chat'));

        expect(ask).toHaveBeenCalledTimes(1);
    });

    it('asks once, names the host and the permissions, and keeps an allow', async () => {
        const store = memoryStore();
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store, ask });

        await expect(consent.ensure(key, perms('chat', 'channel'))).resolves.toBe('allowed');
        await expect(consent.ensure(key, perms('channel'))).resolves.toBe('allowed');

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask).toHaveBeenCalledWith({ host: 'quiz.apps.chatic.io', permissions: ['channel', 'chat'] });
        // Another view in the same cloud reads the kept answer.
        const again = createSubWebViewRuntimeConsent({ store, ask });
        await expect(again.ensure(key, perms('chat'))).resolves.toBe('allowed');
        expect(ask).toHaveBeenCalledTimes(1);
    });

    it('asks again for a permission the kept answer did not cover', async () => {
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store: memoryStore(), ask });

        await consent.ensure(key, perms('channel'));
        await consent.ensure(key, perms('channel', 'user'));

        expect(ask).toHaveBeenCalledTimes(2);
    });

    it('keeps an answer per cloud and per user', async () => {
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store: memoryStore(), ask });

        await consent.ensure(key, perms('chat'));
        await consent.ensure({ ...key, cloudId: 'c2' }, perms('chat'));
        await consent.ensure({ ...key, userId: 'u2' }, perms('chat'));

        expect(ask).toHaveBeenCalledTimes(3);
    });

    it('holds a refusal for this view only, and keeps nothing of it', async () => {
        const store = memoryStore();
        const ask = jest.fn().mockResolvedValue(false);
        const consent = createSubWebViewRuntimeConsent({ store, ask });

        await expect(consent.ensure(key, perms('chat'))).resolves.toBe('refused');
        await expect(consent.ensure(key, perms('chat'))).resolves.toBe('refused');
        expect(ask).toHaveBeenCalledTimes(1);
        expect(store.values.size).toBe(0);

        await createSubWebViewRuntimeConsent({ store, ask }).ensure(key, perms('chat'));
        expect(ask).toHaveBeenCalledTimes(2);
    });

    it('puts one question up for requests that arrive while it is open', async () => {
        let answer: (allow: boolean) => void = () => undefined;
        const ask = jest.fn(() => new Promise<boolean>(resolve => (answer = resolve)));
        const consent = createSubWebViewRuntimeConsent({ store: memoryStore(), ask });

        const first = consent.ensure(key, perms('chat'));
        const second = consent.ensure(key, perms('chat'));
        answer(true);

        await expect(Promise.all([first, second])).resolves.toEqual(['allowed', 'allowed']);
        expect(ask).toHaveBeenCalledTimes(1);
    });

    it('reads a question that failed to show as a refusal', async () => {
        const consent = createSubWebViewRuntimeConsent({
            store: memoryStore(),
            ask: jest.fn().mockRejectedValue(new Error('no window')),
        });

        await expect(consent.ensure(key, perms('chat'))).resolves.toBe('refused');
    });

    it('asks a yes kept before the question named what members carry again when it covers user', async () => {
        const store = memoryStore();
        // A yes kept by an app before the revision: names only, no revision.
        store.set(`runtime\nu1\nhttps://quiz.apps.chatic.io\nc1\ns1`, 'channel,user');
        store.set(`runtime\nu1\nhttps://quiz.apps.chatic.io\nc2\ns1`, 'channel,chat');
        const ask = jest.fn().mockResolvedValue(true);
        const consent = createSubWebViewRuntimeConsent({ store, ask });

        await expect(consent.ensure(key, perms('channel', 'user'))).resolves.toBe('allowed');
        await expect(consent.ensure(key, perms('channel', 'user'))).resolves.toBe('allowed');
        // The yes without `user` said nothing less than it says now, so it still stands.
        await expect(consent.ensure({ ...key, cloudId: 'c2' }, perms('chat'))).resolves.toBe('allowed');

        expect(ask).toHaveBeenCalledTimes(1);
        expect(store.values.get(`runtime\nu1\nhttps://quiz.apps.chatic.io\nc1\ns1`)).toBe('channel,user;2');
    });

    it('reads a kept revision it cannot parse as the first', async () => {
        const store = memoryStore();
        store.set(`runtime\nu1\nhttps://quiz.apps.chatic.io\nc1\ns1`, 'user;x');
        const ask = jest.fn().mockResolvedValue(true);

        await createSubWebViewRuntimeConsent({ store, ask }).ensure(key, perms('user'));

        expect(ask).toHaveBeenCalledTimes(1);
    });
});
