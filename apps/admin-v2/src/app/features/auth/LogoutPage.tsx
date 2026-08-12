import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// app-runtime's logout (not web-core's): it also sends the best-effort socket `auth.logout` so the
// RuntimeAuthHost relay session is revoked server-side, then runs the same local teardown.
import { useSessionLogout } from '@chatic/app-runtime';

export const LogoutPage = () => {
    const logout = useSessionLogout();
    const navigate = useNavigate();

    useEffect(() => {
        const handleLogout = async () => {
            await logout();
            navigate('/auth/login', { replace: true });
        };

        void handleLogout();
    }, [logout, navigate]);

    return (
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            로그아웃 중...
        </div>
    );
};
