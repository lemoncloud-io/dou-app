import { Navigate, Route, Routes } from 'react-router-dom';

import { ChildPolicyPage, PrivacyPolicyPage, TermsOfServicePage } from '../pages';

export const PolicyRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route path="/child" element={<ChildPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/*" element={<Navigate to="/policy/terms" />} />
        </Routes>
    );
};
