import { resolvePushPath } from './resolvePushPath';

describe('resolvePushPath', () => {
    it('스펙형 상대 link와 payload(JSON 문자열)의 cid/sid를 쿼리로 병합한다', () => {
        const path = resolvePushPath({
            link: 'channel?channelId=room_123',
            payload: JSON.stringify({ cid: 'cloud_1', sid: '100002', uid: 'user_456' }),
        });

        // Relative link keeps its own query; cid/sid are appended for the web to consume.
        expect(path).toBe('/channel?channelId=room_123&cid=cloud_1&sid=100002');
    });

    it('웹 정렬 절대 경로 link와 payload 객체의 cid/sid를 병합하고 기존 쿼리를 보존한다', () => {
        const path = resolvePushPath({
            link: '/channels/1000001/room?tab=info',
            payload: { cid: 'cloud_1', sid: 'site_9' },
        });

        expect(path).toBe('/channels/1000001/room?tab=info&cid=cloud_1&sid=site_9');
    });

    it('cid/sid가 없으면 link 경로를 그대로 반환한다', () => {
        const path = resolvePushPath({ link: '/channels/1000001/room' });
        expect(path).toBe('/channels/1000001/room');
    });

    it('link가 없으면 null을 반환해 강제 네비게이션을 하지 않는다', () => {
        expect(resolvePushPath({ payload: JSON.stringify({ cid: 'cloud_1' }) })).toBeNull();
        expect(resolvePushPath({ link: '   ' })).toBeNull();
        expect(resolvePushPath(undefined)).toBeNull();
    });

    it('커스텀 스킴 link는 스킴을 벗기고 경로/쿼리만 취한다', () => {
        const path = resolvePushPath({
            link: 'chatic-dev://channel?channelId=room_123',
            payload: { cid: 'cloud_1' },
        });

        expect(path).toBe('/channel?channelId=room_123&cid=cloud_1');
    });

    it('link 쿼리에 이미 cid가 있으면 payload 값으로 덮어쓰지 않는다', () => {
        const path = resolvePushPath({
            link: '/channels/1/room?cid=explicit',
            payload: { cid: 'from_payload', sid: 'site_9' },
        });

        // Existing cid is preserved; only the missing sid is added.
        expect(path).toBe('/channels/1/room?cid=explicit&sid=site_9');
    });

    it('payload JSON이 깨졌으면 top-level cid/sid로 폴백한다', () => {
        const path = resolvePushPath({
            link: '/channels/1/room',
            payload: '{not valid json',
            cid: 'top_cloud',
            sid: 'top_site',
        });

        expect(path).toBe('/channels/1/room?cid=top_cloud&sid=top_site');
    });

    it('link가 없고 clickAction만 있으면 clickAction을 사용한다', () => {
        const path = resolvePushPath({
            clickAction: '/channels/1/room',
            payload: { cid: 'cloud_1' },
        });

        expect(path).toBe('/channels/1/room?cid=cloud_1');
    });
});
