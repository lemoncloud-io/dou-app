import { resolveInAppPushRoute } from './resolveInAppPushRoute';

describe('resolveInAppPushRoute', () => {
    it('link 경로에 cid/sid 컨텍스트를 쿼리로 병합한다', () => {
        const route = resolveInAppPushRoute({
            link: '/channels/abc/room',
            cid: 'cloud1',
            sid: 'site1',
        });

        expect(route).toBe('/channels/abc/room?cid=cloud1&sid=site1');
    });

    it('link가 이미 가진 cid/sid는 덮어쓰지 않는다', () => {
        const route = resolveInAppPushRoute({
            link: '/channels/abc/room?cid=original',
            cid: 'other',
            sid: 'site1',
        });

        expect(route).toBe('/channels/abc/room?cid=original&sid=site1');
    });

    it('커스텀 스킴(chatic://)을 제거하고 경로만 취한다', () => {
        const route = resolveInAppPushRoute({ link: 'chatic://channels/abc/room' });

        expect(route).toBe('/channels/abc/room');
    });

    it('link가 없으면 clickAction으로 폴백한다', () => {
        const route = resolveInAppPushRoute({ clickAction: '/channels/abc/room' });

        expect(route).toBe('/channels/abc/room');
    });

    it('payload JSON 문자열 안의 cid/sid를 인식한다', () => {
        const route = resolveInAppPushRoute({
            link: '/channels/abc/room',
            payload: JSON.stringify({ cid: 'cloud1', sid: 'site1' }),
        });

        expect(route).toBe('/channels/abc/room?cid=cloud1&sid=site1');
    });

    it('payload JSON이 깨져 있으면 최상위 cid/sid를 사용한다', () => {
        const route = resolveInAppPushRoute({
            link: '/channels/abc/room',
            payload: '{not json',
            cid: 'cloud1',
        });

        expect(route).toBe('/channels/abc/room?cid=cloud1');
    });

    it('link 없이 channelId만 있으면 채널 룸 경로로 폴백한다', () => {
        const route = resolveInAppPushRoute({ channelId: 'abc', cid: 'cloud1', sid: 'site1' });

        expect(route).toBe('/channels/abc/room?cid=cloud1&sid=site1');
    });

    it('channelId 폴백에서 cid/sid가 없으면 쿼리 없이 경로만 만든다', () => {
        const route = resolveInAppPushRoute({ channelId: 'abc' });

        expect(route).toBe('/channels/abc/room');
    });

    // The spec nests chatId in `payload` alongside cid/sid. It rides the query so the shared
    // downstream (resolvePushNavigation → usePushNavigate) can hop to a thread if it's a reply.
    it('payload의 chatId를 쿼리로 실어 스레드 판정 재료를 넘긴다', () => {
        const route = resolveInAppPushRoute({
            link: '/channels/abc/room',
            payload: JSON.stringify({ cid: 'cloud1', chatId: 'abc:42' }),
        });

        expect(route).toBe('/channels/abc/room?cid=cloud1&chatId=abc%3A42');
    });

    it('channelId 폴백에서도 chatId를 함께 싣는다', () => {
        const route = resolveInAppPushRoute({ channelId: 'abc', chatId: 'abc:42' });

        expect(route).toBe('/channels/abc/room?chatId=abc%3A42');
    });

    it('라우팅 가능한 정보가 전혀 없으면 null을 반환한다', () => {
        expect(resolveInAppPushRoute({})).toBeNull();
        expect(resolveInAppPushRoute(undefined)).toBeNull();
        expect(resolveInAppPushRoute(null)).toBeNull();
        expect(resolveInAppPushRoute({ link: '   ' })).toBeNull();
    });
});
