import { GUEST } from './guest';
import { MINA } from './rooms';

export const RELAY_INVITE_CODE = 'invt:e2e-invite-1:E2ESECRET';

export const relayInvitePath = (code: string = RELAY_INVITE_CODE): string =>
    `/?code=${encodeURIComponent(code)}&provider=invite&version=2&relay=1`;

export const pendingRelayInvite = () => ({
    id: 'e2e-invite-1',
    state: 'pending',
    inviter$: { id: MINA.uid, name: MINA.nick, nick: MINA.nick },
    name: 'Guest',
    siteId: GUEST.sid,
    expiredAt: 4_102_444_800_000,
    needVerify: true,
});
