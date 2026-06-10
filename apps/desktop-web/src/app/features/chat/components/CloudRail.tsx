import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { useWebCoreStore } from '@chatic/web-core';

import { useJoinDialogStore } from '../../auth';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { type RailCloud, isPlaceholderName, useDisplayProfile } from '../../../shared';

interface CloudRailProps {
    clouds: RailCloud[];
    activeCloudId: string | null;
    hasUnread: boolean;
    onSelectCloud: (cloudId: string) => void;
    /** A cloud/place switch is in flight — disable the cloud buttons to block a
     * second switch mid-handshake (the pipeline is serial). */
    isSwitching?: boolean;
}

const cloudInitial = (cloud: RailCloud): string =>
    (cloud.name ?? cloud.id ?? '?').trim().charAt(0).toUpperCase() || '#';

/**
 * Leftmost workspace rail. Each icon is a cloud (a distinct server with its own
 * front/API URL); selecting one runs the cloud switch pipeline. The signed-in
 * user's menu is pinned to the bottom.
 */
export const CloudRail = ({ clouds, activeCloudId, hasUnread, onSelectCloud, isSwitching }: CloudRailProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);

    // Self Display Profile: show my Place nick/photo here when set for this place.
    const rawName = profile?.$user?.name ?? '';
    const globalName = isPlaceholderName(rawName) ? '' : rawName;
    const { name: selfName, thumbnail: userPhoto } = useDisplayProfile(
        profile?.uid ?? '',
        globalName,
        profile?.$user?.photo ?? undefined
    );
    const userInitial = selfName.charAt(0).toUpperCase() || '?';

    return (
        <div className="flex h-full w-full flex-col items-center">
            <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto scrollbar-hide py-1">
                {clouds.length === 0 && (
                    <span className="px-1 text-center text-overline leading-tight text-rail-foreground">
                        {t('cloud.empty')}
                    </span>
                )}
                {clouds.map(cloud => {
                    const isActive = cloud.id === activeCloudId;
                    const isInactive = cloud.status && cloud.status !== 'active';
                    return (
                        <button
                            key={cloud.id}
                            onClick={() => onSelectCloud(cloud.id)}
                            disabled={isSwitching}
                            title={cloud.name ?? cloud.id}
                            aria-label={cloud.name ?? cloud.id}
                            aria-current={isActive ? 'true' : undefined}
                            className={cn(
                                'group relative flex h-11 w-11 items-center justify-center text-callout font-semibold transition-all duration-150 ease-tactile tactile',
                                'rounded-2xl hover:rounded-xl focus-ring',
                                isActive
                                    ? 'rounded-xl bg-primary text-primary-foreground shadow-raised'
                                    : 'bg-rail-muted text-rail-foreground hover:bg-rail-muted/70',
                                isInactive && 'opacity-50',
                                // Block a second switch mid-handshake; dim non-active icons for feedback.
                                isSwitching && 'cursor-not-allowed',
                                isSwitching && !isActive && 'opacity-40'
                            )}
                        >
                            {/* active indicator pill (Slack-style left bar) */}
                            <span
                                className={cn(
                                    'absolute -left-3 w-1 rounded-r-full bg-primary transition-all duration-150 ease-tactile',
                                    isActive ? 'h-6' : 'h-0 group-hover:h-2'
                                )}
                            />
                            {cloudInitial(cloud)}
                            {isActive && hasUnread && (
                                <span
                                    aria-hidden
                                    className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread shadow-raised"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="my-2 h-px w-8 shrink-0 bg-hairline" />

            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={selfName || t('rail.menu.profile')}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-150 ease-tactile tactile focus-ring"
                >
                    <Avatar className="h-10 w-10 border border-rail-muted">
                        {userPhoto && <AvatarImage src={userPhoto} alt={selfName} />}
                        <AvatarFallback className="bg-rail-muted text-callout font-semibold text-rail-foreground">
                            {userInitial}
                        </AvatarFallback>
                    </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={6}>
                    <DropdownMenuItem onClick={() => navigate('/profile')}>{t('rail.menu.profile')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings')}>{t('rail.menu.settings')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={openJoinDialog}>{t('rail.menu.join')}</DropdownMenuItem>
                    {import.meta.env.DEV && (
                        <DropdownMenuItem onClick={() => navigate('/debug')}>{t('rail.menu.debug')}</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void logout()}>{t('rail.menu.logout')}</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
