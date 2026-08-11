import { ROUTE_TRAIL_SIZE, getRouteTrail, recordRoute, resetRouteTrail } from './routeTrail';

describe('routeTrail', () => {
    beforeEach(() => {
        resetRouteTrail();
    });

    it('기본값은 빈 배열이다', () => {
        expect(getRouteTrail()).toEqual([]);
    });

    it('방문 순서대로(오래된 것 먼저) 쌓는다', () => {
        recordRoute('/');
        recordRoute('/channels/abc');
        recordRoute('/mypage');

        expect(getRouteTrail()).toEqual(['/', '/channels/abc', '/mypage']);
    });

    it('연속 중복 경로는 무시한다', () => {
        recordRoute('/mypage');
        recordRoute('/mypage');

        expect(getRouteTrail()).toEqual(['/mypage']);
    });

    it('사이에 다른 경로가 있으면 같은 경로도 다시 기록한다', () => {
        recordRoute('/mypage');
        recordRoute('/mypage/feedback');
        recordRoute('/mypage');

        expect(getRouteTrail()).toEqual(['/mypage', '/mypage/feedback', '/mypage']);
    });

    it('빈 경로는 무시한다', () => {
        recordRoute('');

        expect(getRouteTrail()).toEqual([]);
    });

    // 트레일은 공용 Slack 채널로 전송된다. 경로 세그먼트는 리소스 id지만 쿼리스트링은
    // capability 토큰이라(/invite/accept?..., /s?...) 절대 실려서는 안 된다.
    // 이 테스트는 호출부가 pathname만 넘긴다는 계약을 못박는다.
    it('기록된 경로에 쿼리스트링이 섞여 있지 않다', () => {
        const router = { state: { location: { pathname: '/invite/accept', search: '?token=super-secret' } } };
        recordRoute(router.state.location.pathname);

        const trail = getRouteTrail();
        expect(trail).toEqual(['/invite/accept']);
        expect(trail.join(' ')).not.toContain('super-secret');
        expect(trail.join(' ')).not.toContain('?');
    });

    it(`상한(${ROUTE_TRAIL_SIZE})을 넘으면 가장 오래된 것부터 밀어낸다`, () => {
        for (let i = 0; i < ROUTE_TRAIL_SIZE + 3; i += 1) recordRoute(`/p${i}`);

        const result = getRouteTrail();
        expect(result).toHaveLength(ROUTE_TRAIL_SIZE);
        expect(result[0]).toBe('/p3');
        expect(result[ROUTE_TRAIL_SIZE - 1]).toBe(`/p${ROUTE_TRAIL_SIZE + 2}`);
    });

    it('반환값은 복사본이라 외부에서 바꿔도 버퍼가 오염되지 않는다', () => {
        recordRoute('/mypage');
        getRouteTrail().push('/injected');

        expect(getRouteTrail()).toEqual(['/mypage']);
    });
});
