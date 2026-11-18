import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import {
    cloudOfSession,
    grantedSubWebViewRuntime,
    placeOfSession,
    type SubWebViewRuntimeGateInput,
} from './subWebViewRuntimeGate';

const permissions = new Set<SubWebViewRuntimePermission>(['channel', 'chat']);
const open: SubWebViewRuntimeGateInput = {
    owner: 'native',
    trust: 'reviewed',
    permissions,
    openedCloudId: 'c1',
    reportsFrameOrigin: true,
};

describe('grantedSubWebViewRuntime', () => {
    it("grants the manifest's runtime permissions when every condition holds", () => {
        expect(grantedSubWebViewRuntime(open)).toEqual(permissions);
    });

    it.each<[string, Partial<SubWebViewRuntimeGateInput>]>([
        ['the page holds the session', { owner: 'web' }],
        ['the owner is not settled yet', { owner: undefined }],
        ['an external site', { trust: 'external' }],
        ['the hub', { trust: 'firstParty' }],
        ['no cloud at open', { openedCloudId: null }],
        ['a manifest with none', { permissions: new Set() }],
        ['the WebView reports every frame as the top-level page', { reportsFrameOrigin: false }],
    ])('grants nothing when %s', (_, change) => {
        expect(grantedSubWebViewRuntime({ ...open, ...change }).size).toBe(0);
    });
});

// Home as the session reports it on a device: no cloud selected, the relay serving, Home's place the
// relay's selection, and no committed place (that is a cloud's).
const onHome = (siteId: string | null = '0000', isAuthenticated = true) => ({
    context: {
        cloud: { cloudId: null },
        relay: { isAuthenticated, siteId },
        activeServer: { kind: 'relay' as const, siteId },
    },
    committedSiteId: null,
});
const onCloud = (cloudId: string, committedSiteId: string | null) => ({
    context: {
        cloud: { cloudId },
        relay: { isAuthenticated: true, siteId: '0000' },
        activeServer: { kind: 'cloud' as const, siteId: committedSiteId },
    },
    committedSiteId,
});

describe('cloudOfSession', () => {
    it('reads the selected cloud, and Home as `default` when the relay serves', () => {
        expect(cloudOfSession(onCloud('c1', 's1'))).toBe('c1');
        expect(cloudOfSession(onHome())).toBe('default');
    });

    it('reads no cloud without a selection or a relay session', () => {
        expect(cloudOfSession({ context: { cloud: { cloudId: null } } })).toBeNull();
        expect(cloudOfSession(onHome('0000', false))).toBeNull();
    });
});

describe('placeOfSession', () => {
    it("reads a cloud's committed place, and none while it is still switching", () => {
        expect(placeOfSession(onCloud('c1', 's1'))).toBe('s1');
        expect(placeOfSession(onCloud('c1', null))).toBeNull();
    });

    it("reads Home's place from the relay, where no committed place is ever set", () => {
        expect(placeOfSession(onHome('0000'))).toBe('0000');
        expect(placeOfSession(onHome(null))).toBeNull();
        expect(placeOfSession(onHome('0000', false))).toBeNull();
    });
});
