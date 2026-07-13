import { renderHook } from '@testing-library/react';
import { useRuntimeBinding } from './useRuntimeBinding';
import { useGlobalSession, useDynamicDeviceId } from '@chatic/web-core';

jest.mock('@chatic/web-core', () => ({
    useGlobalSession: jest.fn(),
    useDynamicDeviceId: jest.fn(),
}));

const RELAY = { wss: 'wss://relay.chatic.com', identityToken: 'relay-token', siteId: null, isAuthenticated: true };
const relayConfig = { url: 'wss://relay.chatic.com', deviceId: 'test-device-id', wssType: 'relay', cid: 'default' };

describe('useRuntimeBinding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: 'test-device-id' });
    });

    it('cloud active: relay + cloud slots both present (relay is always-on)', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'cloud',
                siteId: 'my-site-id',
                wss: 'wss://cloud.chatic.com',
                identityToken: 'cloud-token',
            },
            relay: RELAY,
            cloud: {
                cloudId: 'my-cloud-id',
                wss: 'wss://cloud.chatic.com',
                identityToken: 'cloud-token',
                isActive: true,
            },
            identity: { userId: 'user-123' },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.context).toEqual({ cid: 'my-cloud-id', sid: 'my-site-id', uid: 'user-123' });
        expect(result.current.socket).toEqual({
            relay: { config: relayConfig, identityToken: 'relay-token' },
            cloud: {
                config: {
                    url: 'wss://cloud.chatic.com',
                    deviceId: 'test-device-id',
                    wssType: 'cloud',
                    cid: 'my-cloud-id',
                },
                identityToken: 'cloud-token',
            },
        });
    });

    it('relay only (no cloud active): relay slot present, cloud slot absent', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: 'relay-site-id',
                wss: 'wss://relay.chatic.com',
                identityToken: 'relay-token',
            },
            relay: RELAY,
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            identity: { userId: 'user-456' },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.context).toEqual({ cid: 'default', sid: 'relay-site-id', uid: 'user-456' });
        expect(result.current.socket).toEqual({ relay: { config: relayConfig, identityToken: 'relay-token' } });
        expect(result.current.socket.cloud).toBeUndefined();
    });

    it('no relay token yet (pre-login): no slots at all (§6-3 identityToken gate)', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: 'wss://relay.chatic.com', identityToken: null },
            relay: { wss: 'wss://relay.chatic.com', identityToken: null, siteId: null, isAuthenticated: false },
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.socket.relay).toBeUndefined();
        expect(result.current.socket.cloud).toBeUndefined();
    });

    it('no deviceId: no slots', () => {
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: null });
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: null, identityToken: null },
            relay: RELAY,
            cloud: { cloudId: null, wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.socket).toEqual({});
    });

    it('optimistic cloud switch: cid follows the selected cloud, but the cloud SLOT waits for isActive', () => {
        // The cid was pre-applied to the target cloud, but its tokens have not committed
        // (cloud.isActive === false), so the cloud socket must NOT boot yet — only relay is present.
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: 'relay-site-id',
                wss: 'wss://relay.chatic.com',
                identityToken: 'relay-token',
            },
            relay: RELAY,
            cloud: { cloudId: 'target-cloud', wss: null, identityToken: null, isActive: false },
            identity: { userId: 'user-789' },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        // cid pre-applies to the selected cloud so cid-scoped cache streams re-subscribe…
        expect(result.current.context.cid).toBe('target-cloud');
        // …while the cloud socket stays absent (relay-only) until the target's tokens commit.
        expect(result.current.socket.relay).toBeDefined();
        expect(result.current.socket.cloud).toBeUndefined();
    });
});
