import { RemoteCache } from '../lanes/RemoteCache';
import type { IRemoteConfigAdapter, RemotePayload } from '../lanes/RemoteCache';
import { ConfigRegistry } from '../registry';
import { ConfigStore } from '../store/ConfigStore';
import { UNLOCK_ENTRY, entry, moduleOf } from '../testing/fixtures';
import { ConfigResolver, UNLOCK_KEY } from './ConfigResolver';

/**
 * 원격 레인은 이번 라운드에 구현하지 않는다. 이 파일이 그 자리가 살아 있다는 유일한 증거다.
 *
 * 한 번도 실행되지 않는 코드 경로는 처음 쓰는 날 반드시 깨져 있다. 그래서 가짜 어댑터로 지금 돌려본다 —
 * 킬이 웹 오버라이드를 이기는지, 서버 기본값은 웹에 지는지, 시간이 지나면 킬만 사라지는지.
 */
const fakeAdapter = (payload: RemotePayload): IRemoteConfigAdapter => ({ fetch: async () => payload });

const payloadOf = (
    entries: RemotePayload['entries'],
    overrides: Partial<Omit<RemotePayload, 'entries'>> = {}
): RemotePayload => ({ schemaVersion: 1, ttlSec: 600, entries, ...overrides });

const build = (now: () => number = () => 0) => {
    const registry = ConfigRegistry.merge([
        moduleOf({
            [UNLOCK_KEY]: UNLOCK_ENTRY,
            'feature.x': entry({ writableBy: ['shell', 'local', 'server'], defaultValue: false }),
        }),
    ]);
    const store = new ConfigStore();
    const remote = new RemoteCache(now);
    const resolver = new ConfigResolver(registry, store, remote, {
        stage: () => 'DEV',
        buildStage: () => 'DEV',
        platform: () => 'web',
        raw: () => undefined,
        wired: () => ({ shell: true, local: true, server: true }),
    });
    return { resolver, store, remote };
};

describe('원격 레인 — 자리는 있고 비어 있다', () => {
    it('어댑터가 없으면 아무 값도 안 내놓고 기본값으로 간다 — 동작이 오늘과 같다', () => {
        const { resolver } = build();

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: false, origin: 'default' });
    });
});

describe('원격 레인 — 가짜 어댑터로 계약을 확인한다', () => {
    it('킬은 웹 오버라이드를 이긴다 — 오버라이드가 잘못된 기기까지 되돌려야 한다', async () => {
        const { resolver, store, remote } = build();
        store.write('local', 'feature.x', true);

        remote.accept(await fakeAdapter(payloadOf({ 'feature.x': { value: false, enforced: true } })).fetch());

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: false, origin: 'serverEnforced' });
    });

    it('서버 기본값은 웹 오버라이드에 진다 — 개발자가 자기 기기에서 시험할 수 있어야 한다', async () => {
        const { resolver, store, remote } = build();
        store.write('local', 'feature.x', true);

        remote.accept(await fakeAdapter(payloadOf({ 'feature.x': { value: false } })).fetch());

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: true, origin: 'local' });
    });

    it('서버 기본값은 아무 오버라이드도 없을 때 규칙보다 먼저 쓰인다', async () => {
        const { resolver, remote } = build();

        remote.accept(await fakeAdapter(payloadOf({ 'feature.x': { value: true } })).fetch());

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: true, origin: 'serverDefault' });
    });
});

describe('원격 레인 — 시간이 지나면', () => {
    it('킬만 버려진다 — 서버에 못 닿는 기기가 영영 잠기지 않게', () => {
        let clock = 0;
        const { resolver, remote } = build(() => clock);
        remote.accept(payloadOf({ 'feature.x': { value: true, enforced: true } }, { ttlSec: 10 }));
        expect(resolver.snapshot('feature.x')?.origin).toBe('serverEnforced');

        clock = 11_000;

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: false, origin: 'default' });
    });

    it('서버 기본값은 오래돼도 계속 쓴다 — 오래된 기본값이 없는 것보다 낫다', () => {
        let clock = 0;
        const { resolver, remote } = build(() => clock);
        remote.accept(payloadOf({ 'feature.x': { value: true } }, { ttlSec: 10 }));

        clock = 11_000;

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: true, origin: 'serverDefault' });
    });
});

describe('원격 레인 — 못 읽는 페이로드', () => {
    it('아는 스키마 버전이 아니면 통째로 무시하고 이전 값을 지킨다', () => {
        const { resolver, remote } = build();
        remote.accept(payloadOf({ 'feature.x': { value: true } }));

        const accepted = remote.accept(payloadOf({ 'feature.x': { value: false } }, { schemaVersion: 99 }));

        expect(accepted).toBe(false);
        expect(resolver.snapshot('feature.x')?.value).toBe(true);
    });

    it('서버가 못 쓰는 키에 값을 보내도 무시한다', async () => {
        const registry = ConfigRegistry.merge([
            moduleOf({
                [UNLOCK_KEY]: UNLOCK_ENTRY,
                'net.relay.backend': entry({ type: 'string', defaultValue: 'https://a', writableBy: ['local'] }),
            }),
        ]);
        const remote = new RemoteCache();
        const resolver = new ConfigResolver(registry, new ConfigStore(), remote, {
            stage: () => 'DEV',
            buildStage: () => 'DEV',
            platform: () => 'web',
            wired: () => ({ shell: true, local: true, server: true }),
        });

        remote.accept(
            await fakeAdapter(payloadOf({ 'net.relay.backend': { value: 'https://evil', enforced: true } })).fetch()
        );

        expect(resolver.snapshot('net.relay.backend')?.value).toBe('https://a');
    });
});

describe('원격 레인 — 1행이 고장 나면', () => {
    it('조용히 다음 행으로 넘어간다 — 오류로 전부 꺼버리면 더 큰 사고다', () => {
        const { resolver, remote } = build();
        jest.spyOn(remote, 'enforced').mockImplementation(() => {
            throw new Error('킬 레인 고장');
        });

        expect(resolver.snapshot('feature.x')).toMatchObject({ value: false, origin: 'default' });
    });
});
