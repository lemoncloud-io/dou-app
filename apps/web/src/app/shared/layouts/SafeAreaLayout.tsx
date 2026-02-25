import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Public layout component for unauthenticated pages
 * Provides responsive design container
 */
export const SafeAreaLayout = (): JSX.Element => {
    return (
        <div className="fixed inset-0 top-safe-top bottom-safe-bottom left-safe-left right-safe-right overflow-hidden flex flex-col">
            <Outlet />
        </div>
    );
};
