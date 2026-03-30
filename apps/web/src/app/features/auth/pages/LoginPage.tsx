import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, loginWithInviteCode, webCore, useWebCoreStore, setIsInvitedSession } from '@chatic/web-core';
import { LoadingFallback } from '@chatic/shared';

import type { CloudDelegationTokenView, UserProfile$, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { useRegisterDevice } from '@chatic/auth';

import type { JSX } from 'react';
import { useDynamicDeviceId } from '../../../shared/hooks/useDynamicDeviceId';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';

export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const { setIsAuthenticated, setProfile } = useWebCoreStore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const loginCalled = useRef(false);
    const { mutateAsync: registerDevice, isPending: isRegisteringDevice } = useRegisterDevice();
    const { deviceId, isReady } = useDynamicDeviceId();

    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    // URL에서 초대 정보 파싱
    const inviterName = urlParams.get('_inviterName');
    const siteName = urlParams.get('_siteName');

    useEffect(() => {
        if (!isReady) return;
        if (loginCalled.current) return;
        loginCalled.current = true;

        const code = urlParams.get('code');
        const provider = urlParams.get('provider');

        if (code && provider === 'invite') {
            // 초대 정보만 보여주고, 수락 시 loginWithInviteCode 호출
            setIsInviteLogin(true);
        } else {
            const handleDeviceRegistration = async () => {
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
            };
            handleDeviceRegistration();
        }
    }, [urlParams, toast, deviceId, isReady, t, registerDevice, setProfile, setIsAuthenticated]);

    const handleAccept = async () => {
        if (isAccepting) return;

        const code = urlParams.get('code');
        if (!code) return;

        setIsAccepting(true);
        try {
            // 1. loginWithInviteCode → 서버에서 토큰 발급
            const data = await loginWithInviteCode(code, urlParams.get('_backend') ?? undefined);

            const identityToken = data.Token?.identityToken;
            if (!identityToken) {
                toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
                setIsAccepting(false);
                return;
            }

            // 2. Register device → webCore 임시 중계서버 계정
            const { Token, ...rest } = await registerDevice(deviceId);
            await webCore.buildCredentialsByToken(Token as unknown as LemonOAuthToken);

            // 3. Save delegation token (backend, wss)
            const backend = urlParams.get('_backend');
            const wss = urlParams.get('_wss');
            if (backend && wss) {
                cloudCore.saveDelegationToken({ backend, wss } as CloudDelegationTokenView);
            }

            // 4. Save cloud token (inviteData)
            cloudCore.saveCloudToken(data as unknown as UserTokenView);

            // 5. Mark as invited
            setIsInvitedSession(true);

            // 6. Reset selected place (cloud token changed)
            cloudCore.clearSelectedPlace();

            // 7. Set webCore profile & authenticate
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

    // Show invite accept UI (URL 파라미터 기반으로 먼저 보여줌)
    if (isInviteLogin) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full">
                        {/* Profile image */}
                        <div className="w-[82px] h-[82px] rounded-full border border-[#f4f5f5] bg-[rgba(0,43,126,0.04)] flex items-center justify-center overflow-hidden">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-200 to-green-400 flex items-center justify-center text-2xl font-semibold text-white">
                                {inviterName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        </div>

                        {/* Invite message */}
                        <div className="flex flex-col items-center gap-2 px-[22px] py-2 mt-1 w-full">
                            <div className="text-center text-[18px] font-semibold leading-[1.5] text-[#081837]">
                                <p>
                                    {inviterName
                                        ? t('inviteAccept.titleWithName', { name: inviterName })
                                        : t('inviteAccept.title')}
                                </p>
                            </div>
                            {siteName && (
                                <p className="text-center text-[16px] font-semibold leading-[1.45] text-[#081837]">
                                    {siteName}
                                </p>
                            )}
                            <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.16px] text-[#84888f]">
                                {t('inviteAccept.description')}
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex flex-col items-center gap-2 w-full px-[22px] pt-5 pb-4">
                            <button
                                onClick={handleAccept}
                                disabled={isAccepting}
                                className="w-full h-[50px] rounded-full bg-[#b0ea10] text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#222325] disabled:opacity-50"
                            >
                                {isAccepting ? t('inviteAccept.accepting') : t('inviteAccept.accept')}
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = '/';
                                }}
                                disabled={isAccepting}
                                className="w-full h-[50px] rounded-full text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#84888f] disabled:opacity-50"
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
