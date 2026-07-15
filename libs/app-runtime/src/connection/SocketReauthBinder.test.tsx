import { render } from '@testing-library/react';

import { SocketReauthBinder } from './SocketReauthBinder';
import { reauthenticateActiveSocket } from '../socket';
import type { RuntimeBinding } from '../runtime';
import type { SocketSessionDelegate } from '../socket';

jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn().mockReturnValue({ id: 'manager' }),
}));

jest.mock('../socket', () => ({
    reauthenticateActiveSocket: jest.fn().mockResolvedValue(undefined),
}));

const mockedReauth = reauthenticateActiveSocket as jest.MockedFunction<typeof reauthenticateActiveSocket>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;

// The identity token now lives on each slot (RuntimeSocketSlot.identityToken), not on a shared
// `binding.auth` — SocketReauthBinder watches each slot independently.
const bindingWith = (identityToken: string, socketUrl = 'wss://relay'): RuntimeBinding =>
    ({
        context: { cid: 'default', sid: undefined, uid: 'u' },
        socket: { relay: { config: { url: socketUrl, deviceId: 'd', wssType: 'relay', cid: 'default' }, identityToken } },
    }) as unknown as RuntimeBinding;

/** A cloud-active binding: relay is always-on (constant token), cloud is the active server. */
const cloudBinding = (
    cloudToken: string,
    cid: string,
    cloudUrl = 'wss://cloud',
    relayToken = 'relay-token'
): RuntimeBinding =>
    ({
        context: { cid, sid: undefined, uid: 'u' },
        socket: {
            relay: { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay', cid: 'default' }, identityToken: relayToken },
            cloud: { config: { url: cloudUrl, deviceId: 'd', wssType: 'cloud', cid }, identityToken: cloudToken },
        },
    }) as unknown as RuntimeBinding;

describe('SocketReauthBinder', () => {
    beforeEach(() => jest.clearAllMocks());

    it('does not re-authenticate on first mount', () => {
        render(<SocketReauthBinder binding={bindingWith('guest-token')} delegate={delegate} />);
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('re-authenticates when the identity token changes on the same socket', () => {
        const { rerender } = render(<SocketReauthBinder binding={bindingWith('guest-token')} delegate={delegate} />);
        rerender(<SocketReauthBinder binding={bindingWith('social-token')} delegate={delegate} />);
        expect(mockedReauth).toHaveBeenCalledTimes(1);
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, kind: 'relay' }));
    });

    it('does NOT re-authenticate when the socket also changed (reboot handles register)', () => {
        const { rerender } = render(
            <SocketReauthBinder binding={bindingWith('guest-token', 'wss://relay')} delegate={delegate} />
        );
        // token AND socket url both change → SocketBinder reboots + bootstrap re-registers
        rerender(<SocketReauthBinder binding={bindingWith('cloud-token', 'wss://cloud')} delegate={delegate} />);
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('does not re-authenticate when the token is unchanged', () => {
        const { rerender } = render(<SocketReauthBinder binding={bindingWith('guest-token')} delegate={delegate} />);
        // a re-render with the same identity token (e.g. sid-only change) must not re-auth
        rerender(<SocketReauthBinder binding={bindingWith('guest-token')} delegate={delegate} />);
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('re-authenticates a same-wss cloud switch (cid changes, url stays) as the cloud kind (§8-4)', () => {
        // cloud→cloud on the same wss: the cloud token changes but only cid moves in the config, which
        // SocketBinder ignores (reboot key excludes cid) → this binder must re-register the cloud slot.
        const { rerender } = render(
            <SocketReauthBinder binding={cloudBinding('cloud-a-token', 'cloud-a')} delegate={delegate} />
        );
        rerender(<SocketReauthBinder binding={cloudBinding('cloud-b-token', 'cloud-b')} delegate={delegate} />);
        expect(mockedReauth).toHaveBeenCalledTimes(1);
        // cid is threaded through so reauthenticateActiveSocket can re-point boundCid (#1/§8-4).
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, kind: 'cloud', cid: 'cloud-b' }));
    });

    it('클라우드 활성 중 relay 토큰이 바뀌면 relay kind로 재인증한다 (#5 배경 슬롯 승격)', () => {
        // guest→social promotion while a cloud slot is the active socket: the cloud slot is unchanged,
        // only the (background) relay token swaps — the old active-only binder missed this entirely.
        const { rerender } = render(
            <SocketReauthBinder binding={cloudBinding('cloud-token', 'cloud-a', 'wss://cloud', 'guest-relay')} delegate={delegate} />
        );
        rerender(
            <SocketReauthBinder binding={cloudBinding('cloud-token', 'cloud-a', 'wss://cloud', 'social-relay')} delegate={delegate} />
        );
        expect(mockedReauth).toHaveBeenCalledTimes(1);
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, kind: 'relay' }));
    });

    it('does NOT re-authenticate a different-wss cloud switch (SocketBinder reboots that slot)', () => {
        const { rerender } = render(
            <SocketReauthBinder
                binding={cloudBinding('cloud-a-token', 'cloud-a', 'wss://cloud-a')}
                delegate={delegate}
            />
        );
        // wss differs → the cloud slot's reboot signature changes → reboot handles register.
        rerender(
            <SocketReauthBinder
                binding={cloudBinding('cloud-b-token', 'cloud-b', 'wss://cloud-b')}
                delegate={delegate}
            />
        );
        expect(mockedReauth).not.toHaveBeenCalled();
    });
});
