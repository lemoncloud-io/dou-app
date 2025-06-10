import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '../../../shared';
import { BoardTypeFormPage, BoardTypesListPage } from '../pages';

export const BoardTypesRoutes = () => {
    return (
        <Routes>
            <Route element={<AdminLayout />}>
                <Route path="/create" element={<BoardTypeFormPage />} />
                <Route path="/:id" element={<BoardTypeFormPage />} />
                <Route path="/" element={<BoardTypesListPage />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Route>
        </Routes>
    );
};
