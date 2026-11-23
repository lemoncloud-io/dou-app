import type { OnWebAppReadyPayload, SessionOwnerName } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

export interface SessionOwnerDefaultEnv {
    VITE_APP_SESSION_OWNER?: string;
    VITE_SESSION_MIRROR_DISABLED?: string;
}

export const sessionOwnerDefault = (env: SessionOwnerDefaultEnv): SessionOwnerName | null => {
    if (env.VITE_SESSION_MIRROR_DISABLED === 'true') return 'web';
    const named = env.VITE_APP_SESSION_OWNER;
    if (named === 'web' || named === 'native') return named;
    if (named) logger.warn('session.owner_default_unknown', 'VITE_APP_SESSION_OWNER is not web or native', { named });
    return null;
};

export interface SessionOwnerDefaultBridge {
    setDefaultSessionOwner(owner: SessionOwnerName | null): Promise<{ success: boolean; error?: { code?: string } }>;
}

export const sendSessionOwnerDefault = async (
    report: Pick<OnWebAppReadyPayload, 'supportedWebMessages'> | null,
    bridge: SessionOwnerDefaultBridge,
    env: SessionOwnerDefaultEnv
): Promise<void> => {
    if (!report?.supportedWebMessages?.includes('SetDefaultSessionOwner')) return;
    await setSessionOwnerDefault(bridge, env);
};

export const sendSessionOwnerDefaultUnasked = (
    bridge: SessionOwnerDefaultBridge,
    env: SessionOwnerDefaultEnv
): Promise<void> => setSessionOwnerDefault(bridge, env);

const setSessionOwnerDefault = async (
    bridge: SessionOwnerDefaultBridge,
    env: SessionOwnerDefaultEnv
): Promise<void> => {
    const owner = sessionOwnerDefault(env);
    try {
        const reply = await bridge.setDefaultSessionOwner(owner);
        if (!reply.success) {
            logger.warn('session.owner_default_refused', 'the app did not record the default owner', {
                owner,
                code: reply.error?.code,
            });
        }
    } catch (error) {
        logger.warn('session.owner_default_failed', 'the default owner did not reach the app', {
            owner,
            error: String(error),
        });
    }
};
