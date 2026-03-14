import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Home, RefreshCw, Users } from 'lucide-react';

import { getSocketSend, useWebSocketV2Store } from '@chatic/socket';
import { cn } from '@chatic/lib/utils';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import { useLoaderStore } from '@chatic/shared';
import type { MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { useMyPlaces } from '../hooks/useMyPlaces';

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
    const disabled = !isSelectable || isDisabled || isSelected || isDefaultPlace;
    const selected = isSelected || isDefaultPlace;
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
                        'absolute left-[3px] top-[3px] flex h-[41px] w-[41px] items-center justify-center rounded-full',
                        selected ? 'bg-[#102346]' : 'bg-muted'
                    )}
                >
                    {isDefaultPlace ? (
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

interface PlaceListProps {
    onPlaceSelected?: (placeId: string) => void;
}

export const PlaceList = ({ onPlaceSelected }: PlaceListProps) => {
    const { t } = useTranslation();
    const { isGuest } = useWebCoreStore();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());
    const [isPending, setIsPending] = useState(false);
    const { places, isLoading, isError, retry } = useMyPlaces();
    const setGlobalLoading = useLoaderStore(s => s.setIsLoading);

    const displayPlaces = isGuest ? [DEFAULT_PLACE] : places;

    useEffect(() => {
        const hasSelected = !!cloudCore.getSelectedPlaceId();
        if (isGuest || hasSelected || displayPlaces.length === 0) return;
        handleSelectPlace(displayPlaces[0].id);
    }, [displayPlaces]);

    const handleSelectPlace = async (placeId: string) => {
        const cloudToken = cloudCore.getCloudToken();
        const uid = cloudToken?.id;
        if (!uid) return;

        setIsPending(true);
        setGlobalLoading(true, t('globalLoader.switchingPlace'));
        try {
            const target = `${uid}@${placeId}`;
            const refreshed = await cloudCore.refreshToken(target);
            cloudCore.saveSelectedSiteId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token, ...cloudProfile } = refreshed;
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
            setGlobalLoading(false);
        }
    };

    if (!isGuest && isLoading) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-[5px]">
                        <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-muted" />
                        <div className="h-3 w-[50px] animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
        );
    }

    if (!isGuest && isError) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                <span>{t('placeList.errorLoading')}</span>
                <button onClick={retry} className="flex items-center gap-1 text-foreground">
                    <RefreshCw size={14} />
                    <span>{t('placeList.retry')}</span>
                </button>
            </div>
        );
    }

    if (!isGuest && displayPlaces.length === 0) {
        return <p className="px-4 py-2 text-sm text-muted-foreground">{t('placeList.empty')}</p>;
    }

    return (
        <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
            {displayPlaces.map(place => (
                <PlaceItem
                    key={place.id}
                    place={place}
                    isSelected={selectedId === place.id}
                    isDisabled={isPending}
                    onSelectPlace={handleSelectPlace}
                />
            ))}
        </div>
    );
};
