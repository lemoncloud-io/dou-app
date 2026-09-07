import { logger } from '@chatic/bridges';

import { credentialFreshness } from '../../session/auth/credentialFreshness';
import type { CredentialOwner } from '../../session/auth/credentialFreshness';
import { cloudSession } from '../../session/auth/cloudSession';
import { relaySession } from '../../session/auth/relaySession';
import type { SocketKind } from '../types';
import { renewCloudSession } from './renewCloudSession';
import { requestRelaySessionRefresh } from './requestRelaySessionRefresh';

/**
 * "How do I keep THIS server's credential alive, and what do I do when it is beyond saving?"
 * (ADR-0076 결정 3).
 *
 * relay and cloud answer both questions differently, and that asymmetry was previously expressed
 * only in prose — the same 20~30 line justification repeated at eight branch points
 * (`sessionDelegate.onAuthExpired` · `configureCredentialRecovery` · `credentialFreshness` · the two
 * guards · `SessionCredentialAdapter` · `requestRelaySessionRefresh` · `renewCloudSession`).
 * `libs/http` had already solved the same shape with types (`ICredentialRecoverer` +
 * `NoCredentialRecovery` / `PortCredentialRecoverer`); app-runtime had no such layer.
 *
 * | | relay | cloud |
 * | --- | --- | --- |
 * | 갱신 수단 | refresh (`ClientSocketAuth` 단독) | **재발급** (`delegate-cloud` + `exchange-token`) |
 * | 소켓 없으면 | 갱신 불가 — 기다리는 것 말고 없다 | relay만 살아 있으면 가능 |
 * | 종단 만료 시 | 세션 자체가 위험 → 로그아웃 | 클라우드만 버린다 |
 *
 * **`Renewer` is a new word in this repo** (0 occurrences); the FORM is not — `-er` agent nouns are
 * `ICredentialRecoverer` · `IAuthSigner` · `IFailureAttributor`, and `renew` is already this
 * package's verb (`renewCloudSession`). `libs/http`'s `ICredentialRecoverer` is not reused because it
 * means something else there: recovering a REQUEST for a retry, not renewing a token.
 *
 * **Why this lives under `socket/auth/`.** Both renewal actions already do
 * (`requestRelaySessionRefresh` · `renewCloudSession`), and `socket/auth → session` is an existing
 * edge (11 imports) while `session/auth → socket` is zero. Putting it in `session/auth` would invert
 * that and close a cycle. Same reasoning as `authStatus.ts` next door.
 */
export interface ICredentialRenewer {
    readonly owner: CredentialOwner;
    /** Milliseconds left on this server's credential; null when there is nothing to measure. */
    timeToExpiry(now?: number): number | null;
    /** True when the credential was re-minted. Never throws — a failure is `false`. */
    renew(): Promise<boolean>;
    /** What to do once the Auth SDK reports terminal `expired` for this server. */
    onTerminalExpiry(): Promise<void> | void;
}

class RelayCredentialRenewer implements ICredentialRenewer {
    readonly owner: CredentialOwner = 'relay';

    timeToExpiry(now?: number): number | null {
        return credentialFreshness.timeToExpiry('relay', now);
    }

    /**
     * Refresh, and only refresh: a relay token has no parent to be minted from, so `auth.refresh()`
     * through the socket that owns it is the only route (ADR-0070 불변조건 1). Without a live socket
     * the honest answer is `false` — the caller should get the socket back rather than route around it.
     */
    renew(): Promise<boolean> {
        return requestRelaySessionRefresh();
    }

    /**
     * Terminal `expired` on relay means the SDK burned `maxFailures` consecutive signing and
     * renewal attempts — a wedged signature that no amount of waiting fixes. Auto-logout (POLICY,
     * superseding the old manual-only stance) so the runtime's guest-login fallback picks up a clean
     * session instead of leaving an authenticated-looking zombie (isVerified=false forever, token
     * still sitting in the store).
     */
    onTerminalExpiry(): Promise<void> {
        logger.warn('SOCKET', '[relayRenewer] relay auth expired — auto-logging out');
        return relaySession.clearAndRedirect();
    }
}

class CloudCredentialRenewer implements ICredentialRenewer {
    readonly owner: CredentialOwner = 'cloud';

    timeToExpiry(now?: number): number | null {
        return credentialFreshness.timeToExpiry('cloud', now);
    }

    /**
     * RE-ISSUE, not refresh. A cloud token is minted from the relay identity (`delegate-cloud` is
     * relay-signed HTTP), so as long as relay lives there is always a way to mint a fresh one —
     * asking the cloud socket to refresh is exactly what is unavailable when that socket is down.
     */
    renew(): Promise<boolean> {
        return renewCloudSession();
    }

    /** Cloud expiry costs only the cloud: relay stays the baseline and re-entry re-issues. */
    onTerminalExpiry(): void {
        cloudSession.clearStores();
    }
}

/**
 * The two renewers, keyed by socket kind. Stateless, so one instance each serves the whole app —
 * the same reasoning as `credentialFreshness`.
 */
export const credentialRenewers: Record<SocketKind, ICredentialRenewer> = {
    relay: new RelayCredentialRenewer(),
    cloud: new CloudCredentialRenewer(),
};
