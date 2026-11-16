import type { CachedCloudTokens } from '@chatic/session';
import { cloudStore, relayStore, sessionSignal, sessionStores } from '@chatic/session';
import { MemoryStore } from '@chatic/storage';

import { createCoreSessionView } from './sessionView';

// The view against the real stores and the real session signal, in memory: the order in which the
// signal invalidates and notifies, and the writes that announce nothing, are what these check — a
// mocked store cannot get either wrong.

const relayToken = (uid: string, name: string) =>
    ({ uid, name, Token: { identityToken: `relay-${uid}` } }) as unknown as Parameters<
        typeof relayStore.saveRelayToken
    >[0];

const cachedTokens = (cloudId: string, uid: string): CachedCloudTokens =>
    ({
        delegationToken: { cloudId, backend: 'https://cloud', wss: 'wss://cloud' },
        cloudToken: { uid, Token: { identityToken: `cloud-${uid}`, credential: { Expiration: '2099-01-01' } } },
    }) as unknown as CachedCloudTokens;

beforeEach(() => {
    sessionStores.configure({ secret: new MemoryStore(), plain: new MemoryStore() });
    relayStore.configureEndpoints({ backend: () => 'https://relay', wss: () => 'wss://relay' });
});

describe('the core session view over the real stores', () => {
    it('follows a cloud re-issued into the cache for another account, which raises no session signal', () => {
        const view = createCoreSessionView();
        const listener = jest.fn();
        view.subscribe(listener);
        cloudStore.setCloudIdentity('c1', { uid: 'guest-uid' });
        expect(view.snapshot().uidByCloud.c1).toBe('guest-uid');

        cloudStore.setCachedCloudTokens('c1', cachedTokens('c1', 'owner-uid'));

        expect(listener).toHaveBeenCalled();
        expect(view.snapshot().uidByCloud.c1).toBe('owner-uid');
    });

    it("forgets a cloud's uid once its identity is dropped, though nothing else announces it", () => {
        const view = createCoreSessionView();
        view.subscribe(jest.fn());
        cloudStore.setCloudIdentity('paired', { uid: 'approver-uid' });
        expect(view.snapshot().uidByCloud.paired).toBe('approver-uid');

        cloudStore.dropCloudIdentity('paired');

        expect(view.snapshot().uidByCloud).not.toHaveProperty('paired');
    });

    it('lets a subscriber see the whole of a batched change, read from inside its notification', () => {
        const view = createCoreSessionView();
        relayStore.saveRelayToken(relayToken('u1', 'First'));
        view.snapshot();
        const seen: unknown[] = [];
        view.subscribe(() => seen.push(view.snapshot().relayUser?.name));

        sessionSignal.batch(() => {
            relayStore.saveRelayToken(relayToken('u1', 'Second'));
            relayStore.saveRelayToken(relayToken('u1', 'Third'));
        });

        expect(seen).toEqual(['Third']);
    });

    it('carries no token, though the stores hold them', () => {
        const view = createCoreSessionView();
        relayStore.saveRelayToken(relayToken('u1', 'Me'));
        cloudStore.setCachedCloudTokens('c1', cachedTokens('c1', 'u-c1'));

        const text = JSON.stringify(view.snapshot());

        expect(text).not.toMatch(/relay-u1|cloud-u-c1|identityToken|Token/);
        expect(view.snapshot().relayUser).toEqual({ uid: 'u1', name: 'Me' });
    });
});
