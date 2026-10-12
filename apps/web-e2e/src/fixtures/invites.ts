import { GUEST } from './guest';
import { MINA } from './rooms';

/**
 * Invitations, and the links that carry them in. Every code is invented; none was issued by a server.
 */

/** A relay 1:1 invite code as the relay issues one (`invt:<id>:<code>`). */
export const RELAY_INVITE_CODE = 'invt:e2e-invite-1:E2ESECRET';

/**
 * The path the app hands the web for a relay invite link (`/s?code=…&relay`), after its converter
 * has expanded it (`convertShortUrlWithEnvsSync`): the home route with the invite markers.
 */
export const relayInvitePath = (code: string = RELAY_INVITE_CODE): string =>
    `/?code=${encodeURIComponent(code)}&provider=invite&version=2&relay=1`;

/** `invite.get` for a pending relay invite from Mina, valid for a day from the guest's first launch. */
export const pendingRelayInvite = () => ({
    id: 'e2e-invite-1',
    state: 'pending',
    inviter$: { id: MINA.uid, name: MINA.nick },
    name: 'Guest',
    siteId: GUEST.sid,
    // Far ahead of any run, so the countdown never reaches zero mid-scenario.
    expiredAt: 4_102_444_800_000,
    needVerify: true,
});
