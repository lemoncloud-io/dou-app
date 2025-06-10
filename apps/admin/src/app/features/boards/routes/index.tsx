import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '../../../shared';
import { BoardFormPage, BoardListPage } from '../pages';

export const BoardsRoutes = () => {
    return (
        <Routes>
            <Route element={<AdminLayout />}>
                <Route path="/create" element={<BoardFormPage />} />
                <Route path="/:id" element={<BoardFormPage />} />
                <Route path="/" element={<BoardListPage />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Route>
        </Routes>
    );
};
