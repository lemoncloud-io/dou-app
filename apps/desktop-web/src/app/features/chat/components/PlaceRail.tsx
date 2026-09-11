import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Home, User } from 'lucide-react';

import type { DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';

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

import {
    Hint,
    isPlaceholderName,
    useAccountResetOnLogout,
    useDebugModeStore,
    useDisplayProfile,
} from '../../../shared';

interface PlaceRailProps {
    places: DomainPlace[];
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

/** One place, Figma Workspace Rail style: a 48px icon box with the name under it.
 *  Active = the box fills with the rail's muted tone; color stays reserved for the
 *  cloud rail and thumbnails. */
const PlaceTile = ({ id, name, thumbnail, glyph, isActive, unread, isSwitching, onSelect }: PlaceTileProps) => (
    <Hint label={name}>
        <button
            onClick={() => onSelect(id)}
            disabled={isSwitching}
            aria-label={name}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
                'group flex w-full flex-col items-center gap-1 rounded-lg focus-ring',
                isSwitching && 'cursor-not-allowed',
                isSwitching && !isActive && 'opacity-40'
            )}
        >
            <span className="relative">
                <span
                    className={cn(
                        'flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-callout font-semibold text-rail-foreground transition-colors duration-150 ease-tactile tactile',
                        isActive ? 'bg-rail-muted' : 'bg-transparent group-hover:bg-rail-muted/70'
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
                    <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge-unread px-1 text-[11px] font-semibold leading-none text-badge-unread-foreground">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </span>
            <span
                className={cn(
                    'max-w-full truncate text-[14px] font-medium leading-tight text-rail-foreground transition-opacity',
                    !isActive && 'opacity-70 group-hover:opacity-100'
                )}
            >
                {name}
            </span>
        </button>
    </Hint>
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
    const { userId } = runtime.session.useSessionIdentity();
    const { userName, photo } = runtime.session.useRuntimeProfile();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();

    // Self Display Profile: show my Place nick/photo here when set for this place.
    const globalName = isPlaceholderName(userName) ? '' : userName;
    const { name: selfName, thumbnail: userPhoto } = useDisplayProfile(userId ?? '', globalName, photo);
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
            {/* overflow-y:auto clips overflow-x too — the pt/px give the -top/-right unread
                badge room inside the clip box instead of slicing it. */}
            <div className="-mt-2 flex w-full flex-1 flex-col items-stretch gap-4 overflow-y-auto scrollbar-hide px-1 pt-2">
                {isDefaultMode ? (
                    // Home / Guest: no joinable places, but show the default Home place
                    // so the rail is never empty and the active place stays visible.
                    <PlaceTile
                        id="default"
                        name={t('place.home')}
                        glyph={<Home size={22} strokeWidth={2} aria-hidden />}
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
                <span className="h-px w-9 bg-hairline" />
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={selfName || t('rail.menu.profile')}
                    className="group relative transition-transform duration-150 ease-tactile tactile focus-ring rounded-full"
                >
                    {/* Figma "1명 Profile": navy (blue_bk #102346) disc with a green
                        (Colors/Green #34C759) presence dot — same in both themes. */}
                    <Avatar className="h-12 w-12 rounded-full">
                        {userPhoto && <AvatarImage src={userPhoto} alt={selfName} className="rounded-full" />}
                        <AvatarFallback className="rounded-full bg-[#102346] text-heading font-semibold text-white">
                            {userInitial || <User size={17} aria-hidden />}
                        </AvatarFallback>
                    </Avatar>
                    {/* presence dot — signals "you, signed in" so the slot reads intentional, not empty */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-rail-elevated bg-[#34C759]" />
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
