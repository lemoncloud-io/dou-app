import { Navigate, Route, Routes } from 'react-router-dom';

import { runtime } from '@chatic/runtime';

import { ROUTES } from '../../../routes/paths';
import { MiniAppManagePage } from '../pages/MiniAppManagePage';
import { MiniAppsPage } from '../pages/MiniAppsPage';

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
