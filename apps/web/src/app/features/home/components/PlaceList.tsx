import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Home, RefreshCw, Users } from 'lucide-react';

import { logger } from '@chatic/app-messages';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cn } from '@chatic/lib/utils';
import { cloudCore, useWebCoreStore, useUserContext, UserType } from '@chatic/web-core';
import type { MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { waitForDeviceRegistered, waitForVerified } from '../../../shared/utils/waitForVerified';

const setStoreSelectedPlaceId = (placeId: string | null) => useWebSocketV2Store.getState().setSelectedPlaceId(placeId);

// Module-level: 현재 WS 세션에서 place auth(refreshToken + auth:update)가 완료되었는지 추적
// home → chatroom → home 재진입 시 불필요한 auth:update를 방지하여 stuck loading 예방
let placeAuthDone = false;

/** 외부(pipeline)에서 placeAuthDone 상태를 설정할 수 있도록 export */
export const setPlaceAuthDone = (value: boolean) => {
    placeAuthDone = value;
};

const DEFAULT_PLACE: MySiteView = { id: 'default', name: 'defaultPlace', stereo: 'work' } as MySiteView;

interface PlaceItemProps {
    place: MySiteView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
    unreadCount?: number;
}

const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace, unreadCount }: PlaceItemProps) => {
    const { t } = useTranslation();
    // const isSelectable = place.stereo === 'work';
    const isDefaultPlace = place.id === 'default';
    const disabled = isDisabled || isSelected;
    const selected = isSelected;
    const displayName = isDefaultPlace ? t('placeList.defaultPlace') : place.name;

    return (
        <button
            onClick={() => !disabled && onSelectPlace(place.id)}
            disabled={disabled}
            className={cn('flex flex-col items-center gap-[5px]', disabled && 'cursor-not-allowed')}
        >
            <div className="relative h-[47px] w-[47px]">
                <div
                    className={cn(
                        'absolute left-[3px] top-[3px] flex h-[41px] w-[41px] items-center justify-center overflow-hidden rounded-full',
                        selected ? 'bg-[#102346]' : 'bg-muted'
                    )}
                >
                    {place.thumbnail ? (
                        <img src={place.thumbnail} alt={displayName} className="h-full w-full object-cover" />
                    ) : isDefaultPlace ? (
                        <Home size={20} className={selected ? 'text-white' : 'text-muted-foreground'} />
                    ) : (
                        <Users size={20} className={selected ? 'text-white' : 'text-muted-foreground'} />
                    )}
                </div>
                {selected && <div className="absolute inset-0 rounded-full border-[1.5px] border-[#C139E3]" />}
                {!!unreadCount && unreadCount > 0 && (
                    <div className="absolute right-[3px] top-[3px] z-10 h-[10px] w-[10px] rounded-full bg-red-500" />
                )}
            </div>
            <div className="flex items-center justify-center gap-[2px]">
                <span
                    className={cn(
                        'max-w-[70px] truncate text-center text-[14px] tracking-[-0.018em]',
                        selected ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'
                    )}
                >
                    {displayName}
                </span>
                {selected && <Check size={14} className="flex-shrink-0 text-[#90C304]" />}
            </div>
        </button>
    );
};

interface PlaceListProps {
    places: MySiteView[];
    isLoading: boolean;
    isError: boolean;
    onRefreshPlaces: () => void;
    onPlaceSelected?: (placeId: string) => void;
    onNavigateToOrder?: () => void;
    onCreatePlace?: () => void;
    isGuest?: boolean;
    placeUnreadCounts?: Record<string, number>;
}

