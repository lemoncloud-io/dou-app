import { Route, Routes } from 'react-router-dom';

import { SetupWizardPage } from './pages';

export const OnboardingRoutes = () => (
    <Routes>
        <Route path="setup" element={<SetupWizardPage />} />
    </Routes>
);
