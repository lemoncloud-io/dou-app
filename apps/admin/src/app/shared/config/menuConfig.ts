import { MousePointer2, Wifi } from 'lucide-react';

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
        label: 'Pointer Test',
        icon: MousePointer2,
        path: '/pointer-test',
    },
];
