import { logger } from '@chatic/bridges';

import { Coalescer } from '../../utils/coalescer';
import { credentialFreshness } from '../../session/auth/credentialFreshness';
import type { CredentialOwner } from '../../session/auth/credentialFreshness';
import { cloudSession } from '../../session/auth/cloudSession';
import { relaySession } from '../../session/auth/relaySession';
import type { SocketKind } from '../types';
import { getAuthStatus } from './authStatus';
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
 * | 종단 만료 시 | 세션 자체가 위험 → **확인 창 후** 로그아웃 | 클라우드만 버린다 |
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

/**
 * How long a terminal relay expiry must PERSIST before it is read as the session's fault.
 *
 * Tied to `EXPIRED_RESUME_INITIAL_COOLDOWN_MS` in
 * [`bootstrapSocketConnection`](./bootstrapSocketConnection.ts): that gate lets the FIRST resume
 * through immediately, so a reconnect landing inside this window gets its `device.save:ok` →
 * `auth.update` attempt, and a link-caused expiry clears itself before the window ends. Shorter and
 * this decides before the recovery it is waiting for can run; longer and a genuinely wedged session
 * sits 403-ing for no added certainty.
 */
const EXPIRY_CONFIRMATION_MS = 30_000;

/**
 * How many confirmation windows an UNRESOLVED status buys before the verdict lands.
 *
 * Two, because `handshaking` is now unresolved rather than healed (see {@link isExpiryResolved}) and
 * a single window would decide too early on it. A wedged session re-arms and burns its budget fast —
 * the SDK's `maxFailures` (3) on a 1s/2s/4s backoff is ~7s of waiting plus round trips — so the
 * SECOND read lands back on `expired` and the verdict is confident. A link that is merely slow gets
 * the extra window to finish a handshake instead of being thrown out at 30s.
 */
const EXPIRY_CONFIRMATION_ROUNDS = 2;

/**
 * Statuses that END the decision without spending the session.
 *
 * `verified` and `stale` both mean the handshake COMPLETED on this connection — `deriveAuthStatus`
 * only reaches either past its `verifiedOnThisConnection` gate — which is the positive evidence this
 * decision needs. `absent` means the token is already gone, so there is nothing left to clear.
 *
 * **`handshaking` is deliberately absent, and that is the point.** The SDK's `register()` resets the
 * failure budget and sets `pending` whenever the controller is INACTIVE — and inactive is exactly
 * what a terminal `expired` leaves behind (`handleFailed` sets `active = false`). So any reconnect,
 * wake-kick or `authIdRegistry` re-seed moves the status off `expired` to `handshaking` with nothing
 * having been authenticated. Reading that as "recovered" let a permanently-wedged session re-arm
 * forever: a fresh budget, four more refusals, `expired` again, another re-seed — the user parked in
 * a zombie session while the server collected a 403 per attempt. Observed in production
 * 2026-09-10/11 (see `mergeRefreshedRelayToken` for the defect that wedges it).
 */
const isExpiryResolved = (status: ReturnType<typeof getAuthStatus>): boolean =>
    status === 'verified' || status === 'stale' || status === 'absent';

/** Seams for {@link RelayCredentialRenewer}'s terminal-expiry decision — injected only by tests. */
export interface RelayExpiryDeps {
    /** `navigator.onLine`, read at decision time rather than captured. */
    isOnline?: () => boolean;
    /** The relay slot's status after the confirmation window. */
    readStatus?: () => ReturnType<typeof getAuthStatus>;
    wait?: (ms: number) => Promise<void>;
    logout?: () => Promise<void>;
}

const defaultIsOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);
const defaultWait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class RelayCredentialRenewer implements ICredentialRenewer {
    readonly owner: CredentialOwner = 'relay';

    /**
     * One pending decision at a time. The SDK can report `expired` again while the window is open
     * (a reconnect that re-burns the budget), and those repeats are the SAME event as far as this
     * decision goes — they join the run instead of stacking timers (ADR-0076 결정 4).
     */
    private readonly confirmation = new Coalescer<void>();

    constructor(private readonly deps: RelayExpiryDeps = {}) {}

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
     * Terminal `expired` on relay means the SDK burned `maxFailures` (3) consecutive signing and
     * renewal attempts. When that is a wedged signature, no amount of waiting fixes it and the right
     * answer is auto-logout (POLICY, superseding the old manual-only stance) so the runtime's
     * guest-login fallback picks up a clean session instead of leaving an authenticated-looking
     * zombie (isVerified=false forever, token still sitting in the store).
     *
     * **But `expired` does not only mean that, so it is no longer acted on the instant it arrives.**
     * Three failures are also what a bad link produces — the bootstrap gate's own doc names the case
     * (request timeouts on a half-open socket right after wake), and three of those on a train are
     * indistinguishable from a dead signature AT THE MOMENT THEY LAND. This was the one path in the
     * runtime that spent a user's session on that ambiguity: every other recovery path already
     * declines to act while offline (both credential guards, `renewCloudSession`), and this one
     * redirected the page.
     *
     * Two cheap questions separate the cases, and the second is the load-bearing one:
     *
     *  1. **Is the link down?** `navigator.onLine === false` is the repo's reliable negative
     *     (`deriveConnectivity`): it proves the failures were not the session's fault. Defer — a
     *     returning link re-runs the handshake, and a still-wedged session expires again with the
     *     browser online, which lands back here.
     *  2. **Did it POSITIVELY recover within {@link EXPIRY_CONFIRMATION_MS} ×
     *     {@link EXPIRY_CONFIRMATION_ROUNDS}?** A wedged signature is, by definition, permanent; a
     *     transient burn is not. Reconnect + the bootstrap gate's immediate first resume, or a
     *     foreground `recoverUnverifiedSockets` re-seed, let a healthy session complete its handshake
     *     inside the window. This costs a returning user up to a minute of a zombie session — less
     *     than the old behavior spent throwing them out of a session that was about to heal.
     *
     *     **"Positively" is doing the work here.** This used to accept anything but `expired`, which
     *     the SDK made meaningless: `register()` re-arms an inactive controller and reports
     *     `pending` → `handshaking` before a single packet is authenticated, so the re-seed that was
     *     supposed to be EVIDENCE of recovery was manufacturing it. See {@link isExpiryResolved}.
     *
     * The window is NOT a retry loop: it schedules nothing and kicks nothing. It only delays the
     * verdict long enough for the recovery paths that already exist to be observed.
     */
    onTerminalExpiry(): Promise<void> {
        return this.confirmation.run(() => this.confirmTerminalExpiry());
    }

    private async confirmTerminalExpiry(): Promise<void> {
        const isOnline = this.deps.isOnline ?? defaultIsOnline;
        const wait = this.deps.wait ?? defaultWait;
        const readStatus = this.deps.readStatus ?? (() => getAuthStatus('relay'));
        const logout = this.deps.logout ?? (() => relaySession.clearAndRedirect());

        if (!isOnline()) {
            logger.warn('SOCKET', '[relayRenewer] relay auth expired while offline — not logging out');
            return;
        }

        let status: ReturnType<typeof getAuthStatus> = 'expired';

        for (let round = 1; round <= EXPIRY_CONFIRMATION_ROUNDS; round += 1) {
            await wait(EXPIRY_CONFIRMATION_MS);

            // Re-asked, not remembered: the link can drop during the window, and an expiry that is now
            // unattributable is one this must not spend the session on.
            if (!isOnline()) {
                logger.warn('SOCKET', '[relayRenewer] relay auth expiry unconfirmed (went offline) — not logging out');
                return;
            }

            // A POSITIVE heal ends it — a completed handshake, or a token that is already gone.
            status = readStatus();
            if (isExpiryResolved(status)) {
                logger.info('SOCKET', '[relayRenewer] relay auth recovered within the confirmation window', {
                    data: { status, round },
                });
                return;
            }

            if (round < EXPIRY_CONFIRMATION_ROUNDS) {
                logger.info('SOCKET', '[relayRenewer] relay auth not yet recovered — waiting one more window', {
                    data: { status, round },
                });
            }
        }

        logger.warn('SOCKET', '[relayRenewer] relay auth still unrecovered after confirmation — auto-logging out', {
            data: { status, rounds: EXPIRY_CONFIRMATION_ROUNDS },
        });
        await logout();
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
