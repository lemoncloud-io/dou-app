import { createConfig } from '..';
import type { IConfigEnvAdapter, IShellKvAdapter } from '../ports';
import { UNLOCK_KEY } from '../resolve/ConfigResolver';
import { envAdapter, memoryStorage, ports } from '../testing/fixtures';
import type { Stage } from '../types';
import { encodeValue, storageKeyFor } from '../utils/serialize';
import { portModule } from './port';

const PORT_KEYS = [
    'port.storage',
    'port.transport',
    'port.auth',
    'port.foreground',
    'port.db',
    'port.checkout',
    'port.media',
    'port.files',
    'port.links',
    'port.appShell',
    'port.signIn',
    'port.diagnostics',
    'port.push',
    'port.logSink',
    'port.engine',
];

const withBuildValues = (stage: Stage, values: Record<string, string>): IConfigEnvAdapter => ({
    ...envAdapter(stage),
    raw: name => values[name],
});

const boot = (stage: Stage = 'DEV', overrides: Parameters<typeof ports>[0] = {}) => {
    const config = createConfig();
    config.init(ports({ env: envAdapter(stage), ...overrides }));
    return config;
};

describe('port.* — one adapter choice per port', () => {
    it('declares exactly one key per port', () => {
        expect(Object.keys(portModule)).toEqual(PORT_KEYS);
    });

    it.each(PORT_KEYS)('%s defaults to empty, from the registry rather than an override', key => {
        const snapshot = boot().snapshot<string>(key);

        expect(snapshot).toMatchObject({ value: '', origin: 'default', isOverridden: false });
        expect(snapshot?.entry.appliesAt).toBe('restart');
    });

    it('resolves a local override and reports the lane it came from', () => {
        const config = boot();

        expect(config.set('port.db', 'db.memory', { lane: 'local' })).toEqual({ ok: true });
        expect(config.snapshot('port.db')).toMatchObject({
            value: 'db.memory',
            origin: 'local',
            isOverridden: true,
        });
    });

    it('keeps the override across a restart, which is when an adapter choice applies', () => {
        const local = memoryStorage();
        boot('DEV', { storage: { local } }).set('port.appShell', 'appShell.native-ios', { lane: 'local' });

        const restarted = boot('DEV', { storage: { local } });

        expect(restarted.snapshot('port.appShell')).toMatchObject({ value: 'appShell.native-ios', origin: 'local' });
    });

    it('lets the shell lane outrank the local one', () => {
        const local = memoryStorage();
        local.setItem(storageKeyFor('port.push'), encodeValue('push.web'));
        const shell: IShellKvAdapter = {
            readBag: () => ({ 'port.push': encodeValue('push.native') }),
            write: () => Promise.resolve(),
            clear: () => Promise.resolve(),
        };

        const config = boot('DEV', { storage: { local }, shell });

        expect(config.snapshot('port.push')).toMatchObject({ value: 'push.native', origin: 'shell' });
    });

    it.each([
        ['an upper-case adapter', 'db.Memory'],
        ['another port', 'storage.memory'],
        ['no adapter', 'db.'],
        ['no port', 'memory'],
        ['a trailing dash', 'db.memory-'],
    ])('refuses %s', (_, value) => {
        expect(boot().set('port.db', value, { lane: 'local' })).toEqual({ ok: false, reason: 'invalidValue' });
    });

    it('demotes a malformed stored value to the empty floor', () => {
        const local = memoryStorage();
        local.setItem(storageKeyFor('port.db'), encodeValue('storage.memory'));

        expect(boot('DEV', { storage: { local } }).snapshot('port.db')).toMatchObject({
            value: '',
            origin: 'default',
        });
    });

    it('takes a build value below every lane, and demotes a malformed one', () => {
        const config = createConfig();
        config.init(ports({ env: withBuildValues('DEV', { VITE_PORT_DB: 'db.memory', VITE_PORT_MEDIA: 'Media' }) }));

        expect(config.snapshot('port.db')).toMatchObject({ value: 'db.memory', origin: 'default' });
        expect(config.snapshot('port.media')).toMatchObject({ value: '', origin: 'default' });

        config.set('port.db', 'db.indexed-db', { lane: 'local' });
        expect(config.snapshot('port.db')).toMatchObject({ value: 'db.indexed-db', origin: 'local' });
    });

    describe('port.db reads a choice saved under port.cache', () => {
        const savedAsCache = (value: string) => {
            const local = memoryStorage();
            local.setItem(storageKeyFor('port.cache'), encodeValue(value));
            return local;
        };

        it('takes the saved choice, renamed to the db port, from the lane it was saved in', () => {
            const config = boot('DEV', { storage: { local: savedAsCache('cache.web-storage') } });

            expect(config.snapshot('port.db')).toMatchObject({ value: 'db.web-storage', origin: 'local' });
        });

        it('reads the shell lane under the old name too', () => {
            const shell: IShellKvAdapter = {
                readBag: () => ({ 'port.cache': encodeValue('cache.shell-sqlite') }),
                write: () => Promise.resolve(),
                clear: () => Promise.resolve(),
            };

            expect(boot('DEV', { shell }).snapshot('port.db')).toMatchObject({
                value: 'db.shell-sqlite',
                origin: 'shell',
            });
        });

        it('lets a choice under the new name win over the old one', () => {
            const local = savedAsCache('cache.web-storage');
            local.setItem(storageKeyFor('port.db'), encodeValue('db.indexeddb'));

            expect(boot('DEV', { storage: { local } }).snapshot('port.db')).toMatchObject({
                value: 'db.indexeddb',
                origin: 'local',
            });
        });

        it('forgets both names when the choice is cleared', () => {
            const local = savedAsCache('cache.web-storage');
            const config = boot('DEV', { storage: { local } });

            expect(config.clear('port.db', { lane: 'local' })).toEqual({ ok: true });

            expect(config.snapshot('port.db')).toMatchObject({ value: '', origin: 'default' });
            expect(local.getItem(storageKeyFor('port.cache'))).toBeNull();
            expect(boot('DEV', { storage: { local } }).snapshot('port.db')).toMatchObject({
                value: '',
                origin: 'default',
            });
        });

        it('demotes an old value that names another port', () => {
            const config = boot('DEV', { storage: { local: savedAsCache('storage.memory') } });

            expect(config.snapshot('port.db')).toMatchObject({ value: '', origin: 'default' });
        });

        it('no longer registers port.cache itself', () => {
            expect(boot().snapshot('port.cache')).toBeUndefined();
        });
    });

    describe('on a PROD build', () => {
        it('locks the local lane until the override unlock', () => {
            const config = boot('PROD');

            expect(config.set('port.db', 'db.memory', { lane: 'local' })).toEqual({
                ok: false,
                reason: 'locked',
            });
            expect(config.snapshot('port.db')?.canWrite).not.toContain('local');

            config.set(UNLOCK_KEY, true, { lane: 'local' });

            expect(config.set('port.db', 'db.memory', { lane: 'local' })).toEqual({ ok: true });
            expect(config.snapshot('port.db')).toMatchObject({ value: 'db.memory', origin: 'local' });
        });

        it('ignores a stored local override while locked', () => {
            const local = memoryStorage();
            local.setItem(storageKeyFor('port.db'), encodeValue('db.memory'));

            expect(boot('PROD', { storage: { local } }).snapshot('port.db')).toMatchObject({
                value: '',
                origin: 'default',
            });
        });
    });
});
