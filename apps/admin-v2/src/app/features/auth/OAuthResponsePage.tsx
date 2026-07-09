import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { createCredentialsByProvider, fetchProfile } from '@chatic/web-core';

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

                // Exchange OAuth code for transport credentials, then hydrate profile.
                await createCredentialsByProvider(provider, code);
                await fetchProfile();

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
