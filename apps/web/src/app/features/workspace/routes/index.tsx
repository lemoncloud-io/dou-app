import { Route, Routes } from 'react-router-dom';

import { CreateWorkspacePage, WorkspaceDetailPage, WorkspaceListPage, WorkspaceSettingsPage } from '../pages';

export const WorkspaceListRoutes = () => {
    return (
        <Routes>
            <Route index element={<WorkspaceListPage />} />
        </Routes>
    );
};

export const WorkspaceRoutes = () => {
    return (
        <Routes>
            <Route path=":wsId" element={<WorkspaceDetailPage />} />
            <Route path=":wsId/settings" element={<WorkspaceSettingsPage />} />
        </Routes>
    );
};

export const CreateWorkspaceRoutes = () => {
    return (
        <Routes>
            <Route index element={<CreateWorkspacePage />} />
        </Routes>
    );
};
