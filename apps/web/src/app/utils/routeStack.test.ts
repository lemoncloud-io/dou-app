import { readHistoryIndex, routeStackTracker, type RouteStackTransition } from './routeStack';

/** Shorthand: the tracker only ever sees these three fields. */
const push = (pathname: string, index: number): RouteStackTransition => ({ pathname, action: 'PUSH', index });
const pop = (pathname: string, index: number): RouteStackTransition => ({ pathname, action: 'POP', index });
const replace = (pathname: string, index: number): RouteStackTransition => ({
    pathname,
    action: 'REPLACE',
    index,
});

/** Only the parts a reader cares about, so assertions stay legible. */
const paths = () => routeStackTracker.getSnapshot().entries.map(entry => entry.pathname);

describe('routeStackTracker', () => {
    beforeEach(() => {
        routeStackTracker.reset();
    });

    it('기본값은 빈 스택이고 현재 위치가 없다', () => {
        expect(routeStackTracker.getSnapshot()).toEqual({ entries: [], currentIndex: null, isIndexed: true });
    });

    it('push는 인덱스 순서대로 쌓는다', () => {
        routeStackTracker.record(push('/', 0));
        routeStackTracker.record(push('/channels/abc', 1));

        expect(paths()).toEqual(['/', '/channels/abc']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(1);
    });

    // 이게 trail과 스택이 갈라지는 지점이다. trail은 a,b,c를 남기지만 스택은 a,c다.
    it('뒤로 간 뒤 push하면 앞쪽 가지를 버린다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.record(push('/b', 1));
        routeStackTracker.record(pop('/a', 0));
        routeStackTracker.record(push('/c', 1));

        expect(paths()).toEqual(['/a', '/c']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(1);
    });

    it('pop은 앞쪽 항목을 지우지 않고 커서만 옮긴다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.record(push('/b', 1));
        routeStackTracker.record(pop('/a', 0));

        // 브라우저에서 /b는 여전히 앞으로가기로 닿는다.
        expect(paths()).toEqual(['/a', '/b']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(0);
    });

    it('replace는 제자리를 덮어쓰고 깊이를 늘리지 않는다', () => {
        routeStackTracker.record(push('/auth/login', 0));
        routeStackTracker.record(replace('/', 0));

        expect(paths()).toEqual(['/']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(0);
    });

    it('replace도 앞쪽 항목을 버리지 않는다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.record(push('/b', 1));
        routeStackTracker.record(pop('/a', 0));
        routeStackTracker.record(replace('/a2', 0));

        expect(paths()).toEqual(['/a2', '/b']);
    });

    // 스택 중간에서 리로드하면 아래 항목들은 관측된 적이 없다. 0부터 시작한 것처럼
    // 보이게 하면 깊이가 거짓이 된다.
    it('리로드로 중간에 착지하면 아래 항목을 알 수 없음으로 채운다', () => {
        routeStackTracker.record(push('/channels/abc', 3));

        expect(paths()).toEqual([null, null, null, '/channels/abc']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(3);
    });

    it('리로드 이후 뒤로 가면 그 자리의 경로를 채운다', () => {
        routeStackTracker.record(push('/channels/abc', 2));
        routeStackTracker.record(pop('/', 1));

        expect(paths()).toEqual([null, '/', '/channels/abc']);
    });

    it('인덱스를 못 읽은 전환이 오면 스택을 못 믿는다고 표시한다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.record({ pathname: '/b', action: 'PUSH', index: null });

        const snapshot = routeStackTracker.getSnapshot();
        expect(snapshot.isIndexed).toBe(false);
        // 자리를 모르는 항목을 끼워 넣어 스택을 망가뜨리지는 않는다.
        expect(snapshot.entries.map(entry => entry.pathname)).toEqual(['/a']);
    });

    it('빈 경로는 무시한다', () => {
        routeStackTracker.record(push('', 0));

        expect(routeStackTracker.getSnapshot().entries).toEqual([]);
    });

    it('현재 항목에만 isCurrent가 붙는다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.record(push('/b', 1));
        routeStackTracker.record(pop('/a', 0));

        expect(routeStackTracker.getSnapshot().entries.map(entry => entry.isCurrent)).toEqual([true, false]);
    });

    // trail과 같은 이유다 — 쿼리스트링에는 capability 토큰이 실린다.
    it('기록된 경로에 쿼리스트링이 섞여 있지 않다', () => {
        const location = { pathname: '/invite/accept', search: '?token=super-secret' };
        routeStackTracker.record(push(location.pathname, 0));

        const rendered = paths().join(' ');
        expect(rendered).not.toContain('super-secret');
        expect(rendered).not.toContain('?');
    });

    it('스냅샷은 복사본이라 외부에서 바꿔도 스택이 오염되지 않는다', () => {
        routeStackTracker.record(push('/a', 0));
        routeStackTracker.getSnapshot().entries.push({ index: 9, pathname: '/injected', isCurrent: false });

        expect(paths()).toEqual(['/a']);
    });
});

describe('readHistoryIndex', () => {
    it('라우터가 심은 idx를 읽는다', () => {
        window.history.pushState({ usr: null, key: 'abc', idx: 2 }, '');

        expect(readHistoryIndex()).toBe(2);
    });

    // 라우터를 우회한 pushState. 이때 스택은 복원 불가라는 사실을 호출부가 알아야 한다.
    it('idx가 없으면 null을 준다', () => {
        window.history.pushState({ someoneElse: true }, '');

        expect(readHistoryIndex()).toBeNull();
    });

    it('history state 자체가 없어도 던지지 않는다', () => {
        window.history.pushState(null, '');

        expect(readHistoryIndex()).toBeNull();
    });
});
