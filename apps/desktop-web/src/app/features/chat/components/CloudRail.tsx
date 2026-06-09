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

import type { RailCloud } from '../../../shared';

interface CloudRailProps {
    clouds: RailCloud[];
    activeCloudId: string | null;
    hasUnread: boolean;
    onSelectCloud: (cloudId: string) => void;
}

const cloudInitial = (cloud: RailCloud): string =>
    (cloud.name ?? cloud.id ?? '?').trim().charAt(0).toUpperCase() || '#';

/**
 * Leftmost workspace rail. Each icon is a cloud (a distinct server with its own
 * front/API URL); selecting one runs the cloud switch pipeline. The signed-in
 * user's menu is pinned to the bottom.
 */
export const CloudRail = ({ clouds, activeCloudId, hasUnread, onSelectCloud }: CloudRailProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);

    const userInitial = (profile?.$user?.name ?? '').charAt(0).toUpperCase() || '?';
    const userPhoto = profile?.$user?.photo;

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
                            title={cloud.name ?? cloud.id}
                            className={cn(
                                'group relative flex h-11 w-11 items-center justify-center text-callout font-semibold transition-all duration-150 ease-tactile tactile',
                                'rounded-2xl hover:rounded-xl focus-ring',
                                isActive
                                    ? 'rounded-xl bg-primary text-primary-foreground shadow-raised'
                                    : 'bg-rail-muted text-rail-foreground hover:bg-rail-muted/70',
                                isInactive && 'opacity-50'
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
                                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread shadow-raised" />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="my-2 h-px w-8 shrink-0 bg-hairline" />

            <DropdownMenu>
                <DropdownMenuTrigger className="flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-150 ease-tactile tactile focus-ring">
                    <Avatar className="h-10 w-10 border border-rail-muted">
                        {userPhoto && <AvatarImage src={userPhoto} alt={profile?.$user?.name ?? ''} />}
                        <AvatarFallback className="bg-rail-muted text-callout font-semibold text-rail-foreground">
                            {userInitial}
                        </AvatarFallback>
                    </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
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
