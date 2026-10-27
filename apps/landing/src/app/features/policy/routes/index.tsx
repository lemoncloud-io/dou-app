import { type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';
import { ChildPolicyPage, PrivacyPolicyPage, RefundPolicyPage, TermsOfServicePage } from '../pages';

export const PolicyRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route path="/child" element={<ChildPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            {/* Served on every host, gate or not; only the links to it are left out where the
                subscription pages are shut. */}
            <Route path="/refund" element={<RefundPolicyPage />} />
            <Route path="/*" element={<Navigate to={ROUTES.policy.terms} />} />
        </Routes>
    );
};
