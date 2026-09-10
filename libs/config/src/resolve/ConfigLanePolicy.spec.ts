import { entry } from '../testing/fixtures';
import { ConfigLanePolicy } from './ConfigLanePolicy';

describe('ConfigLanePolicy — 순서', () => {
    it('순서는 킬 · 앱 · 웹 · 서버기본값이고 한 곳에만 있다', () => {
        expect(new ConfigLanePolicy().order).toEqual(['serverEnforced', 'shell', 'local', 'serverDefault']);
    });
});

describe('ConfigLanePolicy.canSupply — 자격', () => {
    const policy = new ConfigLanePolicy();

    it('쓸 수 없는 레인은 값을 내놓지 못한다', () => {
        const onlyShell = entry({ writableBy: ['shell'] });

        expect(policy.canSupply(onlyShell, 'shell', true)).toBe(true);
        expect(policy.canSupply(onlyShell, 'local', true)).toBe(false);
    });

    it('서버 두 레인은 같은 자격을 본다', () => {
        const serverWritable = entry({ writableBy: ['server'] });

        expect(policy.canSupply(serverWritable, 'serverEnforced', false)).toBe(true);
        expect(policy.canSupply(serverWritable, 'serverDefault', false)).toBe(true);
    });

    it('잠기면 웹 레인만 막힌다 — 앱과 서버는 그대로다', () => {
        const all = entry({ writableBy: ['shell', 'local', 'server'] });

        expect(policy.canSupply(all, 'local', false)).toBe(false);
        expect(policy.canSupply(all, 'shell', false)).toBe(true);
        expect(policy.canSupply(all, 'serverEnforced', false)).toBe(true);
    });

    it('잠금 키는 잠금 검사를 면제받는다 — 자기를 정할 때 자기를 물으면 무한 반복이다', () => {
        const lockKey = entry({ writableBy: ['shell', 'local'], meta: true });

        expect(policy.canSupply(lockKey, 'local', false)).toBe(true);
    });

    it('dev 노출면이 아닌 키는 잠겨 있어도 웹 레인을 쓴다 — QA 우회로가 아니라 사용자 자신의 조작이다', () => {
        const userKey = entry({ writableBy: ['local'], surface: 'user' });
        const internalKey = entry({ writableBy: ['local'], surface: 'internal' });
        const labsKey = entry({ writableBy: ['local'], surface: 'labs' });

        expect(policy.canSupply(userKey, 'local', false)).toBe(true);
        expect(policy.canSupply(internalKey, 'local', false)).toBe(true);
        expect(policy.canSupply(labsKey, 'local', false)).toBe(true);
    });

    it('dev 노출면 키는 여전히 잠긴다 — 면제는 surface 하나뿐, 기본값은 그대로 막는다', () => {
        const devKey = entry({ writableBy: ['local'], surface: 'dev' });

        expect(policy.canSupply(devKey, 'local', false)).toBe(false);
        expect(policy.canSupply(devKey, 'local', true)).toBe(true);
    });
});

describe('ConfigLanePolicy.writersFor — 이 기기에서 지금 쓸 수 있는 사람', () => {
    const policy = new ConfigLanePolicy();
    const allWired = { shell: true, local: true, server: true } as const;

    it('선언에 있어도 배선이 안 됐으면 못 쓴다', () => {
        const all = entry({ writableBy: ['shell', 'local', 'server'] });

        expect(policy.writersFor(all, true, { shell: false, local: true, server: false })).toEqual(['local']);
    });

    it('잠기면 웹이 빠진다 — 패널이 못 쓰는 컨트롤을 활성으로 그리지 않게', () => {
        const all = entry({ writableBy: ['shell', 'local', 'server'] });

        expect(policy.writersFor(all, false, allWired)).toEqual(['shell', 'server']);
    });

    it('잠금 키는 잠겨 있어도 웹이 쓸 수 있다', () => {
        const lockKey = entry({ writableBy: ['shell', 'local'], meta: true });

        expect(policy.writersFor(lockKey, false, allWired)).toEqual(['shell', 'local']);
    });

    it('dev 노출면이 아닌 키는 잠겨 있어도 웹이 쓸 수 있다', () => {
        const userKey = entry({ writableBy: ['local'], surface: 'user' });

        expect(policy.writersFor(userKey, false, allWired)).toEqual(['local']);
    });
});
