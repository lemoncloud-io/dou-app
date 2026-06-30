import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { createCredentialsByProvider, useProfile } from '@chatic/web-core';

export const OAuthResponsePage = () => {
    const { loadProfile } = useProfile();
    const location = useLocation();
    const navigate = useNavigate();
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) {
            return;
        }
        handled.current = true;

        const checkLoginResult = async () => {
            const params = new URLSearchParams(location.search);
            const code = params.get('code') || '';
            const provider = params.get('provider') || '';
            const stateParam = params.get('state') || '';
            const isSuccess = code.length > 5;

            if (isSuccess) {
                await createCredentialsByProvider(provider, code);
                // v2: hydrate identity → isAuthenticated is derived from relay profile.
                await loadProfile();

                let redirectTo = '/socket-lab';
                try {
                    const stateObj = JSON.parse(decodeURIComponent(stateParam));
                    redirectTo = stateObj.from || '/socket-lab';
                } catch {
                    // ignore malformed state
                }

                navigate(redirectTo, { replace: true });
                return;
            }

            navigate('/auth/login', { replace: true });
        };

        void checkLoginResult();
    }, [location.search]);

    return (
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            로그인 처리 중...
        </div>
    );
};
