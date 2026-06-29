import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Home, User } from 'lucide-react';

import type { DomainSite } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { useSessionIdentity, useSessionLogout } from '@chatic/web-core';

import { useJoinDialogStore } from '../../auth';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isPlaceholderName, useAccountResetOnLogout, useDebugModeStore, useDisplayProfile } from '../../../shared';

interface PlaceRailProps {
    places: DomainSite[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    /** Default Cloud (Guest Session): no joinable places — render the profile only. */
    isDefaultMode: boolean;
    /** A cloud/place switch is in flight — disable the tiles to block a second switch. */
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
}

const tileInitial = (name: string): string => name.trim().charAt(0).toUpperCase() || '#';

interface PlaceTileProps {
    id: string;
    name: string;
    thumbnail?: string;
    /** Optional line-glyph (e.g. Home) used in place of an avatar/initial. */
    glyph?: ReactNode;
    isActive: boolean;
    unread: number;
    isSwitching?: boolean;
    onSelect: (placeId: string) => void;
}

/** One place, Slack section-rail style: a restrained monochrome icon box + label.
 *  Active = a lighter rounded box with a brighter icon/label. Color is reserved
 *  for the cloud rail and thumbnails — the nav itself stays grayscale. */
const PlaceTile = ({ id, name, thumbnail, glyph, isActive, unread, isSwitching, onSelect }: PlaceTileProps) => (
    <button
        onClick={() => onSelect(id)}
        disabled={isSwitching}
        title={name}
        aria-label={name}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
            'group flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-1 focus-ring',
            isSwitching && 'cursor-not-allowed',
            isSwitching && !isActive && 'opacity-40'
        )}
    >
        <span className="relative">
            <span
                className={cn(
                    'flex h-10 w-10 items-center justify-center overflow-hidden text-callout font-semibold transition-all duration-150 ease-tactile tactile rounded-xl',
                    isActive
                        ? 'bg-primary/20 text-primary ring-1 ring-inset ring-primary/40 shadow-raised'
                        : 'bg-transparent text-rail-foreground/55 group-hover:bg-rail-foreground/10 group-hover:text-rail-foreground/90'
                )}
            >
                {thumbnail ? (
                    <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                ) : glyph ? (
                    glyph
                ) : (
                    tileInitial(name)
                )}
            </span>
            {unread > 0 && (
                <span className="pointer-events-none absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-rail-elevated bg-badge-unread px-1.5 text-[11px] font-bold leading-none text-badge-unread-foreground shadow-raised">
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </span>
        <span
            className={cn(
                'max-w-full truncate text-[10px] leading-tight transition-colors',
                isActive ? 'font-semibold text-primary' : 'text-rail-foreground/55 group-hover:text-rail-foreground/80'
            )}
        >
            {name}
        </span>
    </button>
);

/**
 * Second rail. Each icon is a place (a site within the active cloud); selecting
 * one runs the place switch. The signed-in user's menu is pinned to the bottom
 * (moved off the cloud rail so the profile lives with the place context).
 */
export const PlaceRail = ({
    places,
    selectedPlaceId,
    unreadByPlace,
    isDefaultMode,
    isSwitching,
    onSelectPlace,
}: PlaceRailProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const { activeProfile: profile } = useSessionIdentity();
    const logout = useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();

    // Self Display Profile: show my Place nick/photo here when set for this place.
    const rawName = profile?.$user?.name ?? '';
    const globalName = isPlaceholderName(rawName) ? '' : rawName;
    const { name: selfName, thumbnail: userPhoto } = useDisplayProfile(
        profile?.uid ?? '',
        globalName,
        profile?.$user?.photo ?? undefined
    );
    const userInitial = selfName.charAt(0).toUpperCase();

    // Hidden gesture: tap the rail divider 7× (within 1.5s between taps) to toggle
    // developer debug mode. When on, the Debug menu (which opens the debug overlay)
    // appears even in packaged/prod builds; tapping 7× again turns it off.
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const toggleDebug = useDebugModeStore(s => s.toggle);
    const openDebugPanel = useDebugModeStore(s => s.setOverlayOpen);
    const tapRef = useRef({ count: 0, last: 0 });
    const onSecretTap = () => {
        const now = Date.now();
        const taps = tapRef.current;
        taps.count = now - taps.last < 1500 ? taps.count + 1 : 1;
        taps.last = now;
        if (taps.count >= 7) {
            taps.count = 0;
            const next = toggleDebug();
            toast({ title: next ? '🛠️ Debug mode ON' : 'Debug mode OFF' });
        }
    };

    return (
        <div className="flex h-full w-full flex-col items-center">
            <div className="flex w-full flex-1 flex-col items-stretch gap-0.5 overflow-y-auto scrollbar-hide px-1.5 py-1.5">
                {isDefaultMode ? (
                    // Home / Guest: no joinable places, but show the default Home place
                    // so the rail is never empty and the active place stays visible.
                    <PlaceTile
                        id="default"
                        name={t('place.home')}
                        glyph={<Home size={18} strokeWidth={2} aria-hidden />}
                        isActive
                        unread={0}
                        onSelect={onSelectPlace}
                    />
                ) : (
                    places.map(place => (
                        <PlaceTile
                            key={place.id}
                            id={place.id}
                            name={place.name ?? place.id}
                            thumbnail={place.thumbnail}
                            isActive={place.id === selectedPlaceId}
                            unread={unreadByPlace[place.id] ?? 0}
                            isSwitching={isSwitching}
                            onSelect={onSelectPlace}
                        />
                    ))
                )}
            </div>

            <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={onSecretTap}
                className="my-1 flex w-full shrink-0 cursor-default justify-center py-1"
            >
                <span className="h-px w-9 bg-rail-foreground/15" />
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={selfName || t('rail.menu.profile')}
                    className="group relative mb-0.5 transition-transform duration-150 ease-tactile tactile focus-ring rounded-[14px]"
                >
                    <Avatar className="h-10 w-10 rounded-xl ring-1 ring-rail-foreground/20 transition-all group-hover:ring-rail-foreground/40">
                        {userPhoto && <AvatarImage src={userPhoto} alt={selfName} className="rounded-xl" />}
                        <AvatarFallback className="rounded-xl bg-rail-foreground/10 text-callout font-semibold text-rail-foreground">
                            {userInitial || <User size={17} aria-hidden />}
                        </AvatarFallback>
                    </Avatar>
                    {/* presence dot — signals "you, signed in" so the slot reads intentional, not empty */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-rail-elevated bg-emerald-500" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={6}>
                    <DropdownMenuItem onClick={() => navigate('/profile')}>{t('rail.menu.profile')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings')}>{t('rail.menu.settings')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={openJoinDialog}>{t('rail.menu.join')}</DropdownMenuItem>
                    {(import.meta.env.DEV || debugEnabled) && (
                        <DropdownMenuItem onClick={() => openDebugPanel(true)}>{t('rail.menu.debug')}</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void resetAccount().finally(() => logout())}>
                        {t('rail.menu.logout')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
