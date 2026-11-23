import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';

import { useBackHandler } from '../../hooks/useBackHandler';

export const SafeAreaLayout = (): JSX.Element => {
    useBackHandler();

    return (
        <div className="flex flex-col w-full h-dvh overflow-hidden bg-background" style={{ colorScheme: 'light' }}>
            <Outlet />
        </div>
    );
};
