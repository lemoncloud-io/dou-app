import type { SocketBindingConfig } from '../socket';

/** One socket slot's binding config (undefined when that slot is gated off). */
export interface RuntimeSocketSlot {
    config: SocketBindingConfig;
    /**
     * This slot's server identity token. Deliberately OUTSIDE `config` (which drives SocketBinder's
     * reboot key) so a token swap does not reboot the socket — SocketReauthBinder watches this
     * per-slot to re-authenticate the RIGHT socket even when it is not the active one (§6-3, §6-7).
     */
    identityToken?: string;
}

/**
 * Dual sockets: relay is always-on (once a relay token exists), cloud is present only while a cloud
 * session is active. SocketBinder boots each slot independently. (multi-socket-design.md §5-2)
 *
 * This used to be `RuntimeBinding` and carried a second field, `context: DataContext` — the cache
 * scope. No production code read it: `deriveSelectedContext` derives that formula and consumers read
 * it from the store (ADR-0076 결정 1), so the field was a duplicate that could only agree or silently
 * disagree. What is left is exactly the socket slots, which is what the name now says.
 */
export interface RuntimeSocketSlots {
    relay?: RuntimeSocketSlot;
    cloud?: RuntimeSocketSlot;
}

/**
 * The current session user's reactive facts. Higher-level policy (permissions) is derived in the app
 * layer from these — see apps/web's useUserPermissions. This stays layer-appropriate: app-runtime
 * provides the identity facts; the app decides what they mean.
 */
export interface SessionProfile {
    userRole: string | null;
    isGuest: boolean;
    /** Whether an active cloud session is attached (vs relay/default). */
    isCloudActive: boolean;
    userName: string;
    photo?: string;
}
