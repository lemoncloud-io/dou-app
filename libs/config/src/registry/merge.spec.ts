import { ConfigRegistry, findPolicyViolations } from '.';
import { entry, moduleOf } from '../testing/fixtures';

describe('ConfigRegistry.merge — 중복 키', () => {
    it('먼저 선언된 것이 남고 나중 것은 버려진다', () => {
        const first = moduleOf({ 'a.key': entry({ title: '먼저' }) });
        const second = moduleOf({ 'a.key': entry({ title: '나중' }) });

        const registry = ConfigRegistry.merge([first, second]);

        expect(registry.get('a.key')?.title).toBe('먼저');
    });

    it('중복을 알리되 던지지 않는다 — 개발자 실수로 앱이 안 켜지면 안 된다', () => {
        const onDuplicateKey = jest.fn();
        const first = moduleOf({ 'a.key': entry() });
        const second = moduleOf({ 'a.key': entry() });

        expect(() => ConfigRegistry.merge([first, second], onDuplicateKey)).not.toThrow();
        expect(onDuplicateKey).toHaveBeenCalledWith('a.key');
    });

    it('순서가 정해져 있어 기기마다 결과가 달라지지 않는다', () => {
        const modules = [
            moduleOf({ 'a.key': entry({ title: '먼저' }) }),
            moduleOf({ 'a.key': entry({ title: '나중' }) }),
        ];

        const twice = [ConfigRegistry.merge(modules), ConfigRegistry.merge(modules)];

        expect(twice[0].get('a.key')?.title).toBe(twice[1].get('a.key')?.title);
    });
});

describe('findPolicyViolations — 성립하지 않는 조합', () => {
    it('사용자 화면인데 웹이 못 쓰면 잡는다', () => {
        const registry = ConfigRegistry.merge([
            moduleOf({ 'ui.x': entry({ surface: 'user', writableBy: ['shell'] }) }),
        ]);

        expect(findPolicyViolations(registry)).toEqual([expect.stringContaining('ui.x')]);
    });

    it('실험실인데 서버가 못 끄면 잡는다 — 원격으로 못 끄는 실험은 내보내지 않는다', () => {
        const registry = ConfigRegistry.merge([
            moduleOf({ 'feature.x': entry({ surface: 'labs', writableBy: ['shell', 'local'] }) }),
        ]);

        expect(findPolicyViolations(registry)).toEqual([expect.stringContaining('killable by the server')]);
    });

    it('사용자 화면인데 잠금 키이면 잡는다', () => {
        const registry = ConfigRegistry.merge([
            moduleOf({ 'ui.x': entry({ surface: 'user', writableBy: ['local'], meta: true }) }),
        ]);

        expect(findPolicyViolations(registry).length).toBeGreaterThan(0);
    });

    it('이름이나 설명이 비면 잡는다 — 없으면 화면에 점 표기 키가 그대로 뜬다', () => {
        const registry = ConfigRegistry.merge([moduleOf({ 'a.key': entry({ description: '  ' }) })]);

        expect(findPolicyViolations(registry)).toEqual([expect.stringContaining('title')]);
    });

    it('성립하는 조합은 아무것도 잡지 않는다', () => {
        const registry = ConfigRegistry.merge([
            moduleOf({
                'ui.theme': entry({ type: 'enum', values: ['light', 'dark'], defaultValue: 'light', surface: 'user' }),
                'log.hold': entry({ surface: 'dev' }),
            }),
        ]);

        expect(findPolicyViolations(registry)).toEqual([]);
    });
});
