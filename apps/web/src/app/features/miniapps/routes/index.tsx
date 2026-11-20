import { Navigate, Route, Routes } from 'react-router-dom';

import { runtime } from '@chatic/runtime';

import { ROUTES } from '../../../routes/paths';
import { MiniAppManagePage } from '../pages/MiniAppManagePage';
import { MiniAppsPage } from '../pages/MiniAppsPage';

/**
 * The mini app tab's routes. They read `feature.miniApp.tab` themselves rather than relying on the
 * bottom nav hiding the tab: with the toggle off — a production build — an address typed by hand
 * goes home instead of opening the screens.
 */
export const MiniAppRoutes = () => {
    const enabled = runtime.settings.useConfigValue<boolean>('feature.miniApp.tab') === true;
    if (!enabled) return <Navigate to={ROUTES.home} replace />;
    return (
        <Routes>
            <Route index element={<MiniAppsPage />} />
            <Route path="manage" element={<MiniAppManagePage />} />
            <Route path="*" element={<Navigate to={ROUTES.miniApps.root} replace />} />
        </Routes>
    );
};
