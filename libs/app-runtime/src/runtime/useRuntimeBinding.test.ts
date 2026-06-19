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
            scope: {
                cid: 'my-cloud-id',
                sid: 'my-site-id',
                uid: 'user-123',
            },
        });
    });

    it('relay active일 때 cid=default 및 siteId가 올바르게 파생되어야 한다', () => {
        (useGlobalSession as jest.Mock).mockReturnValue({
            activeServer: {
                kind: 'relay',
                siteId: 'relay-site-id',
                wss: 'wss://relay.chatic.com',
            },
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
            scope: {
                cid: 'default',
                sid: 'relay-site-id',
                uid: 'user-456',
            },
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
            identity: {
                activeProfile: null,
            },
        });

        const { result } = renderHook(() => useRuntimeBinding());

        expect(result.current.socket).toBeNull();
    });
});
