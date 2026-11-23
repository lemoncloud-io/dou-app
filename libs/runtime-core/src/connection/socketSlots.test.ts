import { deriveSocketSlots, hasRelaySlot } from './socketSlots';
import { getCommittedCloudId, getSocketSlotContext } from '@chatic/session/store';

const mockReadyBackgroundConfigs = jest.fn((_deviceId: string): unknown[] => []);
jest.mock('./backgroundSlots', () => ({
    readyBackgroundConfigs: (deviceId: string) => mockReadyBackgroundConfigs(deviceId),
}));

jest.mock('@chatic/session/store', () => ({
    getCommittedCloudId: jest.fn(),
    getSocketSlotContext: jest.fn(),
}));

const RELAY = { wss: 'wss://relay.chatic.com', identityToken: 'relay-token', siteId: null, isAuthenticated: true };
const relayConfig = { url: 'wss://relay.chatic.com', deviceId: 'test-device-id', wssType: 'relay', cid: 'default' };

beforeEach(() => {
    (getCommittedCloudId as jest.Mock).mockReturnValue('my-cloud-id');
});

const DEVICE = 'test-device-id';

describe('deriveSocketSlots', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

        const result = { current: deriveSocketSlots(DEVICE) };

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
            background: [],
        });
    });

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
                cloudId: 'target-cloud',
                wss: 'wss://outgoing.chatic.com',
                identityToken: 'outgoing-token',
                isActive: true,
            },
            identity: { userId: 'user-123' },
        });

        const result = { current: deriveSocketSlots(DEVICE) };

        expect(result.current.cloud?.config).toMatchObject({
            url: 'wss://outgoing.chatic.com',
            cid: 'outgoing-cloud',
        });
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

        const result = { current: deriveSocketSlots(DEVICE) };

        expect(result.current).toEqual({
            relay: { config: relayConfig, identityToken: 'relay-token' },
            background: [],
        });
        expect(result.current.cloud).toBeUndefined();
    });

    it('an active cloud session with no committed cloud yields no cloud slot and leaves relay alone', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue(null);
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            relay: RELAY,
            cloud: {
                cloudId: 'my-cloud-id',
                wss: 'wss://cloud.chatic.com',
                identityToken: 'cloud-token',
                isActive: true,
            },
        });

        const result = { current: deriveSocketSlots(DEVICE) };

        expect(result.current).toEqual({
            relay: { config: relayConfig, identityToken: 'relay-token' },
            cloud: undefined,
            background: [],
        });
    });

    it('no relay token yet (pre-login): no slots at all (§6-3 identityToken gate)', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: 'wss://relay.chatic.com', identityToken: null },
            relay: { wss: 'wss://relay.chatic.com', identityToken: null, siteId: null, isAuthenticated: false },
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const result = { current: deriveSocketSlots(DEVICE) };

        expect(result.current.relay).toBeUndefined();
        expect(result.current.cloud).toBeUndefined();
    });

    it('no deviceId: no slots', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            activeServer: { kind: 'relay', siteId: null, wss: null, identityToken: null },
            relay: RELAY,
            cloud: { cloudId: null, wss: null, identityToken: null, isActive: false },
            identity: { userId: null },
        });

        const result = { current: deriveSocketSlots(null) };

        expect(result.current).toEqual({ background: [] });
    });

    it('optimistic cloud switch: the cloud SLOT waits for isActive even though the cid pre-applied', () => {
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

        const result = { current: deriveSocketSlots(DEVICE) };

        expect(result.current.relay).toBeDefined();
        expect(result.current.cloud).toBeUndefined();
    });

    describe('background slots', () => {
        const relayOnly = () =>
            (getSocketSlotContext as jest.Mock).mockReturnValue({
                relay: RELAY,
                cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            });

        it('carries a slot per ready background cloud, with no identityToken', () => {
            relayOnly();
            const config = { url: 'wss://a', deviceId: 'test-device-id', wssType: 'cloud', cid: 'cloud-a' };
            mockReadyBackgroundConfigs.mockReturnValue([config]);

            const result = { current: deriveSocketSlots(DEVICE) };

            expect(mockReadyBackgroundConfigs).toHaveBeenCalledWith('test-device-id');
            expect(result.current.background).toEqual([{ config }]);
        });

        it('has none without a relay session — every cloud token is minted from it', () => {
            (getSocketSlotContext as jest.Mock).mockReturnValue({
                relay: { ...RELAY, identityToken: null },
                cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
            });
            mockReadyBackgroundConfigs.mockReturnValue([{ config: {} }]);

            const result = { current: deriveSocketSlots(DEVICE) };

            expect(result.current.background).toEqual([]);
            expect(mockReadyBackgroundConfigs).not.toHaveBeenCalled();
        });
    });
});

describe('hasRelaySlot', () => {
    it('is true with a device id and a relay token', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({ relay: RELAY, cloud: { isActive: false } });

        expect(hasRelaySlot(DEVICE)).toBe(true);
    });

    it('is false before the relay has a token, or without a device id', () => {
        (getSocketSlotContext as jest.Mock).mockReturnValue({
            relay: { ...RELAY, identityToken: null },
            cloud: { isActive: false },
        });
        expect(hasRelaySlot(DEVICE)).toBe(false);

        (getSocketSlotContext as jest.Mock).mockReturnValue({ relay: RELAY, cloud: { isActive: false } });
        expect(hasRelaySlot(null)).toBe(false);
    });
});
