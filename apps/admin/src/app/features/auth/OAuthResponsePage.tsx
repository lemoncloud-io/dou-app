import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime';

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

                await runtime.session.createCredentialsByProvider(provider, code);

                let redirectTo = '/socket-lab';
                try {
                    const stateObj = JSON.parse(decodeURIComponent(stateParam));
                    redirectTo = stateObj.from || '/socket-lab';
                } catch {
                    // Ignore malformed state; use default redirect.
                }

                navigate(redirectTo, { replace: true });
            } catch {
                navigate('/auth/login', { replace: true });
            }
        };

        void checkLoginResult();
    }, [location.search, navigate]);

    return (
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            Signing you in...
        </div>
    );
};
