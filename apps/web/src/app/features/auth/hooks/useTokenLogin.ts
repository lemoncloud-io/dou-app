import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebSocketV2 } from '@chatic/socket';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useWebCoreStore, webCore } from '@chatic/web-core';

/** Decode a JWT payload without verifying the signature. Returns null on malformed input. */
const decodeJWT = (token: string): Record<string, any> | null => {
    try {
        if (!token || token.split('.').length !== 3) return null;
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
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

/**
 * Logs in from a raw identity token carried in the URL: validates/decodes the JWT, builds
 * credentials, hydrates the profile, and pings socket auth. Returns `isInvalid` for the UI.
 */
export const useTokenLogin = (token: string | undefined) => {
    const { t } = useTranslation();
    const { send } = useWebSocketV2();
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const { toast } = useToast();
    const [isInvalid, setIsInvalid] = useState(false);

    useEffect(() => {
        const run = async () => {
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

            send({ type: 'auth', action: 'update', payload: { token, dryRun: true } });
            toast({ title: t('auth.loginSuccess') });
        };

        run();
    }, [token, send, setProfile, setIsAuthenticated, toast, t]);

    return { isInvalid };
};
