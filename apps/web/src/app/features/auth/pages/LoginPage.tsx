import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, loginWithInviteCode, webCore, useWebCoreStore, setIsInvitedSession } from '@chatic/web-core';
import { LoadingFallback } from '@chatic/shared';

import type { CloudDelegationTokenView, UserProfile$, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { useRegisterDevice } from '@chatic/auth';

import type { LoginInviteResponse } from '@chatic/web-core';
import type { JSX } from 'react';
import { useDynamicDeviceId } from '../../../shared/hooks/useDynamicDeviceId';

export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const { setIsAuthenticated, setProfile } = useWebCoreStore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const [inviteData, setInviteData] = useState<LoginInviteResponse | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isFetchingInvite, setIsFetchingInvite] = useState(false);
    const [inviteError, setInviteError] = useState(false);
    const loginCalled = useRef(false);
    const { mutateAsync: registerDevice, isPending: isRegisteringDevice } = useRegisterDevice();
    const { deviceId, isReady } = useDynamicDeviceId();

    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const fetchInvite = useCallback(async () => {
        const code = urlParams.get('code');
        const backend = urlParams.get('_backend') ?? undefined;
        if (!code) return;

        setInviteError(false);
        setIsFetchingInvite(true);
        try {
            const data = await loginWithInviteCode(code, backend);
            setInviteData(data);
        } catch (error) {
            console.error('[LoginPage] Fetch invite data failed:', error);
            toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            setInviteError(true);
        } finally {
            setIsFetchingInvite(false);
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
            void fetchInvite();
        } else {
            handleDeviceRegistration();
        }
    }, [urlParams, isReady, handleDeviceRegistration, fetchInvite]);

    const handleAccept = async () => {
        if (!inviteData || isAccepting) return;

        const identityToken = inviteData.Token?.identityToken;
        if (!identityToken) {
            toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            return;
        }

        setIsAccepting(true);
        try {
            // 1. Register device → webCore 임시 중계서버 계정
            const { Token, ...rest } = await registerDevice(deviceId);
            await webCore.buildCredentialsByToken(Token);

            // 2. Save delegation token (backend, wss)
            const backend = urlParams.get('_backend');
            const wss = urlParams.get('_wss');
            if (backend && wss) {
                cloudCore.saveDelegationToken({ backend, wss } as CloudDelegationTokenView);
            }

            // 3. Save cloud token (inviteData)
            cloudCore.saveCloudToken(inviteData as unknown as UserTokenView);

            // 4. Mark as invited
            setIsInvitedSession(true);

            // 5. Reset selected place (cloud token changed)
            cloudCore.clearSelectedPlace();

            // 6. Set webCore profile & authenticate
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

    // Show loading while fetching invite data
    if (isInviteLogin && isFetchingInvite) {
        return <LoadingFallback message={t('auth.inviteLoading')} />;
    }

    // Show invite error with retry
    if (isInviteLogin && inviteError) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f]">{t('inviteAccept.failed')}</p>
                        <button
                            onClick={fetchInvite}
                            className="w-full max-w-[200px] h-[42px] rounded-full bg-[#b0ea10] text-[14px] font-semibold text-[#222325]"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show invite accept UI
    if (isInviteLogin && inviteData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full">
                        {/* Profile image */}
                        <div className="w-[82px] h-[82px] rounded-full border border-[#f4f5f5] bg-[rgba(0,43,126,0.04)] flex items-center justify-center overflow-hidden">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-200 to-green-400 flex items-center justify-center text-2xl font-semibold text-white">
                                {inviteData.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        </div>

                        {/* Invite message */}
                        <div className="flex flex-col items-center gap-2 px-[22px] py-2 mt-1 w-full">
                            <div className="text-center text-[18px] font-semibold leading-[1.5] text-[#081837]">
                                <p>{t('inviteAccept.title')}</p>
                            </div>
                            <p className="text-center text-[16px] font-medium leading-[1.45] tracking-[-0.16px] text-[#84888f]">
                                {t('inviteAccept.description')}
                            </p>
                        </div>

                        {/* Button */}
                        <div className="flex flex-col items-center w-full px-[22px] pt-5 pb-4">
                            <button
                                onClick={handleAccept}
                                disabled={isAccepting}
                                className="w-full h-[50px] rounded-full bg-[#b0ea10] text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#222325] disabled:opacity-50"
                            >
                                {isAccepting ? t('inviteAccept.accepting') : t('inviteAccept.accept')}
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
