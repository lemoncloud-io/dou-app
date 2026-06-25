import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { useBackHandler } from '../hooks/useBackHandler';

export const MainLayout = (): JSX.Element => {
    // Handle native back button
    useBackHandler();

    return (
        <div
            className={cn(
                'flex flex-col w-full min-h-dvh',
                'max-w-[430px] mx-auto',
                'bg-background text-foreground',
                'relative overflow-x-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
