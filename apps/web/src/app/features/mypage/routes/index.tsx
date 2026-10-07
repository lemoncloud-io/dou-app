import { Route, Routes } from 'react-router-dom';

import {
    AccountInfoPage,
    CloudDetailPage,
    CloudEditPage,
    CloudHubPage,
    CloudManagePage,
    CloudPlacesPage,
    LabPage,
    LicensesPage,
    LoginPage,
    MyPage,
    NotificationSettingsPage,
    PolicyListPage,
    PrivacyPage,
    ProfileEditPage,
    SettingsPage,
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
            {/* One cloud's tree: the hub, then `edit` writes, `detail` reads, `places` lists. */}
            <Route path="cloud-manage" element={<CloudManagePage />} />
            <Route path="cloud-manage/:cloudId" element={<CloudHubPage />} />
            <Route path="cloud-manage/:cloudId/edit" element={<CloudEditPage />} />
            <Route path="cloud-manage/:cloudId/detail" element={<CloudDetailPage />} />
            <Route path="cloud-manage/:cloudId/places" element={<CloudPlacesPage />} />
            <Route path="edit" element={<ProfileEditPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/notifications" element={<NotificationSettingsPage />} />
            <Route path="settings/lab" element={<LabPage />} />
            <Route path="policy" element={<PolicyListPage />} />
            <Route path="policy/terms" element={<TermsPage />} />
            <Route path="policy/licenses" element={<LicensesPage />} />
            <Route path="policy/privacy" element={<PrivacyPage />} />
            <Route path="withdrawal" element={<WithdrawalPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
        </Routes>
    );
};
