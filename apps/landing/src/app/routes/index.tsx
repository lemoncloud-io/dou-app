import { useMemo } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { CommonRoutes } from './CommonRoutes';

export const Router = (): JSX.Element => {
    const router = useMemo(() => {
        return createBrowserRouter(CommonRoutes);
    }, []);

    return <RouterProvider router={router} />;
};
