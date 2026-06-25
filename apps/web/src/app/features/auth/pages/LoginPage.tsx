import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    cloudCore,
    loginWithInviteCode,
    reportError,
    setIsInvitedSession,
    startWebCoreInit,
    toError,
    useDelegatorId,
    useWebCoreStore,
    webCore,
    withTimeout,
} from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { LoadingFallback } from '@chatic/shared';

import { isNative, logger } from '@chatic/bridges';

import type {
    CloudDelegationTokenView,
    MyInviteView,
    UserProfile$,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';

import { useRegisterDevice } from '@chatic/web-core';
import { useDynamicDeviceId } from '@chatic/app-runtime';
import { useInviteMutations } from '../../../hooks/useInviteMutations';
import { markInvitePlaceSyncPending, markNameSetupPending } from '../../../hooks/usePlaces';
import { fetchInviteCodeInfo } from '../../chats/apis/invite-api';

export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const { setIsAuthenticated, setProfile, logout } = useWebCoreStore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const [siteInfo, setSiteInfo] = useState<{ id: string; name: string } | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [inviteError, setInviteError] = useState(false);
    const [missingDelegator, setMissingDelegator] = useState(false);
    const [deviceRegError, setDeviceRegError] = useState(false);
    const loginCalled = useRef(false);
    const { mutateAsync: registerDevice, isPending: isRegisteringDevice } = useRegisterDevice();
    const { deviceId, isReady } = useDynamicDeviceId();
    const { saveInvite } = useInviteMutations();
    const profile = useWebCoreStore(state => state.profile);
    const selectedCloudId = cloudCore.getSelectedCloudId() ?? 'default';
    const delegatorId = useDelegatorId();
    const [inviteInfo, setInviteInfo] = useState<MyInviteView | null>(null);

    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const fetchInvite = useCallback(
        async (overrideDelegatorId?: string): Promise<UserTokenView | null> => {
            const code = urlParams.get('code');
            const backend = urlParams.get('_backend') ?? undefined;
            if (!code) return null;
            try {
                const effectiveDelegatorId = overrideDelegatorId ?? delegatorId;
                if (!effectiveDelegatorId) {
                    logger.error('AUTH', '[LoginPage] delegatorId not found');
                    setMissingDelegator(true);
                    return null;
                }
                return await loginWithInviteCode(code, effectiveDelegatorId, backend);
            } catch (error) {
                logger.error('AUTH', '[LoginPage] Fetch invite data failed', { error });
                reportError(toError(error));
                toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
                setInviteError(true);
                return null;
            }
        },
        [urlParams, toast, t, delegatorId]
    );
    const handleDeviceRegistration = useCallback(async () => {
        try {
            // 로그아웃 후 SPA 내비게이션 시 webCore가 미초기화 상태일 수 있음
            await startWebCoreInit();
            const { Token, ...rest } = await registerDevice(deviceId);
            if (!Token.identityToken) throw new Error('No identityToken in response');

            await webCore.buildCredentialsByToken(Token);
            setProfile(rest as Parameters<typeof setProfile>[0]);
            if (!cloudCore.getSelectedCloudId()) {
                cloudCore.saveSelectedCloudId('default');
            }
            // SPA 전환 — 풀 페이지 리로드 대신 URL만 변경 후 상태 업데이트.
            // webCore.init() 재실행 + JS 번들 재파싱을 피하여 ~2초 절약.
            window.history.replaceState(null, '', '/');
            setIsAuthenticated(true);
        } catch (error) {
            logger.error('AUTH', '[LoginPage] Device registration failed', { error });
            reportError(toError(error));
            toast({ title: t('auth.loginFailed'), variant: 'destructive' });
            setDeviceRegError(true);
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

            const backend = urlParams.get('_backend');
            const siteId = urlParams.get('_siteId');
            const siteName = urlParams.get('_siteName');

            // GET endpoint로 초대 정보 조회 시도
            if (backend && code) {
                fetchInviteCodeInfo(code, backend)
                    .then(info => {
                        setInviteInfo(info);
                        // GET 응답에서 사이트 정보 추출 (URL 파라미터 → 응답 필드 → fallback)
                        const name = info.cloudName ?? siteName ?? info.name ?? '';
                        const id = info.cloudId ?? siteId ?? info.id ?? code;
                        setSiteInfo({ id, name });
                    })
                    .catch(err => {
                        logger.warn('AUTH', '[LoginPage] GET invite-code failed, falling back to URL params', {
                            error: err,
                        });
                        // 폴백: URL 파라미터 또는 code 기반
                        setSiteInfo({ id: siteId ?? code, name: siteName ?? '' });
                    });
            } else {
                // backend 없어도 초대 수락 UI는 표시 — URL 파라미터 또는 code 기반
                setSiteInfo({ id: siteId ?? code, name: siteName ?? '' });
            }
        } else {
            handleDeviceRegistration();
        }
    }, [urlParams, isReady, handleDeviceRegistration, fetchInvite]);

    const handleAccept = async () => {
        if (isAccepting) return;

        const backend = urlParams.get('_backend');
        // WSS 주소 우선순위: GET 응답의 $envs.wss → URL 파라미터 _wss
        const wss = inviteInfo?.$envs?.wss ?? urlParams.get('_wss');
        if (!backend || !wss) {
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        const urlCloudId = inviteInfo?.cloudId ?? urlParams.get('_cloudId') ?? undefined;
        const urlCloudName = inviteInfo?.cloudName ?? urlParams.get('_cloudName') ?? undefined;

        setIsAccepting(true);
        logger.info('AUTH', '[handleAccept] starting invite accept', {
            data: { backend, wss, urlCloudId, urlCloudName },
        });

        try {
            // 1. 디바이스 등록 먼저 — delegatorId(profile.uid) 확보 필수
            let effectiveDelegatorId = delegatorId;
            const isAlreadyAuthenticated = useWebCoreStore.getState().isAuthenticated;
            logger.info('AUTH', '[handleAccept] device registration check', {
                data: { isAlreadyAuthenticated, hasDelegatorId: !!effectiveDelegatorId },
            });
            if (!isAlreadyAuthenticated || !effectiveDelegatorId) {
                await withTimeout(startWebCoreInit(), 10_000, 'startWebCoreInit');
                const { Token, ...rest } = await withTimeout(registerDevice(deviceId), 15_000, 'registerDevice');
                await withTimeout(webCore.buildCredentialsByToken(Token), 10_000, 'buildCredentialsByToken');
                setProfile(rest as unknown as UserProfile$);
                // registerDevice 응답은 UserView 기반 — uid가 아닌 id 필드에 사용자 ID가 있음
                // setProfile 후 store에서 delegatorId를 읽거나, 응답의 uid/id를 fallback으로 사용
                effectiveDelegatorId =
                    useWebCoreStore.getState().delegatorId ??
                    (rest as unknown as UserProfile$)?.uid ??
                    ((rest as Record<string, unknown>)?.id as string);
                logger.info('AUTH', '[handleAccept] device registered', {
                    data: { uid: effectiveDelegatorId },
                });
            }

            if (!effectiveDelegatorId) {
                logger.error('AUTH', '[handleAccept] delegatorId unavailable after device registration');
                setMissingDelegator(true);
                setIsAccepting(false);
                return;
            }

            // 2. invite 수락 — delegatorId를 직접 전달
            const data = await withTimeout(fetchInvite(effectiveDelegatorId), 15_000, 'fetchInvite');
            if (!data) {
                logger.warn('AUTH', '[handleAccept] fetchInvite returned null');
                setIsAccepting(false);
                return;
            }
            logger.info('AUTH', '[handleAccept] fetchInvite succeeded', {
                data: { cloudId: data.cloudId, hasToken: !!data.Token },
            });

            const identityToken = data.Token?.identityToken;
            if (!identityToken) throw new Error('No identityToken');

            // 3. Save delegation token
            cloudCore.saveDelegationToken({ backend, wss } as CloudDelegationTokenView);

            // 4. Save cloud token + selected cloud ID
            cloudCore.saveCloudToken(data as unknown as UserTokenView);
            // `data.cloudId` is the cloud's AWS account-no (SDK `UserTokenView.cloudId`); the
            // invite deeplink carries no real cloud id, so it's the only identifier we have for
            // this invited cloud and is used purely as its restore key (re-entry goes through
            // restoreInvitedCloud, never delegate-cloud). issueCloudDelegationToken guards the
            // delegate boundary so this account-no can never leak into a delegation 404.
            const effectiveCloudId = urlCloudId ?? data.cloudId;
            if (effectiveCloudId) {
                cloudCore.saveSelectedCloudId(effectiveCloudId);
            }
            logger.info('AUTH', '[handleAccept] cloud state saved', {
                data: { effectiveCloudId, hasDelegation: !!backend, hasCloudToken: !!data },
            });

            // 5. Save invite cloud to cache
            if (effectiveCloudId) {
                if (isNative()) {
                    await withTimeout(
                        saveInvite({
                            id: effectiveCloudId,
                            cid: selectedCloudId,
                            name: urlCloudName ?? data.name,
                            backend: backend ?? undefined,
                            wss: wss ?? undefined,
                        }),
                        10_000,
                        'saveInvite'
                    );
                }
            }

            // 6. Mark as invited + place 동기화 플래그 설정 (리로드 후 usePlaces에서 소비)
            setIsInvitedSession(true);
            markInvitePlaceSyncPending();
            markNameSetupPending();

            // 7. Reset selected place, then pre-select the invited place
            cloudCore.clearSelectedPlace();
            useWebSocketV2Store.getState().setSelectedPlaceId(null);
            const invitedSiteId = urlParams.get('_siteId');
            if (invitedSiteId) {
                cloudCore.saveSelectedSiteId(invitedSiteId);
                useWebSocketV2Store.getState().setSelectedPlaceId(invitedSiteId);
            }

            // Remember this invited cloud's full session so the cloud switcher can
            // re-enter it later — invited clouds aren't broker-delegable.
            if (effectiveCloudId) cloudCore.captureInvitedCloud(effectiveCloudId, urlCloudName ?? data.name);

            // 8. Authenticate — 풀 리로드로 홈 전환 (invite flow에서 SPA 전환이 불안정하여 리로드 사용)
            logger.info('AUTH', '[handleAccept] complete, navigating to home', {
                data: { effectiveCloudId, invitedSiteId, isInvited: true },
            });
            window.location.replace('/');
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', '[LoginPage] Accept invite failed', { error: err });
            reportError(err);
            if (err.message.startsWith('TIMEOUT:')) {
                toast({ title: t('inviteAccept.timeout'), variant: 'destructive' });
            } else if (err.message.includes('Network Error') || err.message.includes('ERR_NETWORK')) {
                toast({ title: t('inviteAccept.networkError'), variant: 'destructive' });
            } else {
                toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            }
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
                                window.location.replace('/');
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

    // Show missing delegatorId error with logout action
    if (isInviteLogin && missingDelegator) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f] whitespace-pre-line">
                            {t('inviteAccept.missingDelegator')}
                        </p>
                        <button
                            onClick={() => logout({ preserveUrl: true })}
                            className="w-full max-w-[200px] h-[42px] rounded-full bg-[#b0ea10] text-[14px] font-semibold text-[#222325]"
                        >
                            {t('auth.logout')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show invite accept UI
    if (isInviteLogin && siteInfo) {
        const inviterName = inviteInfo?.inviter$?.name;

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
                            {inviterName && (
                                <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.14px] text-[#84888f]">
                                    {inviterName}
                                </p>
                            )}
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
                                    window.location.replace('/');
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

    if (deviceRegError) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f]">{t('auth.loginFailed')}</p>
                        <button
                            onClick={() => {
                                setDeviceRegError(false);
                                loginCalled.current = false;
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
