import { Route, Routes } from 'react-router-dom';

import {
    AccountInfoPage,
    DebugLoginPage,
    DebugPage,
    LoginPage,
    MyPage,
    PolicyListPage,
    PrivacyPage,
    ProfileEditPage,
    TermsPage,
    WithdrawalPage,
} from '../pages';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="account" element={<AccountInfoPage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="debug" element={<DebugPage />} />
            <Route path="debug/login" element={<DebugLoginPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="policy" element={<PolicyListPage />} />
            <Route path="policy/terms" element={<TermsPage />} />
            <Route path="policy/privacy" element={<PrivacyPage />} />
            <Route path="withdrawal" element={<WithdrawalPage />} />
        </Routes>
    );
};
