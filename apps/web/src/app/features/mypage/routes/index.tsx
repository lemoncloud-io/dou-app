import { Route, Routes } from 'react-router-dom';

import {
    AccountInfoPage,
    AccountManagePage,
    CloudProfileEditPage,
    LicensesPage,
    LoginPage,
    MyPage,
    PolicyListPage,
    PrivacyPage,
    ProfileEditPage,
    SiteProfileEditPage,
    TermsPage,
    WithdrawalPage,
} from '../pages';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="account" element={<AccountInfoPage />} />
            <Route path="account-manage" element={<AccountManagePage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="cloud-profile" element={<CloudProfileEditPage />} />
            <Route path="site-profile" element={<SiteProfileEditPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="policy" element={<PolicyListPage />} />
            <Route path="policy/terms" element={<TermsPage />} />
            <Route path="policy/licenses" element={<LicensesPage />} />
            <Route path="policy/privacy" element={<PrivacyPage />} />
            <Route path="withdrawal" element={<WithdrawalPage />} />
        </Routes>
    );
};
