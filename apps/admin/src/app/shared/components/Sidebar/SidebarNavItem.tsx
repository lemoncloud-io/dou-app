import { Link, useLocation } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@chatic/ui-kit/components/ui/tooltip';

import type { MenuItem } from '../../config/menuConfig';

interface SidebarNavItemProps {
    item: MenuItem;
    isCollapsed: boolean;
}

export const SidebarNavItem = ({ item, isCollapsed }: SidebarNavItemProps): JSX.Element => {
    const location = useLocation();
    const isActive = item.path
        ? location.pathname === item.path || location.pathname.startsWith(item.path + '/')
        : false;

    const Icon = item.icon;

    const linkContent = (
        <Link
            to={item.path}
            className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-accent text-accent-foreground',
                isCollapsed && 'justify-center px-2'
            )}
        >
            <Icon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span>{item.label}</span>}
        </Link>
    );

    if (isCollapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="hidden lg:block">
                    <p>{item.label}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    return linkContent;
};
