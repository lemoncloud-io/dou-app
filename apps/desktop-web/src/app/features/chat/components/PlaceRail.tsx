import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { DomainSite } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { useWebCoreStore } from '@chatic/web-core';
import { Avatar, AvatarFallback } from '@chatic/ui-kit/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

interface PlaceRailProps {
    places: DomainSite[];
    selectedPlaceId: string | null;
    onSelectPlace: (placeId: string) => void;
    onCreateChannel: () => void;
}

const placeInitial = (place: DomainSite): string => (place.name ?? place.id).charAt(0).toUpperCase() || '#';

export const PlaceRail = ({ places, selectedPlaceId, onSelectPlace, onCreateChannel }: PlaceRailProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);

    const userName = profile?.$user?.name ?? '';
    const userInitial = userName.charAt(0).toUpperCase() || '?';

    return (
        <div className="flex h-full w-full flex-col items-center">
            <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
                {places.length === 0 && (
                    <span className="px-1 text-center text-[10px] text-zinc-500">{t('rail.noPlaces')}</span>
                )}
                {places.map(place => {
                    const isActive = place.id === selectedPlaceId;
                    return (
                        <button
                            key={place.id}
                            onClick={() => onSelectPlace(place.id)}
                            title={place.name ?? place.id}
                            className={cn(
                                'flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold transition-all',
                                isActive
                                    ? 'rounded-xl bg-primary text-primary-foreground'
                                    : 'bg-zinc-700 text-zinc-200 hover:rounded-xl hover:bg-zinc-600'
                            )}
                        >
                            {placeInitial(place)}
                        </button>
                    );
                })}

                <button
                    onClick={onCreateChannel}
                    title={t('rail.addChannel')}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-700 text-xl font-light text-emerald-400 transition-all hover:rounded-xl hover:bg-zinc-600"
                >
                    +
                </button>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger className="mt-2 outline-none">
                    <Avatar className="h-10 w-10 border border-zinc-700">
                        <AvatarFallback className="bg-zinc-700 text-sm font-semibold text-zinc-100">
                            {userInitial}
                        </AvatarFallback>
                    </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
                    <DropdownMenuItem onClick={() => navigate('/profile')}>{t('rail.menu.profile')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings')}>{t('rail.menu.settings')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void logout()}>{t('rail.menu.logout')}</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
