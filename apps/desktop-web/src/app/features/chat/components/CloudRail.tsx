import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

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
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);

    const userInitial = (profile?.$user?.name ?? '').charAt(0).toUpperCase() || '?';

    return (
        <div className="flex h-full w-full flex-col items-center">
            <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto scrollbar-hide">
                {clouds.length === 0 && (
                    <span className="px-1 text-center text-[10px] leading-tight text-rail-foreground/60">
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
                                'group relative flex h-11 w-11 items-center justify-center text-sm font-semibold transition-all duration-200',
                                'rounded-2xl hover:rounded-xl active:scale-95',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-rail',
                                isActive
                                    ? 'rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                                    : 'bg-rail-muted text-rail-foreground hover:bg-rail-muted/70',
                                isInactive && 'opacity-50'
                            )}
                        >
                            {/* active indicator pill (Slack-style left bar) */}
                            <span
                                className={cn(
                                    'absolute -left-3 w-1 rounded-r-full bg-primary transition-all',
                                    isActive ? 'h-6' : 'h-0 group-hover:h-2'
                                )}
                            />
                            {cloudInitial(cloud)}
                            {isActive && hasUnread && (
                                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread" />
                            )}
                        </button>
                    );
                })}
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger className="mt-2 rounded-full outline-none ring-primary/50 focus-visible:ring-2">
                    <Avatar className="h-10 w-10 border border-rail-muted">
                        <AvatarFallback className="bg-rail-muted text-sm font-semibold text-rail-foreground">
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
