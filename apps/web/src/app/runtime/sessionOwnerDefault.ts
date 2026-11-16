import type { OnWebAppReadyPayload, SessionOwnerName } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

/** The two build settings this reads, as Vite bakes them into the bundle. */
export interface SessionOwnerDefaultEnv {
    /** `web` or `native`: the owner the phone app gives an install nobody switched. Unset clears it. */
    VITE_APP_SESSION_OWNER?: string;
    /** The page's own switch to stop asking a shell that offers the session (`settleSessionOwner`). */
    VITE_SESSION_MIRROR_DISABLED?: string;
}

/**
 * The owner this web build names for the app's installs nobody switched. A build that stops asking the
 * shell names the page: it would not mirror a shell that held the session, so it must not send the next
 * start there either. Anything but `web` or `native` names nothing (`null`), which clears what an earlier
 * build recorded and leaves the app on its own build's default — the app's runtime, on a dev or production build. Clearing
 * rather than skipping is what makes removing the setting a rollback.
 */
export const sessionOwnerDefault = (env: SessionOwnerDefaultEnv): SessionOwnerName | null => {
    if (env.VITE_SESSION_MIRROR_DISABLED === 'true') return 'web';
    const named = env.VITE_APP_SESSION_OWNER;
    if (named === 'web' || named === 'native') return named;
    // A misspelt value clears the record like an unset one, which on a dev or production app means the
    // runtime — worth a line in the log, since whoever set it meant something else.
    if (named) logger.warn('session.owner_default_unknown', 'VITE_APP_SESSION_OWNER is not web or native', { named });
    return null;
};

export interface SessionOwnerDefaultBridge {
    setDefaultSessionOwner(owner: SessionOwnerName | null): Promise<{ success: boolean; error?: { code?: string } }>;
}

/**
 * Tells the app, once its `WebAppReady` reply is in, the owner this build names. Sent on every boot, so
 * the value a web deploy carries reaches every install the next time it opens, and takes effect at the
 * start after that. Only to an app that lists the request: an older one would answer `NOT_FOUND`, and a
 * browser or a desktop shell has no phone session to place. Never throws — this cannot hold up a boot.
 */
export const sendSessionOwnerDefault = async (
    report: Pick<OnWebAppReadyPayload, 'supportedWebMessages'> | null,
    bridge: SessionOwnerDefaultBridge,
    env: SessionOwnerDefaultEnv
): Promise<void> => {
    if (!report?.supportedWebMessages?.includes('SetDefaultSessionOwner')) return;
    await setSessionOwnerDefault(bridge, env);
};

/**
 * Sends the owner without asking the app first — for a launch whose owner could not be settled, which
 * never reaches `WebAppReady`. That launch is the one a rollback has to reach most: a runtime that does
 * not answer the page leaves every install on the error screen, and naming `web` here is what moves the
 * next start back to the page. An app that does not know the request refuses it, which is only logged.
 */
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
