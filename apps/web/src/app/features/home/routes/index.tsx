import { Navigate, Route, Routes } from 'react-router-dom';

import { CreateRoomPage, HomePage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route index element={<HomePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

export const CreateRoomRoutes = () => {
    return (
        <Routes>
            <Route index element={<CreateRoomPage />} />
        </Routes>
    );
};
