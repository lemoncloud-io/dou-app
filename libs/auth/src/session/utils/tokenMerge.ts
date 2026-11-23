import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

type WithAuth = { $auth?: { id?: string } };

/**
 * relay: `stored` first, then the fresh view, then `$auth` and three `Token` fields put back by hand.
 *
 * **Why `stored` first.** A socket refresh view is not guaranteed to be a full user view, and the
 * relay token is also the ACCOUNT profile display source (`getRelaySessionUser`). Without the merge a
 * slim refresh silently drops name/photo/email and the MY page header blanks out mid-session.
 *
 * **`$auth` is preserved, not adopted — WORKAROUND for a backend defect.**
 *
 * `$auth.id` is the relay signature's outer HMAC key and the id the socket registers with
 * (signing.md §1). A site switch (`auth.switch` → refresh body carrying `target`) makes the backend
 * mint a CHILD auth model and return it as `$auth`, while `Token` in that same response comes from
 * the refresh issued against the PARENT. The child is created by `makeAuthByAccount`, which writes
 * only `stereo`/`accountId`/`clientIp`/`userAgent` — it never sets `identityId`, because the path
 * that normally supplies it (`issueAccessToken`'s `proxy.auth.set(id, $auth2)` after a Cognito
 * fetch) is not on this branch.
 *
 * So adopting that `$auth` leaves the store signing with (child `authId`, parent `identityId`) while
 * the server recomputes the same HMAC with `identityId` = `''`. Every later refresh then returns
 * `403 NOT ALLOWED - invalid sign @refreshAccessToken(<child authId>)`, permanently, until re-login
 * — and the session dies silently, because log upload dies with the credential. Verified against the
 * production auth record on 2026-09-11.
 *
 * Preserving is safe for the refresh path this merge serves: the non-`target` branch returns the
 * SAME `$auth` it loaded, so this is a no-op there. A genuinely new session does NOT come through
 * here — `relaySession.apply()` writes the view wholesale via `relayStore.saveRelayToken`. And
 * nothing else reads `$auth.id`: its only consumers are `getAuthRegistration` and `signAuth`.
 *
 * It also removes the drift this used to cause — with the store's `$auth.id` held still,
 * `authIdRegistry.resync` has nothing to re-seed.
 *
 * **Revert this once the backend carries `identityId`/`identityPoolId` into the child auth**; until
 * then the client cannot tell a usable `$auth` from an unusable one (the server's `identityId` is
 * not observable from here, and the SDK reports every refusal as `auth.refresh failed: server`).
 *
 * **The three preserved `Token` fields, each for its own reason:**
 *
 *  - `identityToken` — a refresh view may omit it (the SDK falls back to the token it already
 *    holds), but relay REQUIRES it: signed HTTP sends it as `x-lemon-identity` and the next register
 *    reads it back through `getIdentityToken()`.
 *  - `identityPoolId` — routinely omitted. Without this line the pool id is lost from the stored
 *    token after the first socket refresh, and the relay HTTP refresh's `identityPoolId` inheritance
 *    silently becomes a no-op. Pre-existing defect, surfaced by ADR-0070 Step 3 checklist 5.
 *  - `credential` — signed HTTP reads the credential from this stored token on every request. When a
 *    view carries none, keeping the previous one keeps requests signed until it lapses; dropping it
 *    would send them unsigned at once, and the credential clock (which reads it to tell a signature
 *    rejection from a network outage) would report "cannot measure".
 */
export const mergeRefreshedRelayToken = (
    stored: UserTokenView | null,
    view: UserTokenView & { Token: NonNullable<UserTokenView['Token']> }
): UserTokenView =>
    ({
        ...stored,
        ...view,
        $auth: (stored as (UserTokenView & WithAuth) | null)?.$auth?.id
            ? (stored as UserTokenView & WithAuth).$auth
            : (view as UserTokenView & WithAuth).$auth,
        Token: {
            ...view.Token,
            identityToken: view.Token.identityToken ?? stored?.Token?.identityToken,
            identityPoolId: view.Token.identityPoolId ?? stored?.Token?.identityPoolId,
            credential: view.Token.credential ?? stored?.Token?.credential,
        },
    }) as UserTokenView;

export const mergeRefreshedCloudToken = (stored: UserTokenView | null, view: UserTokenView): UserTokenView =>
    stored ? ({ ...stored, ...view } as UserTokenView) : view;
