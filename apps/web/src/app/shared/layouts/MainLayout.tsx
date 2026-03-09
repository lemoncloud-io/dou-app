import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

/**
 * Main layout component for mobile-first design
 * 430px max-width container
 */
export const MainLayout = (): JSX.Element => {
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
            <div className="flex-1 flex flex-col overflow-hidden">
                <Outlet />
            </div>
        </div>
    );
};
