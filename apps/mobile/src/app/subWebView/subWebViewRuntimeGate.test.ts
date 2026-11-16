import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { cloudOfSession, grantedSubWebViewRuntime, type SubWebViewRuntimeGateInput } from './subWebViewRuntimeGate';

const permissions = new Set<SubWebViewRuntimePermission>(['channel', 'chat']);
const open: SubWebViewRuntimeGateInput = { owner: 'native', trust: 'reviewed', permissions, openedCloudId: 'c1' };

describe('grantedSubWebViewRuntime', () => {
    it("grants the manifest's runtime permissions when every condition holds", () => {
        expect(grantedSubWebViewRuntime(open)).toEqual(permissions);
    });

    it.each<[string, Partial<SubWebViewRuntimeGateInput>]>([
        ['the page holds the session', { owner: 'web' }],
        ['the owner is not settled yet', { owner: undefined }],
        ['an external site', { trust: 'external' }],
        ['the hub', { trust: 'firstParty' }],
        ['no cloud, or Home, at open', { openedCloudId: null }],
        ['a manifest with none', { permissions: new Set() }],
    ])('grants nothing when %s', (_, change) => {
        expect(grantedSubWebViewRuntime({ ...open, ...change }).size).toBe(0);
    });
});

describe('cloudOfSession', () => {
    const on = (cloudId: string | null) => ({ context: { cloud: { cloudId } } });

    it('reads the selected cloud, and none for Home or no selection', () => {
        expect(cloudOfSession(on('c1'))).toBe('c1');
        expect(cloudOfSession(on('default'))).toBeNull();
        expect(cloudOfSession(on(null))).toBeNull();
        expect(cloudOfSession(on(''))).toBeNull();
    });
});
