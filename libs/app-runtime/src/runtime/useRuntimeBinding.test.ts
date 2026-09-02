import { renderHook } from '@testing-library/react';
import { useRuntimeBinding } from './useRuntimeBinding';
import { useGlobalSession, useDynamicDeviceId, getCommittedCloudId } from '../session';

jest.mock('../session', () => ({
    useGlobalSession: jest.fn(),
    useDynamicDeviceId: jest.fn(),
    // COMMITTED cloud id — distinct from the SELECTED `cloud.cloudId` in the session snapshot.
    getCommittedCloudId: jest.fn(),
}));

const RELAY = { wss: 'wss://relay.chatic.com', identityToken: 'relay-token', siteId: null, isAuthenticated: true };
const relayConfig = { url: 'wss://relay.chatic.com', deviceId: 'test-device-id', wssType: 'relay', cid: 'default' };

beforeEach(() => {
    (getCommittedCloudId as jest.Mock).mockReturnValue('my-cloud-id');
});

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
        // relay carries identityToken (SocketReauthBinder watches it for a same-connection
        // guest→social swap); the cloud slot does NOT — a cloud change reboots the socket (wss URL
        // differs → SocketBinder rebuilds), so no in-place cloud re-auth key is needed.
        expect(result.current.socket).toEqual({
            relay: { config: relayConfig, identityToken: 'relay-token' },
            cloud: {
                config: {
                    url: 'wss://cloud.chatic.com',
                    deviceId: 'test-device-id',
                    wssType: 'cloud',
                    cid: 'my-cloud-id',
                },
            },
        });
    });

    // 전환 낙관 창: 선택 cid는 target으로 이미 뒤집혔지만 delegation/cloud 토큰은 아직 옛 클라우드다.
    // 예전에는 슬롯 config가 target cid + 옛 wss/identityToken을 함께 실어 서로 다른 두 클라우드를
    // 가리켰다 (ADR-0070 결정 7의 intent vs committed).
    it('전환 낙관 창에서 cloud 슬롯 cid는 선택값이 아니라 커밋된 클라우드를 따른다', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue('outgoing-cloud');
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'cloud',
                siteId: 'my-site-id',
                wss: 'wss://outgoing.chatic.com',
                identityToken: 'outgoing-token',
            },
            relay: RELAY,
            cloud: {
                // 선택값은 이미 target
                cloudId: 'target-cloud',
                // 그러나 wss/identityToken은 아직 나가는 클라우드의 것 (delegation 토큰이 안 바뀜)
                wss: 'wss://outgoing.chatic.com',
                identityToken: 'outgoing-token',
                isActive: true,
            },
            identity: { userId: 'user-123' },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        // 슬롯은 나가는 클라우드로 일관된다 — url과 cid가 같은 클라우드를 가리킨다
        expect(result.current.socket.cloud?.config).toMatchObject({
            url: 'wss://outgoing.chatic.com',
            cid: 'outgoing-cloud',
        });
        // 캐시 스코프(intent)는 반대로 target을 먼저 따라간다 — 두 뷰는 갈라져야 한다
        expect(result.current.context.cid).toBe('target-cloud');
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
