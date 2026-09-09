import { createConfig } from '.';
import { UNLOCK_ENTRY, entry, memoryStorage, moduleOf, envAdapter, ports } from './testing/fixtures';
import { UNLOCK_KEY } from './resolve/ConfigResolver';
import { storageKeyFor } from './utils/serialize';

const modules = () => [
    moduleOf({
        [UNLOCK_KEY]: UNLOCK_ENTRY,
        'ui.blur': entry({ surface: 'user', writableBy: ['shell', 'local'], persist: 'local' }),
        'log.hold': entry({ surface: 'dev', writableBy: ['shell', 'local'], persist: 'local' }),
        'net.backend': entry({ type: 'string', defaultValue: 'https://a', writableBy: ['local'], persist: 'session' }),
        'env.stage': entry({ type: 'string', defaultValue: 'DEV', writableBy: [], persist: 'none' }),
    }),
];

describe('config.set — 거부는 던지지 않고 이유를 돌려준다', () => {
    it('모르는 키', () => {
        const config = createConfig(modules());
        config.init(ports());

        expect(config.set('없는.키', true, { lane: 'local' })).toEqual({ ok: false, reason: 'unknownKey' });
    });

    it('그 레인이 못 쓰는 키', () => {
        const config = createConfig(modules());
        config.init(ports());

        expect(config.set('net.backend', 'https://b', { lane: 'server' })).toEqual({
            ok: false,
            reason: 'laneNotAllowed',
        });
    });

    it('읽기 전용 키는 아무도 못 쓴다', () => {
        const config = createConfig(modules());
        config.init(ports());

        expect(config.set('env.stage', 'PROD', { lane: 'local' })).toEqual({ ok: false, reason: 'laneNotAllowed' });
    });

    it('형식이 틀린 값', () => {
        const config = createConfig(modules());
        config.init(ports());

        expect(config.set('ui.blur', '문자열', { lane: 'local' })).toEqual({ ok: false, reason: 'invalidValue' });
    });

    it('PROD에서 잠겨 있으면 웹 쓰기를 거부한다', () => {
        const config = createConfig(modules());
        config.init(ports({ env: envAdapter('PROD') }));

        expect(config.set('log.hold', true, { lane: 'local' })).toEqual({ ok: false, reason: 'locked' });
    });

    it('잠금을 풀면 통과한다 — 웹이 10탭으로 푸는 것과 같은 경로다', () => {
        const config = createConfig(modules());
        config.init(ports({ env: envAdapter('PROD') }));

        expect(config.set(UNLOCK_KEY, true, { lane: 'local' })).toEqual({ ok: true });
        expect(config.set('log.hold', true, { lane: 'local' })).toEqual({ ok: true });
    });

    it('init 전에는 아무것도 안 한다', () => {
        expect(createConfig(modules()).set('ui.blur', true, { lane: 'local' })).toEqual({
            ok: false,
            reason: 'notWired',
        });
    });
});

