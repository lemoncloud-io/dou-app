import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { createCredentialsByProvider } from '@chatic/app-runtime';

export const OAuthResponsePage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) {
            return;
        }
        handled.current = true;

        const checkLoginResult = async () => {
            try {
                const params = new URLSearchParams(location.search);
                const code = params.get('code') || '';
                const provider = params.get('provider') || '';
                const stateParam = params.get('state') || '';
                const isSuccess = code.length > 5;

                if (!isSuccess) {
                    navigate('/auth/login', { replace: true });
                    return;
                }

                // `createCredentialsByProvider` applies the relay session (setSessionAuthenticated +
                // notify) so `isAuthenticated` is true before we navigate — otherwise ProtectedRoute
                // bounces back to /auth/login. It used to build transport credentials only, which is
                // why this page followed it with a refresh call (ADR-0070 불변조건 1·2).
                await createCredentialsByProvider(provider, code);

                let redirectTo = '/socket-lab';
                try {
                    const stateObj = JSON.parse(decodeURIComponent(stateParam));
                    redirectTo = stateObj.from || '/socket-lab';
                } catch {
                    // Ignore malformed state; use default redirect.
                }

                navigate(redirectTo, { replace: true });
            } catch {
                // Auth or profile fetch failed; redirect to login.
                navigate('/auth/login', { replace: true });
            }
        };

        void checkLoginResult();
    }, [location.search, navigate]);

    return (
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            로그인 처리 중...
        </div>
    );
};
