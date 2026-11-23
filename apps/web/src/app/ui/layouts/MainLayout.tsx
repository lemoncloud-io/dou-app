import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

import { cn } from '@chatic/ui-kit';

import { useBackHandler } from '../../hooks/useBackHandler';

export const MainLayout = (): JSX.Element => {
    useBackHandler();

    return (
        <div
            className={cn(
                'flex flex-col w-full min-h-dvh',
                'max-w-app mx-auto',
                'bg-background text-foreground',
                'relative overflow-x-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
