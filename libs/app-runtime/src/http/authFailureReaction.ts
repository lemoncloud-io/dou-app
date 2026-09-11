import { logger } from '@chatic/bridges';

/**
 * What an app DOES when the server has refused this session for good.
 *
 * The refusal itself is not a judgement call — `classifyError` says `AUTHENTICATION`, the client
 * has already re-minted the credential and replayed the request once
 * (`PortCredentialRecoverer` → `client.run`), and it still came back refused. That is the one
 * fact-based "this session is over" signal in the runtime, as opposed to the guards, which can only
 * infer it from a refresh they could not perform.
 *
 * The REACTION is a judgement call, and it differs by surface. A chat app can throw the user at the
 * login screen: there is nothing on screen to lose. A console cannot — an admin mid-investigation
 * loses their filters, their pinned rows and their place, and a `window.alert` blocks the tab on top
 * of it. Hardcoding one reaction for every app is what made that the only option.
 *
 * Unregistered is the SAFE state, and here that means SILENT. The inlined predecessor
 * (`handleAuthError(error, true, message)` — alert + hard jump to `/auth/logout`) was never
 * actually reached: `ports.onAuthFailure` had one caller, `withRetry`, which lost its last
 * production caller and is not exported, so no app has ever shown that alert. Now that
 * `HttpClientImpl` does report the verdict, keeping that alert as the default would hand every app
 * a logout behavior it has never had, on any 403 — so the default only logs (in `onAuthFailure`),
 * and a surface that wants to react says so. admin-v2 does.
 *
 * Same shape and the same reasoning as `credentialRecovery` next door — a late-bound registry
 * rather than an import, because the implementations live upstream of `http/`.
 */
export type AuthFailureReactionFn = (error: unknown, message: string) => void;

export interface IAuthFailureReaction {
    /** Installs the app's reaction. Passing null restores the default (test teardown). */
    register(fn: AuthFailureReactionFn | null): void;
    /** Runs the app's reaction, or the default when none is registered. Never throws. */
    react(error: unknown, message: string): void;
}

/**
 * Do nothing. `onAuthFailure` has already logged the failure and is about to rethrow it, so the
 * caller still fails exactly as it did before an app registered anything.
 */
const defaultReaction: AuthFailureReactionFn = () => undefined;

class AuthFailureReactionRegistry implements IAuthFailureReaction {
    private fn: AuthFailureReactionFn | null = null;

    register(fn: AuthFailureReactionFn | null): void {
        this.fn = fn;
    }

    react(error: unknown, message: string): void {
        try {
            (this.fn ?? defaultReaction)(error, message);
        } catch (reactionError) {
            // A reaction that throws must not replace the caller's own failure — they asked about
            // their request, not about our notification. Same stance as `credentialRecovery`.
            logger.warn('AUTH', '[authFailureReaction] reaction threw', { error: reactionError });
        }
    }
}

/** The process-wide registry. An app registers once, at startup. */
export const authFailureReaction: IAuthFailureReaction = new AuthFailureReactionRegistry();
