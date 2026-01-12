import { BarChart3, LayoutDashboard, MessageSquare, Settings, Users } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
    label: string;
    icon: LucideIcon;
    path: string;
}

export const adminMenuItems: MenuItem[] = [
    {
        label: 'Dashboard',
        icon: LayoutDashboard,
        path: '/',
    },
    {
        label: 'Users',
        icon: Users,
        path: '/users',
    },
    {
        label: 'Chats',
        icon: MessageSquare,
        path: '/chats',
    },
    {
        label: 'Analytics',
        icon: BarChart3,
        path: '/analytics',
    },
    {
        label: 'Settings',
        icon: Settings,
        path: '/settings',
    },
];
