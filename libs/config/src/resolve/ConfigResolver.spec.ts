import { RemoteCache } from '../lanes/RemoteCache';
import { ConfigRegistry } from '../registry';
import { ConfigStore } from '../store/ConfigStore';
import { UNLOCK_ENTRY, entry, moduleOf } from '../testing/fixtures';
import type { Stage } from '../types';
import { ConfigResolver, UNLOCK_KEY } from './ConfigResolver';

const build = (keys: Record<string, ReturnType<typeof entry>>, options: { stage?: Stage; buildStage?: Stage } = {}) => {
    const registry = ConfigRegistry.merge([moduleOf({ [UNLOCK_KEY]: UNLOCK_ENTRY, ...keys })]);
    const store = new ConfigStore();
    const remote = new RemoteCache();
    const resolver = new ConfigResolver(registry, store, remote, {
        stage: () => options.stage ?? 'DEV',
        buildStage: () => options.buildStage ?? options.stage ?? 'DEV',
        platform: () => 'web',
        wired: () => ({ shell: true, local: true, server: true }),
    });
    return { resolver, store, remote };
};

describe('ConfigResolver — 마지막 행이 언제나 답을 준다', () => {
    it('아무 레인도 값을 안 주면 defaultValue다', () => {
        const { resolver } = build({ 'a.key': entry({ defaultValue: true }) });

        expect(resolver.snapshot('a.key')).toMatchObject({ value: true, origin: 'default', isOverridden: false });
    });

    it('모르는 키는 undefined를 준다', () => {
        const { resolver } = build({});

        expect(resolver.snapshot('없는.키')).toBeUndefined();
    });
});

describe('ConfigResolver — 형식이 틀리면 다음 행으로 넘어간다', () => {
    it('저장값이 망가져도 화면이 깨지지 않고 기본값으로 내려간다', () => {
        const { resolver, store } = build({ 'a.key': entry({ defaultValue: false }) });
        store.write('local', 'a.key', '문자열인데 boolean 키다');

        expect(resolver.snapshot('a.key')).toMatchObject({ value: false, origin: 'default' });
    });

    it('enum은 목록에 없는 값을 거른다', () => {
        const { resolver, store } = build({
            'a.key': entry({ type: 'enum', values: ['light', 'dark'], defaultValue: 'light' }),
        });
        store.write('local', 'a.key', 'neon');

        expect(resolver.snapshot('a.key')?.value).toBe('light');
    });
});

describe('ConfigResolver — 순서', () => {
    it('앱 저장값이 웹 오버라이드를 이긴다', () => {
        const { resolver, store } = build({ 'a.key': entry() });
        store.write('local', 'a.key', true);
        store.write('shell', 'a.key', false);

        expect(resolver.snapshot('a.key')).toMatchObject({ value: false, origin: 'shell' });
    });

    it('잠기면 웹 오버라이드를 건너뛰고 규칙으로 내려간다', () => {
        const { resolver, store } = build({ 'a.key': entry({ byStage: { PROD: true } }) }, { stage: 'PROD' });
        store.write('local', 'a.key', false);

        expect(resolver.snapshot('a.key')).toMatchObject({ value: true, origin: 'stageRule' });
    });
});

describe('ConfigResolver — 잠금 자체를 정하기', () => {
    it('PROD에서는 기본이 잠김이다', () => {
        const { resolver } = build({}, { stage: 'PROD' });

        expect(resolver.isUnlocked()).toBe(false);
    });

    it('웹이 잠금을 풀 수 있다 — 지금과 같다', () => {
        const { resolver, store } = build({}, { stage: 'PROD' });
        store.write('local', UNLOCK_KEY, true);

        expect(resolver.isUnlocked()).toBe(true);
    });

    it('잠금을 정하는 동안 무한 반복에 빠지지 않는다', () => {
        const { resolver, store } = build({}, { stage: 'PROD' });
        store.write('local', UNLOCK_KEY, true);

        expect(() => resolver.snapshot(UNLOCK_KEY)).not.toThrow();
    });
});

describe('ConfigResolver — 보안 규칙은 빌드에 박힌 환경을 본다', () => {
    it('주입된 환경이 DEV라 해도 빌드가 PROD면 잠긴다', () => {
        const { resolver } = build({}, { stage: 'DEV', buildStage: 'PROD' });

        expect(resolver.isUnlocked()).toBe(false);
    });

    it('디버그 키도 빌드에 박힌 환경으로 판정한다', () => {
        const { resolver } = build(
            { 'debug.overlayEnabled': entry({ byStage: { LOCAL: true, DEV: true } }) },
            { stage: 'DEV', buildStage: 'PROD' }
        );

        expect(resolver.snapshot('debug.overlayEnabled')?.value).toBe(false);
    });

    it('보안과 무관한 키는 주입된 환경을 본다', () => {
        const { resolver } = build(
            { 'sync.pollMs': entry({ type: 'number', defaultValue: 60, byStage: { DEV: 10 } }) },
            { stage: 'DEV', buildStage: 'PROD' }
        );

        expect(resolver.snapshot('sync.pollMs')?.value).toBe(10);
    });
});
