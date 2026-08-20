import { Route, Routes } from 'react-router-dom';

import {
    AccountInfoPage,
    CloudManagePage,
    CloudProfileEditPage,
    LicensesPage,
    LoginPage,
    MyPage,
    PolicyListPage,
    PrivacyPage,
    ProfileEditPage,
    TermsPage,
    WithdrawalPage,
} from '../pages';
// Owned by the `feedback` feature; nested here only because its URL lives under the mypage hub.
import { FeedbackPage } from '../../feedback';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="account" element={<AccountInfoPage />} />
            <Route path="cloud-manage" element={<CloudManagePage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="cloud-profile" element={<CloudProfileEditPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="policy" element={<PolicyListPage />} />
            <Route path="policy/terms" element={<TermsPage />} />
            <Route path="policy/licenses" element={<LicensesPage />} />
            <Route path="policy/privacy" element={<PrivacyPage />} />
            <Route path="withdrawal" element={<WithdrawalPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
        </Routes>
    );
};
