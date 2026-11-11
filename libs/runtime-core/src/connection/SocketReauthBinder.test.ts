import { SocketReauthBinder } from './SocketReauthBinder';
import { reauthenticateActiveSocket } from '@chatic/auth/socket/reauthenticateActiveSocket';
import type { RuntimeSocketSlots } from './types';
import type { SocketSessionDelegate } from '@chatic/auth/socket/types';
import type { ISocketManager } from '@chatic/transport';
import { RELAY_SLOT } from '@chatic/transport/socket/utils/slotKey';

jest.mock('@chatic/auth/socket/reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: jest.fn().mockResolvedValue(undefined),
}));

const mockedReauth = reauthenticateActiveSocket as jest.MockedFunction<typeof reauthenticateActiveSocket>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;
const manager = { id: 'manager' } as unknown as ISocketManager;

/** A watcher that has seen `slots` once; `pass` hands it the next ones. */
const start = (slots: RuntimeSocketSlots) => {
    const reauth = new SocketReauthBinder(manager);
    reauth.apply(slots, delegate);
    return { pass: (next: RuntimeSocketSlots) => reauth.apply(next, delegate) };
};

// The identity token lives on each slot (RuntimeSocketSlot.identityToken), never on a shared field —
// SocketReauthBinder watches each slot independently.
const relayOnly = (identityToken: string, socketUrl = 'wss://relay'): RuntimeSocketSlots => ({
    relay: { config: { url: socketUrl, deviceId: 'd', wssType: 'relay', cid: 'default' }, identityToken },
});

/** Cloud-active slots: relay is always-on (constant token), cloud is the active server. */
const withCloud = (
    cloudToken: string,
    cid: string,
    cloudUrl = 'wss://cloud',
    relayToken = 'relay-token'
): RuntimeSocketSlots => ({
    relay: {
        config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay', cid: 'default' },
        identityToken: relayToken,
    },
    cloud: { config: { url: cloudUrl, deviceId: 'd', wssType: 'cloud', cid }, identityToken: cloudToken },
});

describe('SocketReauthBinder', () => {
    beforeEach(() => jest.clearAllMocks());

    it('does not re-authenticate on its first pass', () => {
        start(relayOnly('guest-token'));
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('re-authenticates when the identity token changes on the same socket', () => {
        const { pass } = start(relayOnly('guest-token'));
        pass(relayOnly('social-token'));
        expect(mockedReauth).toHaveBeenCalledTimes(1);
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, slot: RELAY_SLOT }));
    });

    it('does NOT re-authenticate when the socket also changed (reboot handles register)', () => {
        const { pass } = start(relayOnly('guest-token', 'wss://relay'));
        // token AND socket url both change → SocketBinder reboots + bootstrap re-registers
        pass(relayOnly('cloud-token', 'wss://cloud'));
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('does not re-authenticate when the token is unchanged', () => {
        const { pass } = start(relayOnly('guest-token'));
        // a pass with the same identity token (e.g. sid-only change) must not re-auth
        pass(relayOnly('guest-token'));
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('cloud 슬롯은 어떤 경우에도 재인증하지 않는다 — 전환은 항상 wss를 바꿔 리부트된다', () => {
        // An earlier version of this test expected a same-wss cloud switch to reauthenticate. It only
        // passed because the fixture attached an identityToken to the cloud slot, which real binding
        // never does (a535055a) — it was making a path that's unreachable in production look
        // "supported".
        //
        // The actual invariant is this: a switch commits a different cid, and the cid is the slot's
        // key, so SocketBinder boots the incoming cloud as a new slot and tears the outgoing one down
        // — there's no live connection left to reauthenticate, whatever the two clouds' wss hosts.
        const { pass } = start(withCloud('cloud-a-token', 'cloud-a'));
        pass(withCloud('cloud-b-token', 'cloud-b'));
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('클라우드 활성 중 relay 토큰이 바뀌면 relay kind로 재인증한다 (#5 배경 슬롯 승격)', () => {
        // guest→social promotion while a cloud slot is the active socket: the cloud slot is unchanged,
        // only the (background) relay token swaps — the old active-only binder missed this entirely.
        const { pass } = start(withCloud('cloud-token', 'cloud-a', 'wss://cloud', 'guest-relay'));
        pass(withCloud('cloud-token', 'cloud-a', 'wss://cloud', 'social-relay'));
        expect(mockedReauth).toHaveBeenCalledTimes(1);
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, slot: RELAY_SLOT }));
    });

    it('does NOT re-authenticate a different-wss cloud switch (SocketBinder reboots that slot)', () => {
        const { pass } = start(withCloud('cloud-a-token', 'cloud-a', 'wss://cloud-a'));
        // wss differs → the cloud slot's reboot signature changes → reboot handles register.
        pass(withCloud('cloud-b-token', 'cloud-b', 'wss://cloud-b'));
        expect(mockedReauth).not.toHaveBeenCalled();
    });
});
