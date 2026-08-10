import { resolvePushNavigation } from './resolvePushNavigation';

describe('resolvePushNavigation', () => {
    it('passes a canonical channel-room path through unchanged', () => {
        expect(resolvePushNavigation('/channels/1000001/room')).toEqual({
            target: '/channels/1000001/room',
            cid: null,
            sid: null,
            chatId: null,
        });
    });

    it('extracts cid/sid from the query and strips them from the target', () => {
        expect(resolvePushNavigation('/channels/1000001/room?cid=cloud_1&sid=site_9')).toEqual({
            target: '/channels/1000001/room',
            cid: 'cloud_1',
            sid: 'site_9',
            chatId: null,
        });
    });

    it('normalizes the spec fallback `channel?channelId=` to the canonical room route', () => {
        expect(resolvePushNavigation('channel?channelId=1000001')).toEqual({
            target: '/channels/1000001/room',
            cid: null,
            sid: null,
            chatId: null,
        });
    });

    it('normalizes the fallback with a leading slash and carries cid/sid', () => {
        expect(resolvePushNavigation('/channel?channelId=1000001&cid=cloud_1&sid=site_9')).toEqual({
            target: '/channels/1000001/room',
            cid: 'cloud_1',
            sid: 'site_9',
            chatId: null,
        });
    });

    it('preserves non-cid/sid query params on passthrough paths', () => {
        expect(resolvePushNavigation('/auth/login?code=xyz&cid=cloud_1')).toEqual({
            target: '/auth/login?code=xyz',
            cid: 'cloud_1',
            sid: null,
            chatId: null,
        });
    });

    it('passes an unrelated path through untouched', () => {
        expect(resolvePushNavigation('/mypage/account')).toEqual({
            target: '/mypage/account',
            cid: null,
            sid: null,
            chatId: null,
        });
    });

    it('preserves the hash fragment', () => {
        expect(resolvePushNavigation('/channels/1000001/room?cid=cloud_1#top')).toEqual({
            target: '/channels/1000001/room#top',
            cid: 'cloud_1',
            sid: null,
            chatId: null,
        });
    });

    it('falls back to the root route for empty input', () => {
        expect(resolvePushNavigation('')).toEqual({ target: '/', cid: null, sid: null, chatId: null });
        expect(resolvePushNavigation('   ')).toEqual({ target: '/', cid: null, sid: null, chatId: null });
    });

    // The room URL must stay canonical: `navigateNormalized` compares pathname+search to decide
    // "already there", so leaving chatId on the target would make two taps on one room differ.
    it('extracts chatId and strips it from the target', () => {
        expect(resolvePushNavigation('/channels/1000001/room?chatId=1000001%3A42')).toEqual({
            target: '/channels/1000001/room',
            cid: null,
            sid: null,
            chatId: '1000001:42',
        });
    });

    // The fallback branch rebuilds the target from channelId alone, so the context params have to
    // be read before it — otherwise a spec-style link would silently lose the thread hint.
    it('carries chatId through the `channel?channelId=` fallback branch', () => {
        expect(resolvePushNavigation('channel?channelId=1000001&chatId=1000001%3A42&cid=cloud_1')).toEqual({
            target: '/channels/1000001/room',
            cid: 'cloud_1',
            sid: null,
            chatId: '1000001:42',
        });
    });
});
