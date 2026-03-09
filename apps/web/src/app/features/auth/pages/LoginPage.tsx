import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { loginWithInviteCode, simpleWebCore, useSimpleWebCore } from '@chatic/web-core';
import { LoadingFallback } from '@chatic/shared';

import { useRegisterDevice } from '@chatic/auth';

import type { JSX } from 'react';
import { useDynamicDeviceId } from '../../../shared/hooks/useDynamicDeviceId';

const decodeJWT = (token: string) => {
    try {
        if (!token || token.split('.').length !== 3) return null;
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
};

export const LoginPage = (): JSX.Element => {
    const location = useLocation();
    const { setIsAuthenticated, setProfile } = useSimpleWebCore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const loginCalled = useRef(false);
    const { mutateAsync: registerDevice, isPending: isRegisteringDevice } = useRegisterDevice();
    const { deviceId, isReady } = useDynamicDeviceId();
    useEffect(() => {
        if (!isReady) return;
        if (loginCalled.current) return;
        loginCalled.current = true;

        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const provider = params.get('provider');

        if (code && provider === 'invite') {
            setIsInviteLogin(true);

            const handleInviteLogin = async () => {
                try {
                    const {
                        Token: { identityToken },
                        ...rest
                    } = await loginWithInviteCode(code);

                    if (!identityToken) throw new Error('No identityToken in response');

                    setProfile({ ...rest });
                    simpleWebCore.saveToken(identityToken);
                    setIsAuthenticated(true);
                } catch (error) {
                    console.error('[LoginPage] Invite login failed:', error);
                    toast({ title: '초대 로그인 실패', variant: 'destructive' });
                    setIsInviteLogin(false);
                }
            };

            void handleInviteLogin();
        } else {
            const handleDeviceRegistration = async () => {
                try {
                    const {
                        Token: { identityToken },
                        ...rest
                    } = await registerDevice(deviceId);
                    if (!identityToken) throw new Error('No identityToken in response');
                    setProfile({ ...rest });

                    simpleWebCore.saveToken(identityToken);
                    setIsAuthenticated(true);
                } catch (error) {
                    console.error('[LoginPage] Invite login failed:', error);
                    toast({ title: '로그인 실패', variant: 'destructive' });
                }
            };
            handleDeviceRegistration();
        }
    }, [location.search, toast, deviceId, isReady]);

    if (isInviteLogin) {
        return <LoadingFallback message="초대 로그인 중..." />;
    }

    if (isRegisteringDevice) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-2">
                <LoadingFallback message="디바이스 등록 중..." />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen gap-2">
            <LoadingFallback message="앱 준비중..." />
            <p className="text-xs text-gray-400">deviceId: {deviceId ?? 'null'}</p>
        </div>
    );
};
