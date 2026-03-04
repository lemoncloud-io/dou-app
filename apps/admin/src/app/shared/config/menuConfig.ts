import { KeyRound, Link, MousePointer2, Users, Wifi } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
    label: string;
    icon: LucideIcon;
    path: string;
}

export const adminMenuItems: MenuItem[] = [
    {
        label: 'Socket Test',
        icon: Wifi,
        path: '/socket-test',
    },
    {
        label: 'Auth Test',
        icon: KeyRound,
        path: '/auth-test',
    },
    {
        label: 'Pointer Test',
        icon: MousePointer2,
        path: '/pointer-test',
    },
    {
        label: 'Users',
        icon: Users,
        path: '/users',
    },
    {
        label: 'Deeplinks',
        icon: Link,
        path: '/deeplinks',
    },
];
