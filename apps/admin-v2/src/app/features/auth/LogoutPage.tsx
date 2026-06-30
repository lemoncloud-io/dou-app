import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSessionLogout } from '@chatic/web-core';

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
