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
        socket: {
            relay: { config: { url: socketUrl, deviceId: 'd', wssType: 'relay', cid: 'default' }, identityToken },
        },
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
            relay: {
                config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay', cid: 'default' },
                identityToken: relayToken,
            },
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

    it('cloud 슬롯은 어떤 경우에도 재인증하지 않는다 — 전환은 항상 wss를 바꿔 리부트된다', () => {
        // 이 테스트의 이전 판은 같은-wss cloud 전환이 재인증되기를 기대했다. 성립한 이유는 픽스처가
        // cloud 슬롯에 identityToken을 실었기 때문인데, 실제 binding은 그러지 않는다(a535055a) —
        // 즉 프로덕션에서 도달 불가능한 경로를 "지원됨"으로 보이게 하고 있었다.
        //
        // 불변조건은 이쪽이다: 두 클라우드가 wss 호스트를 공유하지 않으므로(2026-09-02 확인) 전환은
        // 항상 URL을 바꾸고, 그러면 reboot 키가 움직여 SocketBinder가 슬롯을 다시 세운다 — 재인증할
        // 살아 있는 커넥션이 없다. 불변조건이 깨지는 경우는 SocketBinder의 같은-wss 가드가 보고한다.
        const { rerender } = render(
            <SocketReauthBinder binding={cloudBinding('cloud-a-token', 'cloud-a')} delegate={delegate} />
        );
        rerender(<SocketReauthBinder binding={cloudBinding('cloud-b-token', 'cloud-b')} delegate={delegate} />);
        expect(mockedReauth).not.toHaveBeenCalled();
    });

    it('클라우드 활성 중 relay 토큰이 바뀌면 relay kind로 재인증한다 (#5 배경 슬롯 승격)', () => {
        // guest→social promotion while a cloud slot is the active socket: the cloud slot is unchanged,
        // only the (background) relay token swaps — the old active-only binder missed this entirely.
        const { rerender } = render(
            <SocketReauthBinder
                binding={cloudBinding('cloud-token', 'cloud-a', 'wss://cloud', 'guest-relay')}
                delegate={delegate}
            />
        );
        rerender(
            <SocketReauthBinder
                binding={cloudBinding('cloud-token', 'cloud-a', 'wss://cloud', 'social-relay')}
                delegate={delegate}
            />
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
