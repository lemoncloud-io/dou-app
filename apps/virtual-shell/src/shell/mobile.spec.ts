import { resolveDeepLink, resolvePushTapPath } from 'virtual-shell/mobile-deeplink';
import { getSyncInjectionScript } from 'virtual-shell/mobile-injection';

import { guardAppInjection } from '@chatic/fake-shell';

import { pushData } from './pushPresets';

/**
 * The mobile app's own functions, called through the same aliases the shell uses. Nothing else checks
 * them against the app: the types in `mobile.d.ts` are written by hand, so a change in what the app
 * returns for these inputs has to fail here.
 */
const relayRoom = { room: { channelId: '1000001', cid: '#', sid: '100002' }, json: '{}' };
const cloudRoom = { room: { channelId: '1000001', cid: 'cloud_1', sid: '100002' }, json: '{}' };
const token = (payload: object) => Buffer.from(JSON.stringify(payload)).toString('base64url');

describe('resolvePushTapPath through the alias', () => {
    it('sends a relay room message to its room, the relay marker and place in the query', () => {
        expect(resolvePushTapPath(pushData('room', relayRoom))).toBe('/channels/1000001/room?cid=%23&sid=100002');
    });

    it('sends a cloud room message to its room with the cloud in the query', () => {
        expect(resolvePushTapPath(pushData('room', cloudRoom))).toBe('/channels/1000001/room?cid=cloud_1&sid=100002');
    });

    it('sends a cloud activation, which has no link by contract, to the root', () => {
        expect(resolvePushTapPath(pushData('cloud-ready', relayRoom))).toBe('/');
    });

    it('goes nowhere for a room message without a link — the tap only brings the app forward', () => {
        expect(resolvePushTapPath({ type: 'chat', payload: { cid: '#', sid: '100002' } })).toBeNull();
    });
});

describe('resolveDeepLink through the alias', () => {
    it('expands a cloud invite (`api` + `stage`) into the web invite path', () => {
        const resolution = resolveDeepLink('https://app-dev.chatic.io/s?code=invt:1:abc&api=xyz&stage=dev');

        expect(resolution).toEqual({
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
        const url = `https://app.chatic.io/i?t=${token({ c: 'invt:2:def', r: 1 })}`;

        expect(resolveDeepLink(url)).toEqual({
            kind: 'web',
            path: `/?code=${encodeURIComponent('invt:2:def')}&provider=invite&version=2&relay=1`,
        });
    });

    it('resolves a bare path under the scheme of the backend the shell runs against', () => {
        expect(resolveDeepLink('/channels/1000001/room')).toEqual({ kind: 'web', path: '/channels/1000001/room' });
    });

    it('refuses the retired short link (`/s/<code>`)', () => {
        expect(resolveDeepLink('https://app.chatic.io/s/abc123')).toMatchObject({ kind: 'invalid' });
    });

    it('refuses a link from a host the app does not own', () => {
        expect(resolveDeepLink('https://example.com/channels/1')).toMatchObject({ kind: 'invalid' });
    });

    it('routes a `target=native` link to a native screen', () => {
        expect(resolveDeepLink('chatic-dev://debug/Home?target=native')).toMatchObject({ kind: 'native' });
    });
});

describe('getSyncInjectionScript through the alias', () => {
    it('builds a script that sets every global the shell passes, with nothing left undefined', () => {
        const build = guardAppInjection({ getSyncInjectionScript });
        const script = build({
            insets: { top: 59, bottom: 34, left: 0, right: 0 },
            keyboardHeight: 0,
            theme: 'light',
            configBag: { 'ui.onboardingCompleted': 'true' },
            deviceInfo: {
                runId: 'r',
                platform: 'ios',
                applicationName: 'DoU Virtual Shell',
                stage: 'stage',
                consoleEnabled: false,
                uniqueId: 'u',
                deviceModel: 'iPhone17,1',
                osVersion: '26.0',
                appVersion: '0.28.1',
                buildNumber: '1',
                appLanguage: 'en',
                installationId: 'i',
                uniqueDeviceId: 'i',
                firebaseInstallationId: '',
                latestVersion: '0.28.1',
                shouldUpdate: false,
            },
        });

        expect(script).toContain('window.CHATIC_APP_STAGE = "stage";');
        expect(script).toContain('window.CHATIC_APP_CONFIG_BAG = {"ui.onboardingCompleted":"true"};');
        expect(script).toContain("root.style.setProperty('--safe-top', '59px');");
    });
});
