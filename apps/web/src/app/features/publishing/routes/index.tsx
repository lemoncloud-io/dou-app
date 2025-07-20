import { Navigate, Route, Routes } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { EmailVerificationPage, PasswordSetupPage, SignUpPage } from '../pages';

const EmailVerificationPageWrapper = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    if (!email) {
        return <Navigate to="/publishing/sign-up" replace />;
    }

    return <EmailVerificationPage email={email} />;
};

const PasswordSetupPageWrapper = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    if (!email) {
        return <Navigate to="/publishing/sign-up" replace />;
    }

    const handleComplete = (password: string) => {
        // Mock signup completion
        console.log('Signup completed for:', email, 'with password length:', password.length);
        navigate('/publishing/success', { state: { email } });
    };

    return <PasswordSetupPage email={email} onComplete={handleComplete} />;
};

export const PublishingRoutes = () => {
    return (
        <Routes>
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/email-verification" element={<EmailVerificationPageWrapper />} />
            <Route path="/password-setup" element={<PasswordSetupPageWrapper />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
