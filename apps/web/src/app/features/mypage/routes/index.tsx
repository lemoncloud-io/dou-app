import { Route, Routes } from 'react-router-dom';

import { MyPage, ProfileEditPage } from '../pages';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="edit" element={<ProfileEditPage />} />
        </Routes>
    );
};
