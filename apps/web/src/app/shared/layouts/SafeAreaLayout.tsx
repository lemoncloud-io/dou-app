import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Public layout component for unauthenticated pages
 * Provides responsive design container
 */
export const SafeAreaLayout = (): JSX.Element => {
    return (
        <div
            className="flex flex-col w-full h-dvh pt-safe-top pb-safe-bottom overflow-hidden bg-white"
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
