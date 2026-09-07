import { renderHook } from '@testing-library/react';
import { useRuntimeSocketSlots } from './useRuntimeSocketSlots';
import { useDynamicDeviceId } from '../session';
import { getCommittedCloudId, getSocketSlotContext, sessionSignal } from '../session/store';

jest.mock('../session', () => ({
    useDynamicDeviceId: jest.fn(),
}));
// Both are runtime-internal and off the session barrel (ADR-0074 결정 6), so the mock is at the
// concrete module. `getSocketSlotContext` is the NARROW snapshot this hook reads — it carries relay
// and cloud only, matching the three signals it subscribes to (ADR-0074 E5). The committed cloud id
// is distinct from the SELECTED `cloud.cloudId` in that snapshot.
jest.mock('../session/store', () => ({
    getCommittedCloudId: jest.fn(),
    getSocketSlotContext: jest.fn(),
    sessionSignal: { subscribe: jest.fn(() => () => undefined) },
}));

const RELAY = { wss: 'wss://relay.chatic.com', identityToken: 'relay-token', siteId: null, isAuthenticated: true };
const relayConfig = { url: 'wss://relay.chatic.com', deviceId: 'test-device-id', wssType: 'relay', cid: 'default' };

beforeEach(() => {
    (getCommittedCloudId as jest.Mock).mockReturnValue('my-cloud-id');
});

describe('useRuntimeSocketSlots', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: 'test-device-id' });
    });

    it('cloud active: relay + cloud slots both present (relay is always-on)', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
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

        const { result } = renderHook(() => useRuntimeSocketSlots());

        // The cache scope is no longer this hook's output — `deriveSelectedContext` owns that formula
        // and `selectedContext.test.ts` pins it (ADR-0074 G5).
        // relay carries identityToken (SocketReauthBinder watches it for a same-connection
        // guest→social swap); the cloud slot does NOT — a cloud change reboots the socket (wss URL
        // differs → SocketBinder rebuilds), so no in-place cloud re-auth key is needed.
        expect(result.current).toEqual({
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
    // 가리켰다 (ADR-0070 결정 7의 selected vs committed).
    it('전환 낙관 창에서 cloud 슬롯 cid는 선택값이 아니라 커밋된 클라우드를 따른다', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue('outgoing-cloud');
        (getSocketSlotContext as jest.Mock).mockReturnValue({
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

        const { result } = renderHook(() => useRuntimeSocketSlots());

        // 슬롯은 나가는 클라우드로 일관된다 — url과 cid가 같은 클라우드를 가리킨다
        expect(result.current.cloud?.config).toMatchObject({
            url: 'wss://outgoing.chatic.com',
            cid: 'outgoing-cloud',
        });
        // 갈라지는 반대쪽(캐시 스코프 = selected = 'target-cloud')은 `deriveSelectedContext` 소유이고
        // `selectedContext.test.ts` 가 고정한다. 여기서는 슬롯이 커밋값을 따르는 것만 본다.
    });

    it('relay only (no cloud active): relay slot present, cloud slot absent', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
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

        const { result } = renderHook(() => useRuntimeSocketSlots());

        expect(result.current).toEqual({ relay: { config: relayConfig, identityToken: 'relay-token' } });
        expect(result.current.cloud).toBeUndefined();
    });

    it('no relay token yet (pre-login): no slots at all (§6-3 identityToken gate)', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: 'wss://relay.chatic.com', identityToken: null },
            relay: { wss: 'wss://relay.chatic.com', identityToken: null, siteId: null, isAuthenticated: false },
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const { result } = renderHook(() => useRuntimeSocketSlots());

        expect(result.current.relay).toBeUndefined();
        expect(result.current.cloud).toBeUndefined();
    });

    it('no deviceId: no slots', () => {
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: null });
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: null, identityToken: null },
            relay: RELAY,
            cloud: { cloudId: null, wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const { result } = renderHook(() => useRuntimeSocketSlots());

        expect(result.current).toEqual({});
    });

    it('optimistic cloud switch: the cloud SLOT waits for isActive even though the cid pre-applied', () => {
        // The cid was pre-applied to the target cloud, but its tokens have not committed
        // (cloud.isActive === false), so the cloud socket must NOT boot yet — only relay is present.
        (getSocketSlotContext as jest.Mock).mockReturnValue({
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

        const { result } = renderHook(() => useRuntimeSocketSlots());

        // The cid pre-applies to the selected cloud (covered by `selectedContext.test.ts`) while the
        // cloud SOCKET stays absent (relay-only) until the target's tokens commit.
        expect(result.current.relay).toBeDefined();
        expect(result.current.cloud).toBeUndefined();
    });

    // ADR-0074 E5. `identity` is deliberately absent: none of the inputs above move on it, and boot
    // alone emits it twice (`setSessionIdentityState`) with every login adding one. Subscribing to it
    // meant a re-render plus a fresh-but-equal slots object handed to both binders each time. The
    // pairing that keeps this safe is the NARROW snapshot (`getSocketSlotContext`, relay+cloud only):
    // a future reader that needs identity cannot reach it without widening this list too.
    it('세션 시그널 중 슬롯이 실제로 읽는 세 종류만 구독한다 (identity 제외)', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            relay: RELAY,
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
        });

        renderHook(() => useRuntimeSocketSlots());

        expect(sessionSignal.subscribe).toHaveBeenCalledWith(
            ['relay:token', 'cloud:token', 'selection'],
            expect.any(Function)
        );
    });
});
