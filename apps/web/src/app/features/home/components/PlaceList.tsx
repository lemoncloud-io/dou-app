import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, ChevronDown, Home, RefreshCw, SlidersHorizontal, Users } from 'lucide-react';

import { getSocketSend, useWebSocketV2Store } from '@chatic/socket';
import { cn } from '@chatic/lib/utils';
import { cloudCore, useWebCoreStore, useUserContext, UserType } from '@chatic/web-core';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import type { MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { usePlaces } from '@chatic/socket-data';

const DEFAULT_PLACE: MySiteView = { id: 'default', name: 'defaultPlace', stereo: 'work' } as MySiteView;

interface PlaceItemProps {
    place: MySiteView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
}

const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace }: PlaceItemProps) => {
    const { t } = useTranslation();
    const isSelectable = place.stereo === 'work';
    const isDefaultPlace = place.id === 'default';
    const disabled = !isSelectable || isDisabled || isSelected;
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

type PlaceFilter = 'all' | 'mine' | 'invited';

interface PlaceListProps {
    onPlaceSelected?: (placeId: string) => void;
    onNavigateToOrder?: () => void;
    onCreatePlace?: () => void;
    isGuest?: boolean;
    isPlacesLoading?: boolean;
}

export const PlaceList = ({
    onPlaceSelected,
    onNavigateToOrder,
    onCreatePlace,
    isGuest,
    isPlacesLoading,
}: PlaceListProps) => {
    const { t } = useTranslation();
    const { userType } = useUserContext();
    const isInvited = userType === UserType.INVITED || userType === UserType.INVITED_WITH_CLOUD;
    const wssType = useWebSocketV2Store(s => s.wssType);
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());
    const [isPending, setIsPending] = useState(false);
    const [filter, setFilter] = useState<PlaceFilter>('all');
    const { places, isLoading, isError, refresh } = usePlaces();

    const profileId = cloudCore.getCloudToken()?.id;
    const selectedCloudId = cloudCore.getSelectedCloudId();
    const isDefaultMode = selectedCloudId === 'default';

    const filteredPlaces = (() => {
        if (filter === 'mine') return places.filter(p => p.ownerId === profileId);
        if (filter === 'invited') return places.filter(p => p.ownerId !== profileId);
        return places;
    })();

    const handleSelectPlace = async (placeId: string) => {
        if (placeId === 'default') {
            return handleSelectDefaultPlace();
        }

        // relay 모드: refreshToken 불필요, 단순 선택만
        const currentWssType = useWebSocketV2Store.getState().wssType;
        if (currentWssType !== 'cloud') {
            setSelectedId(placeId);
            onPlaceSelected?.(placeId);
            return;
        }

        const cloudToken = cloudCore.getCloudToken();
        const uid = cloudToken?.id;
        if (!uid) return;

        setIsPending(true);
        try {
            const target = `${uid}@${placeId}`;
            const refreshed = await cloudCore.refreshToken(target);
            cloudCore.saveSelectedSiteId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _token, ...cloudProfile } = refreshed;
            useWebCoreStore.getState().setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);

            useWebSocketV2Store.getState().setIsVerified(false);
            const newToken = cloudCore.getIdentityToken();
            if (newToken) {
                getSocketSend()?.({ type: 'auth', action: 'update', payload: { token: newToken } });
            }

            setSelectedId(placeId);
            onPlaceSelected?.(placeId);
        } catch (e) {
            console.error('Failed to select place:', e);
        } finally {
            setIsPending(false);
        }
    };

    const handleSelectDefaultPlace = async () => {
        setIsPending(true);
        try {
            cloudCore.clearDelegationToken();
            useWebSocketV2Store.getState().setIsVerified(false);
            setSelectedId('default');
        } catch (e) {
            console.error('Failed to switch to default place:', e);
        } finally {
            setIsPending(false);
        }
    };

    // 이전 세션에서 선택된 place가 있거나, default 모드일 때 초기 placeId 전달
    const initialPlaceNotifiedRef = useRef(false);
    useEffect(() => {
        if (initialPlaceNotifiedRef.current) return;
        const savedPlaceId = cloudCore.getSelectedPlaceId();
        if (savedPlaceId) {
            initialPlaceNotifiedRef.current = true;
            onPlaceSelected?.(savedPlaceId);
        } else if (isDefaultMode || userType === UserType.TEMP_ACCOUNT) {
            initialPlaceNotifiedRef.current = true;
            onPlaceSelected?.('default');
        }
    }, [isDefaultMode, userType]);

    // place 목록 로드 후 auto-selection
    useEffect(() => {
        const hasSelected = !!cloudCore.getSelectedPlaceId();
        if (hasSelected || filteredPlaces.length === 0) return;
        handleSelectPlace(filteredPlaces[0].id);
    }, [filteredPlaces]);

    // 순수 게스트 또는 cloud 미선택(default) 상태는 DEFAULT_PLACE만 표시
    if (userType === UserType.TEMP_ACCOUNT || isDefaultMode) {
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

    const filterLabels: Record<PlaceFilter, string> = {
        all: t('placeList.filterAll'),
        mine: t('placeList.filterMine'),
        invited: t('placeList.filterInvited'),
    };

    const header = (
        <div className="mb-[18px] flex items-center justify-between px-4">
            <div className="flex items-center gap-[6px]">
                <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">
                    {t('homePage.places')}
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                'flex items-center gap-[4px] rounded-[6px] border px-[8px] py-[3px] transition-colors',
                                filter === 'all'
                                    ? 'border-border text-muted-foreground'
                                    : 'border-[#C139E3] bg-[#C139E3]/10 text-[#C139E3]'
                            )}
                        >
                            <SlidersHorizontal size={13} />
                            <span className="text-[12px] font-medium">{filterLabels[filter]}</span>
                            <ChevronDown size={11} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[160px]">
                        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                            {t('placeList.filterSection')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(['all', 'mine', 'invited'] as PlaceFilter[]).map(f => (
                            <DropdownMenuItem
                                key={f}
                                onClick={() => setFilter(f)}
                                className="flex items-center justify-between"
                            >
                                <span
                                    className={cn(
                                        filter === f ? 'font-semibold text-foreground' : 'text-muted-foreground'
                                    )}
                                >
                                    {filterLabels[f]}
                                </span>
                                {filter === f && <Check size={14} className="text-[#C139E3]" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {!isGuest && !isPlacesLoading && onNavigateToOrder && (
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

    if (filteredPlaces.length === 0) {
        return (
            <div>
                {header}
                <div className="flex items-center gap-[14px] px-4 py-2">
                    <p className="text-sm text-muted-foreground">{t('placeList.empty')}</p>
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
                {wssType === 'cloud' && (
                    <PlaceItem
                        place={DEFAULT_PLACE}
                        isSelected={selectedId === 'default'}
                        isDisabled={isPending}
                        onSelectPlace={handleSelectPlace}
                    />
                )}
                {filteredPlaces.map(place => (
                    <PlaceItem
                        key={place.id}
                        place={place}
                        isSelected={selectedId === place.id}
                        isDisabled={isPending}
                        onSelectPlace={handleSelectPlace}
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
