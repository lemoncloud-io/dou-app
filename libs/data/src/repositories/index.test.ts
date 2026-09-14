import { createRepositories, type DataRepositories } from './index';
import type { DataContextProvider } from './types';
import type { LocalDataSources } from '../local/data-sources';
import type { SocketDataSources } from '../remote/socket-data-sources';
import type { HttpDataSources } from '../remote/http-data-sources';

/**
 * Every domain the factory builds — and therefore every domain `dispose()` has to reach.
 *
 * `dispose()` is a hand-written list inside `createRepositories`, so a domain added to
 * `buildRepositories` and forgotten there leaks in silence: nothing in the type system pairs the two.
 * This list is the pairing. Adding a domain means adding it here, and then both assertions below say
 * whether the factory and the teardown agree.
 */
const DOMAIN_KEYS = [
    'auth',
    'channel',
    'chat',
    'cloud',
    'device',
    'invite',
    'join',
    'place',
    'profile',
    'report',
    'subscription',
    'syncMeta',
    'user',
] as const;

/** Data sources are only stored by the constructors, so an inert stub per domain is enough. */
const stubBundle = <T>(): T => new Proxy({}, { get: () => ({}) }) as T;

const createContextProvider = (): DataContextProvider => ({
    getContext: () => ({ cid: 'cloud-a', sid: 'place-a', uid: 'user-a' }),
    setContext: () => undefined,
});

const build = (): DataRepositories =>
    createRepositories({
        socketDataSources: stubBundle<SocketDataSources>(),
        localDataSources: stubBundle<LocalDataSources>(),
        context: createContextProvider(),
        httpDataSources: stubBundle<HttpDataSources>(),
    });

describe('createRepositories', () => {
    it('exposes every domain and nothing else', () => {
        const repositories = build();

        expect(Object.keys(repositories).sort()).toEqual([...DOMAIN_KEYS, 'dispose', 'withContext'].sort());
    });

    it('routes dispose() to every domain', () => {
        const repositories = build();
        const disposals = DOMAIN_KEYS.map(key => ({
            key,
            spy: jest.spyOn(repositories[key], 'dispose'),
        }));

        repositories.dispose();

        const missed = disposals.filter(({ spy }) => spy.mock.calls.length === 0).map(({ key }) => key);
        expect(missed).toEqual([]);
    });

    it('gives withContext() the same catalogue', () => {
        const repositories = build();

        const pinned = repositories.withContext({ cid: 'cloud-b', sid: 'place-b', uid: 'user-a' });

        expect(Object.keys(pinned).sort()).toEqual(Object.keys(repositories).sort());
        expect(pinned).not.toBe(repositories);
    });
});
