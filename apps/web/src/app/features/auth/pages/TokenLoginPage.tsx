import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';

import { useWebSocketV2 } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { webCore, useWebCoreStore } from '@chatic/web-core';

const decodeJWT = (token: string) => {
    try {
        if (!token || token.split('.').length !== 3) {
            return null;
        }
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            return null;
        }
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
};

export const TokenLoginPage = () => {
    const { t } = useTranslation();
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigateWithTransition();
    const { send } = useWebSocketV2();
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const { toast } = useToast();
    const [isInvalid, setIsInvalid] = useState(false);

    useEffect(() => {
        const handleTokenLogin = async () => {
            if (!token) {
                setIsInvalid(true);
                return;
            }

            const decoded = decodeJWT(token);
            if (!decoded) {
                setIsInvalid(true);
                return;
            }

            await webCore.buildCredentialsByToken({ identityToken: token } as Parameters<
                typeof webCore.buildCredentialsByToken
            >[0]);

            if (decoded?.User) {
                setProfile({
                    id: decoded.uid,
                    name: decoded.User.name,
                    nick: decoded.User.nick,
                } as Parameters<typeof setProfile>[0]);
                setIsAuthenticated(true);
            }

            send({
                type: 'auth',
                action: 'update',
                payload: {
                    token,
                    dryRun: true,
                },
            });

            toast({ title: t('auth.loginSuccess') });
        };

        handleTokenLogin();
    }, [token, send, setProfile, setIsAuthenticated, toast, navigate]);

    if (isInvalid) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-[16px] text-[#FF4C35]">{t('auth.invalidAccess')}</p>
                <Button onClick={() => navigate('/auth/login', { replace: true })}>{t('auth.goToLogin')}</Button>
            </div>
        );
    }

    return (
        <div className="flex h-full items-center justify-center">
            <div className="text-center">
                <p className="text-[16px] text-description">{t('auth.loggingIn')}</p>
            </div>
        </div>
    );
};
