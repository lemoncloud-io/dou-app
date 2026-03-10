import { Route, Routes } from 'react-router-dom';

import { LoginFormPage, MyPage, ProfileEditPage } from '../pages';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="login" element={<LoginFormPage />} />
        </Routes>
    );
};
