import { Route, Routes } from 'react-router-dom';

import {
    AccountInfoPage,
    LoginPage,
    MyPage,
    PolicyListPage,
    PrivacyPage,
    ProfileEditPage,
    SubscriptionPage,
    SubscriptionPlansPage,
    TermsPage,
    WithdrawalPage,
} from '../pages';

export const MyPageRoutes = () => {
    return (
        <Routes>
            <Route index element={<MyPage />} />
            <Route path="account" element={<AccountInfoPage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="policy" element={<PolicyListPage />} />
            <Route path="policy/terms" element={<TermsPage />} />
            <Route path="policy/privacy" element={<PrivacyPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="subscription/plans" element={<SubscriptionPlansPage />} />
            <Route path="withdrawal" element={<WithdrawalPage />} />
        </Routes>
    );
};
