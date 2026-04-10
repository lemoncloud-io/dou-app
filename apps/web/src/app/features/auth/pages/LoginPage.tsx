import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import type { LoginInviteResponse } from '@chatic/web-core';
import { cloudCore, loginWithInviteCode, setIsInvitedSession, useWebCoreStore, webCore } from '@chatic/web-core';
import { LoadingFallback } from '@chatic/shared';

import { getMobileAppInfo } from '@chatic/app-messages';

import type { CloudDelegationTokenView, UserProfile$, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { useRegisterDevice } from '@chatic/auth';
import { useDynamicDeviceId } from '../../../shared/hooks/useDynamicDeviceId';
import { useInviteMutations } from '@chatic/socket-data';

export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const { setIsAuthenticated, setProfile } = useWebCoreStore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const [siteInfo, setSiteInfo] = useState<{ id: string; name: string } | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [inviteError, setInviteError] = useState(false);
    const loginCalled = useRef(false);
    const { mutateAsync: registerDevice, isPending: isRegisteringDevice } = useRegisterDevice();
    const { deviceId, isReady } = useDynamicDeviceId();
    const { saveInvite } = useInviteMutations();

    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const fetchInvite = useCallback(async (): Promise<LoginInviteResponse | null> => {
        const code = urlParams.get('code');
        const backend = urlParams.get('_backend') ?? undefined;
        if (!code) return null;
        try {
            return await loginWithInviteCode(code, backend);
        } catch (error) {
            console.error('[LoginPage] Fetch invite data failed:', error);
            toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            setInviteError(true);
            return null;
        }
    }, [urlParams, toast, t]);
    const handleDeviceRegistration = useCallback(async () => {
        try {
            const { Token, ...rest } = await registerDevice(deviceId);
            if (!Token.identityToken) throw new Error('No identityToken in response');

            await webCore.buildCredentialsByToken(Token);
            setProfile(rest as Parameters<typeof setProfile>[0]);
            setIsAuthenticated(true);
            window.location.href = '/';
        } catch (error) {
            console.error('[LoginPage] Device registration failed:', error);
            toast({ title: t('auth.loginFailed'), variant: 'destructive' });
            // Navigate to home to prevent permanent stuck on "preparing app"
            window.location.href = '/';
        }
    }, [deviceId, registerDevice, setProfile, setIsAuthenticated, toast, t]);

    useEffect(() => {
        if (!isReady) return;
        if (loginCalled.current) return;
        loginCalled.current = true;

        const code = urlParams.get('code');
        const provider = urlParams.get('provider');

        if (code && provider === 'invite') {
            setIsInviteLogin(true);
            const siteId = urlParams.get('_siteId');
            const siteName = urlParams.get('_siteName');
            if (siteId && siteName) {
                setSiteInfo({ id: siteId, name: siteName });
            }
        } else {
            handleDeviceRegistration();
        }
    }, [urlParams, isReady, handleDeviceRegistration, fetchInvite]);

    const handleAccept = async () => {
        if (isAccepting) return;
        setIsAccepting(true);

        try {
            const data = await fetchInvite();
            if (!data) return;

            const identityToken = data.Token?.identityToken;
            if (!identityToken) throw new Error('No identityToken');

            // 1. Register device
            const { Token, ...rest } = await registerDevice(deviceId);
            await webCore.buildCredentialsByToken(Token);

            // 2. Save delegation token
            const backend = urlParams.get('_backend');
            const wss = urlParams.get('_wss');
            if (backend && wss) {
                cloudCore.saveDelegationToken({ backend, wss } as CloudDelegationTokenView);
            }

            // 3. Save cloud token
            cloudCore.saveCloudToken(data as unknown as UserTokenView);

            // 4. Save invite cloud to cache
            if (data.id) {
                const { isOnMobileApp } = getMobileAppInfo();
                if (isOnMobileApp) {
                    await saveInvite({
                        id: data.id,
                        name: data.name,
                        backend: backend ?? undefined,
                        wss: wss ?? undefined,
                    });
                }
            }

            // 5. Mark as invited
            setIsInvitedSession(true);

            // 6. Reset selected place
            cloudCore.clearSelectedPlace();

            // 7. Set profile & authenticate
            setProfile(rest as unknown as UserProfile$);
            setIsAuthenticated(true);
            toast({ title: t('auth.loginSuccess') });
            window.location.href = '/';
        } catch (error) {
            console.error('[LoginPage] Accept invite failed:', error);
            toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            setIsAccepting(false);
        }
    };

    // Show invite error with retry
    if (isInviteLogin && inviteError) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f]">
                            {t('inviteAccept.invalidLink')}
                        </p>
                        <button
                            onClick={() => {
                                window.location.href = '/auth/login';
                            }}
                            className="w-full max-w-[200px] h-[42px] rounded-full bg-[#b0ea10] text-[14px] font-semibold text-[#222325]"
                        >
                            {t('inviteAccept.goBack')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show invite accept UI
    if (isInviteLogin && siteInfo) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full">
                        <div className="w-[82px] h-[82px] rounded-full border border-[#f4f5f5] bg-[rgba(0,43,126,0.04)] flex items-center justify-center overflow-hidden">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-200 to-green-400 flex items-center justify-center text-2xl font-semibold text-white">
                                {siteInfo.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-2 px-[22px] py-2 mt-1 w-full">
                            <div className="text-center text-[18px] font-semibold leading-[1.5] text-[#081837]">
                                {siteInfo.name}
                            </div>
                            <p className="text-center text-[16px] font-medium leading-[1.45] tracking-[-0.16px] text-[#84888f]">
                                {t('inviteAccept.description')}
                            </p>
                        </div>

                        <div className="flex flex-col items-center w-full px-[22px] pt-5 pb-4 gap-3">
                            <button
                                onClick={handleAccept}
                                disabled={isAccepting}
                                className="w-full h-[50px] rounded-full bg-[#b0ea10] text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#222325] disabled:opacity-50"
                            >
                                {isAccepting ? t('inviteAccept.accepting') : t('inviteAccept.accept')}
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = '/auth/login';
                                }}
                                disabled={isAccepting}
                                className="w-full h-[50px] rounded-full  text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#84888f] disabled:opacity-50"
                            >
                                {t('inviteAccept.decline')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isRegisteringDevice) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-2">
                <LoadingFallback message={t('auth.deviceRegistering')} />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen gap-2">
            <LoadingFallback message={t('auth.appPreparing')} />
            <p className="text-xs text-gray-400">deviceId: {deviceId ?? 'null'}</p>
        </div>
    );
};