export const PlaceList = ({
    places: rawPlaces,
    isLoading,
    isError,
    onRefreshPlaces: refresh,
    onPlaceSelected,
    onNavigateToOrder,
    onCreatePlace,
    isGuest,
    placeUnreadCounts,
}: PlaceListProps) => {
    const { t } = useTranslation();
    const { userType } = useUserContext();
    const isInvited = userType === UserType.INVITED || userType === UserType.INVITED_WITH_CLOUD;
    const { emit } = useWebSocketV2();
    const wssType = useWebSocketV2Store(s => s.wssType);
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const selectedId = useWebSocketV2Store(s => s.selectedPlaceId);
    const [isPending, setIsPending] = useState(false);
    const switchingRef = useRef(false);

    const selectedCloudId = cloudCore.getSelectedCloudId();
    const isDefaultMode = selectedCloudId === 'default';

    // 저장된 순서 적용
    const places = (() => {
        if (!selectedCloudId || isDefaultMode) return rawPlaces;
        const savedOrder = cloudCore.getPlaceOrder(selectedCloudId);
        if (!savedOrder) return rawPlaces;
        const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
        return [...rawPlaces].sort((a, b) => {
            const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            return ai - bi;
        });
    })();

    const handleSelectPlace = async (placeId: string) => {
        if (switchingRef.current) return;

        // relay 모드: refreshToken 불필요, 단순 선택만
        // localStorage도 갱신하여 contextHolder·GlobalChatSync 등이 stale sid를 읽지 않도록 함
        // NOTE: wssType === null (초기화 전)인 경우 cloud path로 폴백 —
        //       초대 직후 페이지 리로드 시 WebSocket connect가 setTimeout(0)으로 지연되어
        //       wssType이 아직 null인 상태에서 이 함수가 호출될 수 있음
        const currentWssType = useWebSocketV2Store.getState().wssType;
        if (currentWssType === 'relay') {
            cloudCore.saveSelectedSiteId(placeId);
            setStoreSelectedPlaceId(placeId);
            onPlaceSelected?.(placeId);
            return;
        }

        const cloudToken = cloudCore.getCloudToken();
        const uid = cloudToken?.id;
        if (!uid) {
            // cloud token 없음 → 단순 선택 fallback
            cloudCore.saveSelectedSiteId(placeId);
            setStoreSelectedPlaceId(placeId);
            onPlaceSelected?.(placeId);
            return;
        }

        switchingRef.current = true;
        setIsPending(true);
        try {
            const target = `${uid}@${placeId}`;
            const refreshed = await cloudCore.refreshToken(target);
            cloudCore.saveSelectedSiteId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _token, ...cloudProfile } = refreshed;
            useWebCoreStore.getState().setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);

            // 1. device.save 완료 대기 — auth.update는 반드시 device.save 이후에 전송해야 함
            await waitForDeviceRegistered(10_000);

            // 2. 미인증 상태로 전환
            useWebSocketV2Store.getState().setIsVerified(false);

            // 3. place 전용 토큰으로 auth:update 직접 전송
            // useCloudTokenRefresh effect 재실행에 의존하지 않음
            // (isVerified가 이미 false였을 경우 Zustand가 변경을 감지하지 않아 effect가 재실행되지 않는 문제 방지)
            const identityToken = cloudCore.getIdentityToken();
            if (identityToken) {
                emit({ type: 'auth', action: 'update', payload: { token: identityToken } });
            }

            // 3. auth:update 응답 대기 — isVerified가 true가 될 때까지
            await waitForVerified(5000);

            placeAuthDone = true;
            setStoreSelectedPlaceId(placeId);
            onPlaceSelected?.(placeId);
        } catch (e) {
            logger.error('PLACE', 'Failed to select place', { error: e, data: { placeId } });
        } finally {
            switchingRef.current = false;
            setIsPending(false);
        }
    };

    // 이전 세션에서 선택된 place 복원
    const initialPlaceNotifiedRef = useRef(false);
    useEffect(() => {
        if (initialPlaceNotifiedRef.current) return;

        // default 모드 / guest → 항상 'default' place 사용, localStorage의 stale placeId 무시
        // localStorage도 갱신하여 contextHolder·GlobalChatSync 등이 stale sid를 읽지 않도록 함
        if (isDefaultMode || userType === UserType.TEMP_ACCOUNT) {
            initialPlaceNotifiedRef.current = true;
            cloudCore.saveSelectedSiteId('default');
            setStoreSelectedPlaceId('default');
            onPlaceSelected?.('default');
            return;
        }

        // store에 없으면 cloudCore(영속 스토리지)에서 복원 — WebSocketV2Connection이
        // 더 이상 premature하게 store에 placeId를 설정하지 않으므로 여기서 직접 읽음
        const savedPlaceId = useWebSocketV2Store.getState().selectedPlaceId || cloudCore.getSelectedPlaceId();
        if (savedPlaceId) {
            initialPlaceNotifiedRef.current = true;
            // 이미 인증 완료 + 현재 세션에서 place auth가 된 상태면 auth:update 스킵
            // (home → chatroom → home 재진입 시 불필요한 setIsVerified(false) 방지)
            if (useWebSocketV2Store.getState().isVerified && placeAuthDone) {
                onPlaceSelected?.(savedPlaceId);
            } else {
                void handleSelectPlace(savedPlaceId);
            }
        }
    }, [isDefaultMode, userType]);

    // cloud 전환 시 이전 place 선택 초기화
    const prevCloudIdRef = useRef(cloudId);
    useEffect(() => {
        if (prevCloudIdRef.current && prevCloudIdRef.current !== cloudId) {
            placeAuthDone = false;
            setStoreSelectedPlaceId(null);
            initialPlaceNotifiedRef.current = false;
            // 저장된 placeId 클리어 — store를 읽는 다른 hook이
            // 이전 cloud의 placeId로 chat:mine을 보내는 것을 방지
            cloudCore.saveSelectedSiteId('');

            // 클라우드 해제(default 모드) 전환 시 즉시 default place 선택
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (currentCloudId === 'default') {
                initialPlaceNotifiedRef.current = true;
                cloudCore.saveSelectedSiteId('default');
                setStoreSelectedPlaceId('default');
                onPlaceSelected?.('default');
            } else {
                onPlaceSelected?.('');
            }
        }
        prevCloudIdRef.current = cloudId;
    }, [cloudId]);

    // place 목록 로드 후 auto-selection (cloud 모드 전용)
    useEffect(() => {
        if (isDefaultMode) return;
        if (places.length === 0) return;
        const currentPlaceId = useWebSocketV2Store.getState().selectedPlaceId;
        // Pipeline(useCloudSwitchFlow)이 이미 place를 선택한 경우 — store에서 확인
        // (authPlace가 store 업데이트 완료 후 effect가 실행되면 hasSelected=true로
        //  조기 return하여 selectedId가 null로 남는 경합 방지)
        if (currentPlaceId && places.some(p => p.id === currentPlaceId)) {
            return;
        }
        // 저장된 place가 없거나 목록에 없으면 첫 번째 place 자동 선택
        void handleSelectPlace(places[0].id);
    }, [places, isDefaultMode]);

    // 순수 게스트, cloud 미선택(default), 또는 cloud가 아예 선택되지 않은 상태는 DEFAULT_PLACE만 표시
    if (userType === UserType.TEMP_ACCOUNT || isDefaultMode || (!selectedCloudId && !isInvited)) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                <PlaceItem place={DEFAULT_PLACE} isSelected isDisabled onSelectPlace={_id => _id} />
            </div>
        );
    }

    // cloud 모드에서 cloud 선택 대기 중 (isInvited는 cloud 선택 없이도 place 목록 표시)
    if (wssType === 'cloud' && !selectedCloudId && !isInvited) {
        return (
            <div className="flex flex-col items-center gap-2 py-10">
                <p className="text-sm text-muted-foreground">{t('placeList.selectCloud')}</p>
            </div>
        );
    }

    const header = (
        <div className="mb-[18px] flex items-center justify-between px-4">
            <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">
                {t('homePage.places')}
            </span>
            {!isGuest && !isLoading && onNavigateToOrder && (
                <button onClick={onNavigateToOrder} className="flex items-center rounded-[8px] text-muted-foreground">
                    <span className="text-[14px] font-medium leading-[1.19] tracking-[-0.01em]">
                        {t('placeList.settings')}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M6 12L10 8L6 4"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            )}
        </div>
    );

    if (isLoading) {
        return (
            <div>
                {header}
                <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-[5px]">
                            <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-muted" />
                            <div className="h-3 w-[50px] animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div>
                {header}
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                    <span>{t('placeList.errorLoading')}</span>
                    <button onClick={() => refresh()} className="flex items-center gap-1 text-foreground">
                        <RefreshCw size={14} />
                        <span>{t('placeList.retry')}</span>
                    </button>
                </div>
            </div>
        );
    }

    if (places.length === 0) {
        return (
            <div>
                {header}
                <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                    {!isGuest && onCreatePlace && (
                        <button
                            onClick={onCreatePlace}
                            className="flex flex-col items-center gap-[5px] text-muted-foreground"
                        >
                            <div className="relative h-[47px] w-[47px]">
                                <svg
                                    className="absolute left-[3px] top-[3px]"
                                    width="41"
                                    height="41"
                                    viewBox="0 0 41 41"
                                    fill="none"
                                >
                                    <circle
                                        cx="20.5"
                                        cy="20.5"
                                        r="19.75"
                                        className="fill-background stroke-border"
                                        strokeWidth="1.5"
                                    />
                                    <path
                                        d="M20.5 14V27M14 20.5H27"
                                        stroke="currentColor"
                                        strokeWidth="1.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                            <span className="max-w-[70px] truncate text-center text-[14px] font-normal leading-[1.19] tracking-[-0.018em]">
                                {t('placeList.addPlace')}
                            </span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            {header}

            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                {places.map(place => (
                    <PlaceItem
                        key={place.id}
                        place={place}
                        isSelected={selectedId === place.id}
                        isDisabled={isPending}
                        onSelectPlace={handleSelectPlace}
                        unreadCount={placeUnreadCounts?.[place.id]}
                    />
                ))}
                {!isGuest && onCreatePlace && (
                    <button
                        onClick={onCreatePlace}
                        className="flex flex-col items-center gap-[5px] text-muted-foreground"
                    >
                        <div className="relative h-[47px] w-[47px]">
                            <svg
                                className="absolute left-[3px] top-[3px]"
                                width="41"
                                height="41"
                                viewBox="0 0 41 41"
                                fill="none"
                            >
                                <circle
                                    cx="20.5"
                                    cy="20.5"
                                    r="19.75"
                                    className="fill-background stroke-border"
                                    strokeWidth="1.5"
                                />
                                <path
                                    d="M20.5 14V27M14 20.5H27"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                        <span className="max-w-[70px] truncate text-center text-[14px] font-normal leading-[1.19] tracking-[-0.018em]">
                            {t('placeList.addPlace')}
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
};
