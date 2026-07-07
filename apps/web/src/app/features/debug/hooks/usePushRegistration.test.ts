import { act, renderHook, waitFor } from '@testing-library/react';

jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useRegisterDeviceTokenMutation: jest.fn(), useDynamicDeviceId: jest.fn() }));
jest.mock('@chatic/device-utils', () => ({ useDeviceInfo: jest.fn() }));
jest.mock('../../../bridge', () => ({ appBridge: { fetchFcmToken: jest.fn() } }));

import { isNative } from '@chatic/bridges';
import { useDynamicDeviceId, useRegisterDeviceTokenMutation } from '@chatic/web-core';
import { useDeviceInfo } from '@chatic/device-utils';

import { appBridge } from '../../../bridge';
import { usePushRegistration } from './usePushRegistration';

const mockIsNative = isNative as jest.Mock;
const mockUseMutation = useRegisterDeviceTokenMutation as jest.Mock;
const mockUseDynamicDeviceId = useDynamicDeviceId as jest.Mock;
const mockUseDeviceInfo = useDeviceInfo as jest.Mock;
const mockFetchFcmToken = appBridge.fetchFcmToken as jest.Mock;

const mockMutateAsync = jest.fn();

describe('usePushRegistration — 푸시 서버 등록 확인', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseMutation.mockReturnValue({ mutateAsync: mockMutateAsync });
        mockUseDynamicDeviceId.mockReturnValue({
            deviceId: 'dyn-device-1',
            firebaseInstallationId: 'fid-dyn',
            isReady: true,
        });
        mockUseDeviceInfo.mockReturnValue({ deviceInfo: { platform: 'ios' } });
    });

    it('네이티브 셸이 아니면 토큰을 가져오지 않고 no-native로 끝난다', async () => {
        mockIsNative.mockReturnValue(false);

        const { result } = renderHook(() => usePushRegistration());
        await act(async () => {
            await result.current.check();
        });

        expect(mockFetchFcmToken).not.toHaveBeenCalled();
        expect(result.current.state).toBe('no-native');
        expect(result.current.error).toBeTruthy();
    });

    it('토큰이 없으면 no-token 상태가 된다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchFcmToken.mockResolvedValue({ data: { token: '' } });

        const { result } = renderHook(() => usePushRegistration());
        await act(async () => {
            await result.current.check();
        });

        expect(mockMutateAsync).not.toHaveBeenCalled();
        expect(result.current.state).toBe('no-token');
    });

    it('토큰이 있으면 register-device를 호출하고 서버 결과를 요약한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
        mockMutateAsync.mockResolvedValue({
            deviceId: 'dev-1',
            endpoint: 'arn:endpoint',
            status: 'active',
            updatedAt: 1700000000000,
        });

        const { result } = renderHook(() => usePushRegistration());
        await act(async () => {
            await result.current.check();
        });

        expect(mockMutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                deviceToken: 'tok-123',
                // Must be the shared useDynamicDeviceId values, not a local derivation.
                deviceId: 'dyn-device-1',
                platform: 'ios',
                installId: 'fid-dyn',
                application: 'chatic',
                force: true,
            })
        );
        await waitFor(() => expect(result.current.state).toBe('done'));
        expect(result.current.token).toBe('tok-123');
        expect(result.current.summary).toMatchObject({ registered: true, status: 'active', endpoint: 'arn:endpoint' });
    });

    it('firebase id를 해석할 수 없으면 installId 없이 등록한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
        mockMutateAsync.mockResolvedValue({ deviceId: 'dyn-device-1', endpoint: 'arn:endpoint', status: 'active' });
        mockUseDynamicDeviceId.mockReturnValue({
            deviceId: 'dyn-device-1',
            firebaseInstallationId: undefined,
            isReady: true,
        });

        const { result } = renderHook(() => usePushRegistration());
        await act(async () => {
            await result.current.check();
        });

        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ installId: undefined }));
    });

    it('등록 호출이 실패하면 error 상태가 된다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
        mockMutateAsync.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => usePushRegistration());
        await act(async () => {
            await result.current.check();
        });

        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('boom');
    });
});
