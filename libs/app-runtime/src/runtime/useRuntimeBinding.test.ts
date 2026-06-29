import { renderHook } from '@testing-library/react';
import { useRuntimeBinding } from './useRuntimeBinding';
import { useGlobalSession, useDynamicDeviceId } from '@chatic/web-core';

jest.mock('@chatic/web-core', () => ({
    useGlobalSession: jest.fn(),
    useDynamicDeviceId: jest.fn(),
}));

describe('useRuntimeBinding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: 'test-device-id' });
    });

    it('cloud active일 때 cloudId와 siteId가 올바르게 파생되어야 한다', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'cloud',
                cloudId: 'my-cloud-id',
                siteId: 'my-site-id',
                wss: 'wss://cloud.chatic.com',
            },
            cloud: { cloudId: 'my-cloud-id' },
            identity: {
                activeProfile: { uid: 'user-123' },
            },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.context).toEqual({
            cid: 'my-cloud-id',
            sid: 'my-site-id',
            uid: 'user-123',
        });
        expect(result.current.socket).toEqual({
            config: {
                url: 'wss://cloud.chatic.com',
                deviceId: 'test-device-id',
                wssType: 'cloud',
            },
        });
        expect(result.current.auth).toEqual({
            kind: 'cloud',
            siteId: 'my-site-id',
            identityToken: undefined,
        });
    });

    it('relay active일 때 cid=default 및 siteId가 올바르게 파생되어야 한다', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: 'relay-site-id',
                wss: 'wss://relay.chatic.com',
            },
            cloud: { cloudId: 'default' },
            identity: {
                activeProfile: { uid: 'user-456' },
            },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.context).toEqual({
            cid: 'default',
            sid: 'relay-site-id',
            uid: 'user-456',
        });
        expect(result.current.socket).toEqual({
            config: {
                url: 'wss://relay.chatic.com',
                deviceId: 'test-device-id',
                wssType: 'relay',
            },
        });
        expect(result.current.auth).toEqual({
            kind: 'relay',
            siteId: 'relay-site-id',
            identityToken: undefined,
        });
    });

    it('deviceId가 없거나 endpoint가 없으면 socket이 null이어야 한다', () => {
        (useDynamicDeviceId as jest.Mock).mockReturnValue({ deviceId: null });
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: null,
                wss: null,
            },
            cloud: { cloudId: null },
            identity: {
                activeProfile: null,
            },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.socket).toBeNull();
        expect(result.current.auth).toEqual({
            kind: 'relay',
            siteId: undefined,
            identityToken: undefined,
        });
    });

    it('cid가 선택된 클라우드를 따른다 — 토큰 커밋 전에도(optimistic 전환)', () => {
        // Cloud switch pre-applied the cid, but the session is still authed to relay
        // (activeServer.kind === 'relay') because the new cloud's tokens have not committed.
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: 'relay-site-id',
                wss: 'wss://relay.chatic.com',
            },
            cloud: { cloudId: 'target-cloud' },
            identity: {
                activeProfile: { uid: 'user-789' },
            },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        // cid pre-applies to the selected cloud so cid-scoped cache streams re-subscribe…
        expect(result.current.context.cid).toBe('target-cloud');
        // …while socket/auth stay on relay until the new tokens commit.
        expect(result.current.auth?.kind).toBe('relay');
        expect(result.current.socket?.config.wssType).toBe('relay');
    });
});
