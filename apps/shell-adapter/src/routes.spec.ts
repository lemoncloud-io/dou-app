import { resolveDeepLink, resolvePushTapPath } from 'shell-adapter/mobile-deeplink';

import { deepLinkNavigation, mobileRoutes, pushTapNavigation } from './routes';

/**
 * The mobile app's own functions, called through the same alias the shell page uses. Nothing else
 * checks them against the app: the types in `mobile.d.ts` are written by hand, so a change in what the
 * app returns for these inputs has to fail here.
 */
const token = (payload: object) => Buffer.from(JSON.stringify(payload)).toString('base64url');

beforeAll(() => {
    mobileRoutes.pushTapPath = resolvePushTapPath;
    mobileRoutes.deepLink = resolveDeepLink;
});

describe('resolvePushTapPath through the alias', () => {
    it('sends a relay room message to its room, the relay marker and place in the query', () => {
        const data = {
            type: 'chat',
            link: '/channels/1000001/room',
            payload: { cid: '#', sid: '100002', channelId: '1000001' },
        };
        expect(resolvePushTapPath(data)).toBe('/channels/1000001/room?cid=%23&sid=100002');
    });

    it('reads a payload delivered as a JSON string, as FCM delivers it', () => {
        const data = {
            type: 'chat',
            link: '/channels/1000001/room',
            payload: '{"cid":"cloud_1","sid":"100002","channelId":"1000001"}',
        };
        expect(resolvePushTapPath(data)).toBe('/channels/1000001/room?cid=cloud_1&sid=100002');
    });

    it('sends a cloud activation, which has no link by contract, to the root', () => {
        expect(resolvePushTapPath({ type: 'cloud' })).toBe('/');
    });

    it('goes nowhere for a room message without a link — the tap only brings the app forward', () => {
        expect(resolvePushTapPath({ type: 'chat', payload: { cid: '#', sid: '100002' } })).toBeNull();
    });
});

describe('resolveDeepLink through the alias', () => {
    it('expands a cloud invite (`api` + `stage`) into the web invite path', () => {
        expect(resolveDeepLink('https://app-dev.chatic.io/s?code=invt:1:abc&api=xyz&stage=dev')).toEqual({
            kind: 'web',
            path: `/?code=${encodeURIComponent('invt:1:abc')}&provider=invite&version=2&_backend=${encodeURIComponent(
                'https://xyz.execute-api.ap-northeast-2.amazonaws.com/dev'
            )}`,
        });
    });

    it('marks a relay invite', () => {
        expect(resolveDeepLink('https://app-dev.chatic.io/s?code=invt:1:abc&relay')).toEqual({
            kind: 'web',
            path: `/?code=${encodeURIComponent('invt:1:abc')}&provider=invite&version=2&relay=1`,
        });
    });

    it('opens an encoded invite (`/i?t=…`)', () => {
        expect(resolveDeepLink(`https://app.chatic.io/i?t=${token({ c: 'invt:2:def', r: 1 })}`)).toEqual({
            kind: 'web',
            path: `/?code=${encodeURIComponent('invt:2:def')}&provider=invite&version=2&relay=1`,
        });
    });

    it('resolves a bare path under the scheme of the backend the shell runs against', () => {
        expect(resolveDeepLink('/channels/1000001/room')).toEqual({ kind: 'web', path: '/channels/1000001/room' });
    });

    it('refuses a link from a host the app does not own', () => {
        expect(resolveDeepLink('https://example.com/channels/1')).toMatchObject({ kind: 'invalid' });
    });

    it('routes a `target=native` link to a native screen', () => {
        expect(resolveDeepLink('chatic-dev://debug/Home?target=native')).toMatchObject({ kind: 'native' });
    });
});

describe('the event maps the config sends', () => {
    it('navigates a push tap to where the app routes it, and sends nothing when it routes nowhere', () => {
        expect(
            pushTapNavigation({ type: 'chat', link: '/channels/1000001/room', payload: '{"cid":"#","sid":"1"}' })
        ).toEqual({
            path: '/channels/1000001/room?cid=%23&sid=1',
            replace: false,
        });
        expect(pushTapNavigation({ type: 'chat' })).toBeUndefined();
    });

    it('navigates a web link, and fails one the app opens natively or rejects with the reason', () => {
        expect(deepLinkNavigation(' /mypage ')).toEqual({ path: '/mypage', replace: false });
        expect(() => deepLinkNavigation('chatic-dev://debug/Home?target=native')).toThrow(/^NATIVE_ROUTE:/);
        expect(() => deepLinkNavigation('https://example.com/channels/1')).toThrow(/^UNRESOLVED:/);
    });
});
