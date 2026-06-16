import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { useWebCoreStore, webCore } from '@chatic/web-core';

const decodeJWT = (token: string): Record<string, unknown> | null => {
    try {
        if (!token || token.split('.').length !== 3) return null;
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
};

export const TokenLoginPage = () => {
    const { t } = useTranslation();
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const [isInvalid, setIsInvalid] = useState(false);

    useEffect(() => {
        const run = async () => {
            if (!token) return setIsInvalid(true);

            const decoded = decodeJWT(token);
            if (!decoded) return setIsInvalid(true);

            try {
                await webCore.buildCredentialsByToken({ identityToken: token } as Parameters<
                    typeof webCore.buildCredentialsByToken
                >[0]);

                const user = decoded.User as { name?: string; nick?: string } | undefined;
                if (user) {
                    setProfile({
                        id: decoded.uid as string,
                        name: user.name,
                        nick: user.nick,
                    } as unknown as UserProfile$);
                    setIsAuthenticated(true);
                }
                navigate('/', { replace: true });
            } catch (error) {
                logger.error('AUTH', '[TokenLoginPage] token login failed', { error });
                setIsInvalid(true);
            }
        };

        void run();
    }, [token, setProfile, setIsAuthenticated, navigate]);

    if (isInvalid) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p className="text-sm text-destructive">{t('auth.token.invalid')}</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center">
            <p className="text-sm text-description">{t('auth.token.loggingIn')}</p>
        </div>
    );
};
