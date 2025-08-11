import { Navigate, Route, Routes } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { EmailVerificationPage, PasswordSetupPage, SignUpPage } from '../pages';
import { MenuPage } from '../pages/MenuPage';
import { AgentFormPage } from '../pages/my-agent/AgentFormPage';
import { MyAgentPage } from '../pages/my-agent/MyAgentPage';
import { MyChatInfoPage } from '../pages/my-chat/MyChatInfoPage';
import { MyChatListPage } from '../pages/my-chat/MyChatListPage';
import { MyChatPage } from '../pages/my-chat/MyChatPage';
import { EmailRegisterPage } from '../pages/my-page/EmailRegisterPage';
import { MyPage } from '../pages/my-page/MyPage';
import { ProfilePage } from '../pages/my-page/ProfilePage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { AppRedirectPage } from '../pages/other-chat/AppRedirectPage';
import { InvitePage } from '../pages/other-chat/InvitePage';
import { OtherChatInfoPage } from '../pages/other-chat/OtherChatInfoPage';
import { OtherChatPage } from '../pages/other-chat/OtherChatPage';
import { QrInvitePage } from '../pages/other-chat/QrInvitePage';
import { QrScanPage } from '../pages/other-chat/QrScanPage';
import { SearchPage } from '../pages/SearchPage';
import StylingListPage from '../pages/StylingListPage';

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
            <Route path="/" element={<StylingListPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/email-verification" element={<EmailVerificationPageWrapper />} />
            <Route path="/password-setup" element={<PasswordSetupPageWrapper />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/my-agent" element={<MyAgentPage />} />
            <Route path="/agent-form" element={<AgentFormPage />} />
            <Route path="/my-chat" element={<MyChatPage />} />
            <Route path="/my-chat-list" element={<MyChatListPage />} />
            <Route path="/my-chat-info" element={<MyChatInfoPage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/my" element={<MyPage />} />
            <Route path="/my-profile" element={<ProfilePage />} />
            <Route path="/my-email" element={<EmailRegisterPage />} />
            <Route path="/other-chat" element={<OtherChatPage />} />
            <Route path="/other-chat-info" element={<OtherChatInfoPage />} />
            <Route path="/other-chat-invite" element={<InvitePage />} />
            <Route path="/qr" element={<QrInvitePage />} />
            <Route path="/app-redirect" element={<AppRedirectPage />} />
            <Route path="/qr-scan" element={<QrScanPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
