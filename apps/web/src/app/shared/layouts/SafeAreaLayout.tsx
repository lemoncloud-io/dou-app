import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

import { useBackHandler } from '../hooks/useBackHandler';

/**
 * Public layout component for unauthenticated pages
 * Provides responsive design container
 */
export const SafeAreaLayout = (): JSX.Element => {
    // Handle native back button
    useBackHandler();

    return (
        <div
            className="flex flex-col w-full h-dvh pt-safe-top pb-safe-bottom overflow-hidden bg-background"
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
