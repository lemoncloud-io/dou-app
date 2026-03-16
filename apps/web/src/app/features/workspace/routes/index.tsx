import { Route, Routes } from 'react-router-dom';

import { CreateWorkspacePage, WorkspaceDetailPage, WorkspaceSettingsPage } from '../pages';

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
