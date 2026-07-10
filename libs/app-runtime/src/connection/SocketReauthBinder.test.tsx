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

const bindingWith = (identityToken: string | undefined, socketUrl = 'wss://relay'): RuntimeBinding =>
    ({
        context: { cid: 'default', sid: undefined, uid: 'u' },
        socket: socketUrl
            ? { relay: { config: { url: socketUrl, deviceId: 'd', wssType: 'relay', cid: 'default' } } }
            : {},
        auth: { kind: 'relay', siteId: undefined, identityToken },
    }) as unknown as RuntimeBinding;

/** A cloud-active binding: relay is always-on, cloud is the active server. */
const cloudBinding = (identityToken: string, cid: string, cloudUrl = 'wss://cloud'): RuntimeBinding =>
    ({
        context: { cid, sid: undefined, uid: 'u' },
        socket: {
            relay: { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay', cid: 'default' } },
            cloud: { config: { url: cloudUrl, deviceId: 'd', wssType: 'cloud', cid } },
        },
        auth: { kind: 'cloud', siteId: undefined, identityToken },
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
        expect(mockedReauth).toHaveBeenCalledWith(expect.objectContaining({ delegate, kind: 'cloud' }));
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