describe('config.subscribe — resolve 결과가 바뀐 키만 알린다', () => {
    it('값이 실제로 바뀌면 알린다', () => {
        const config = createConfig(modules());
        config.init(ports());
        const listener = jest.fn();
        config.subscribe(['log.hold'], listener);

        config.set('log.hold', true, { lane: 'local' });

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('같은 값을 다시 써도 안 알린다', () => {
        const config = createConfig(modules());
        config.init(ports());
        config.set('log.hold', true, { lane: 'local' });
        const listener = jest.fn();
        config.subscribe(['log.hold'], listener);

        config.set('log.hold', true, { lane: 'local' });

        expect(listener).not.toHaveBeenCalled();
    });

    it('이기고 있는 행 아래가 바뀌면 안 알린다 — 관측자는 지금 쓰이는 값만 본다', () => {
        const config = createConfig(modules());
        config.init(ports());
        config.set('log.hold', true, { lane: 'shell' });
        const listener = jest.fn();
        config.subscribe(['log.hold'], listener);

        config.set('log.hold', false, { lane: 'local' });

        expect(listener).not.toHaveBeenCalled();
    });
});

describe('config — 저장과 복원', () => {
    it('persist가 local이면 localStorage 쪽에 담는다', () => {
        const local = memoryStorage();
        const config = createConfig(modules());
        config.init(ports({ storage: { local, session: memoryStorage() } }));

        config.set('log.hold', true, { lane: 'local' });

        expect(local.dump()[storageKeyFor('log.hold')]).toBe('true');
    });

    it('persist가 session이면 session 쪽에 담는다 — 오버라이드는 탭이 닫히면 사라진다', () => {
        const local = memoryStorage();
        const session = memoryStorage();
        const config = createConfig(modules());
        config.init(ports({ storage: { local, session } }));

        config.set('net.backend', 'https://b', { lane: 'local' });

        expect(session.dump()[storageKeyFor('net.backend')]).toBe('"https://b"');
        expect(local.dump()[storageKeyFor('net.backend')]).toBeUndefined();
    });

    it('부팅 때 저장된 값을 다시 읽는다', () => {
        const local = memoryStorage();
        local.setItem(storageKeyFor('log.hold'), 'true');
        const config = createConfig(modules());

        config.init(ports({ storage: { local, session: memoryStorage() } }));

        expect(config.get('log.hold')).toBe(true);
    });

    it('저장값이 망가져 있으면 무시하고 기본값을 쓴다', () => {
        const local = memoryStorage();
        local.setItem(storageKeyFor('log.hold'), '{망가짐');
        const config = createConfig(modules());

        config.init(ports({ storage: { local, session: memoryStorage() } }));

        expect(config.get('log.hold')).toBe(false);
    });

    it('저장소가 막혀 있어도 토글은 동작한다', () => {
        const blocked = {
            getItem: () => null,
            setItem: () => {
                throw new Error('quota');
            },
            removeItem: () => undefined,
        };
        const config = createConfig(modules());
        config.init(ports({ storage: { local: blocked } }));

        expect(config.set('log.hold', true, { lane: 'local' })).toEqual({ ok: true });
        expect(config.get('log.hold')).toBe(true);
    });
});

describe('config — 앱에 쓰기는 답을 받는다', () => {
    const shellEntry = () => [
        moduleOf({
            [UNLOCK_KEY]: UNLOCK_ENTRY,
            'ui.theme': entry({
                type: 'string',
                defaultValue: 'light',
                writableBy: ['shell', 'local'],
                persist: 'shell',
            }),
        }),
    ];

    it('한 번 실패하면 다시 보낸다', async () => {
        const write = jest.fn().mockRejectedValueOnce(new Error('드롭')).mockResolvedValueOnce(undefined);
        const onShellWriteFailed = jest.fn();
        const config = createConfig(shellEntry());
        config.init(ports({ shell: { readBag: () => ({}), write, clear: jest.fn() }, onShellWriteFailed }));

        config.set('ui.theme', 'dark', { lane: 'local' });
        await Promise.resolve();
        await Promise.resolve();

        expect(write).toHaveBeenCalledTimes(2);
        expect(onShellWriteFailed).not.toHaveBeenCalled();
    });

    it('두 번 다 실패하면 알린다 — 조용히 성공한 척하지 않는다', async () => {
        const write = jest.fn().mockRejectedValue(new Error('드롭'));
        const onShellWriteFailed = jest.fn();
        const config = createConfig(shellEntry());
        config.init(ports({ shell: { readBag: () => ({}), write, clear: jest.fn() }, onShellWriteFailed }));

        config.set('ui.theme', 'dark', { lane: 'local' });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(write).toHaveBeenCalledTimes(2);
        expect(onShellWriteFailed).toHaveBeenCalledWith('ui.theme', expect.any(Error));
    });

    it('앱 주입 봉투를 부팅 때 읽는다', () => {
        const config = createConfig(shellEntry());
        config.init(
            ports({
                shell: { readBag: () => ({ 'ui.theme': '"dark"' }), write: jest.fn(), clear: jest.fn() },
            })
        );

        expect(config.snapshot('ui.theme')).toMatchObject({ value: 'dark', origin: 'shell' });
    });
});

describe('config.snapshotAll — 기기 상태 보기의 재료', () => {
    it('기본값과 다른 키만 골라낼 수 있다', () => {
        const config = createConfig(modules());
        config.init(ports());
        expect(config.overriddenSnapshots()).toEqual([]);

        config.set('log.hold', true, { lane: 'local' });

        expect(config.overriddenSnapshots().map(snapshot => snapshot.key)).toEqual(['log.hold']);
    });

    it('스냅샷 하나에 화면이 행을 그릴 재료가 다 있다', () => {
        const config = createConfig(modules());
        config.init(ports());

        expect(config.snapshot('ui.blur')).toMatchObject({
            key: 'ui.blur',
            entry: expect.objectContaining({ title: expect.any(String), description: expect.any(String) }),
            value: false,
            origin: 'default',
            isOverridden: false,
            canWrite: ['local'],
        });
    });

    it('배선 안 된 레인은 canWrite에 안 들어간다 — 못 쓰는 컨트롤을 활성으로 그리지 않게', () => {
        const config = createConfig(modules());
        config.init(ports({ storage: undefined }));

        expect(config.snapshot('ui.blur')?.canWrite).toEqual([]);
    });
});

describe('config.clear — 오버라이드를 지운다', () => {
    const relayModules = () => [
        moduleOf({
            [UNLOCK_KEY]: UNLOCK_ENTRY,
            'net.relay.backend': entry({
                type: 'string',
                defaultValue: 'https://build-default',
                writableBy: ['local'],
                persist: 'session',
            }),
        }),
    ];

    it('지우면 아래 행이 다시 보인다 — set(defaultValue)와 다르다', () => {
        const config = createConfig(relayModules());
        config.init(ports());
        config.set('net.relay.backend', 'https://qa-override', { lane: 'local' });
        expect(config.get('net.relay.backend')).toBe('https://qa-override');

        expect(config.clear('net.relay.backend', { lane: 'local' })).toEqual({ ok: true });

        expect(config.get('net.relay.backend')).toBe('https://build-default');
    });

    it('지워진 키만 알린다', () => {
        const config = createConfig(relayModules());
        config.init(ports());
        config.set('net.relay.backend', 'https://qa-override', { lane: 'local' });
        const listener = jest.fn();
        config.subscribe(['net.relay.backend'], listener);

        config.clear('net.relay.backend', { lane: 'local' });

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('원래부터 오버라이드가 없으면 조용히 아무 일도 없다', () => {
        const config = createConfig(relayModules());
        config.init(ports());
        const listener = jest.fn();
        config.subscribe(['net.relay.backend'], listener);

        expect(config.clear('net.relay.backend', { lane: 'local' })).toEqual({ ok: true });
        expect(listener).not.toHaveBeenCalled();
    });

    it('그 레인이 못 쓰는 키는 거부한다', () => {
        const config = createConfig(relayModules());
        config.init(ports());

        expect(config.clear('net.relay.backend', { lane: 'shell' })).toEqual({ ok: false, reason: 'laneNotAllowed' });
    });

    it('저장소에서도 지운다', () => {
        const local = memoryStorage();
        const config = createConfig(modules());
        config.init(ports({ storage: { local, session: memoryStorage() } }));
        config.set('log.hold', true, { lane: 'local' });
        expect(local.dump()[storageKeyFor('log.hold')]).toBeDefined();

        config.clear('log.hold', { lane: 'local' });

        expect(local.dump()[storageKeyFor('log.hold')]).toBeUndefined();
    });
});

describe('config.refreshRemote — 어댑터가 없으면 아무 일도 없다', () => {
    it('어댑터가 없으면 false다', async () => {
        const config = createConfig(modules());
        config.init(ports());

        await expect(config.refreshRemote()).resolves.toBe(false);
    });
});
