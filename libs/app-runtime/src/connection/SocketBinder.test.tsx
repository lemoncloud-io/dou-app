import { render } from '@testing-library/react';

import { SocketBinder } from './SocketBinder';
import { bootstrapSocketConnection } from '../socket';
import { getSocketManager } from '../socket/runtime';
import type { SocketSessionDelegate } from '../socket';
import { RELAY_SLOT, slotKeyOf } from '../socket/utils/slotKey';

import { logger } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const destroy = jest.fn();
jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn(),
}));

// The binder reaches the sync engine so it exists before slots bind; the assertion here is only that
// a slot boots, so the engine itself is stubbed.
jest.mock('../socket/sync/runtime', () => ({
    getSyncManager: jest.fn(),
}));

jest.mock('../socket', () => ({
    bootstrapSocketConnection: jest.fn(),
}));

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;

const relaySlot = { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay' as const, cid: 'default' } };
const cloudSlot = { config: { url: 'wss://cloud', deviceId: 'd', wssType: 'cloud' as const, cid: 'my-cloud' } };

describe('SocketBinder (dual slots)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
        mockedGetManager.mockReturnValue({ destroy } as never);
    });

    const configsBooted = () => mockedBootstrap.mock.calls.map(call => call[0].config);

    // Slots are now keyed by the cloud they serve, and the binder only destroys a slot it has
    // actually booted (bootedSlotRef) — not "whichever kind is absent" as before. On a fresh mount
    // with no cloud slot in props, the cloud role never booted anything, so there is nothing to tear
    // down; the manager never held that slot in the first place, and the previous unconditional
    // `destroy('cloud')` on mount was a no-op against it anyway. Assertion changed accordingly:
    // "destroy called with 'cloud' / not called with 'relay'" no longer holds (destroy isn't called
    // at all here) — replaced with the current, meaningful claim.
    it('relay-only: boots relay; no cloud slot ever existed, so nothing is torn down', async () => {
        render(<SocketBinder slots={{ relay: relaySlot }} delegate={delegate} />);

        expect(configsBooted()).toEqual([relaySlot.config]);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('cloud active: boots BOTH relay and cloud independently', async () => {
        render(<SocketBinder slots={{ relay: relaySlot, cloud: cloudSlot }} delegate={delegate} />);

        expect(configsBooted()).toEqual(expect.arrayContaining([relaySlot.config, cloudSlot.config]));
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('leaving a cloud tears down ONLY cloud; the relay slot is never rebooted', async () => {
        const { rerender } = render(
            <SocketBinder slots={{ relay: relaySlot, cloud: cloudSlot }} delegate={delegate} />
        );
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);

        mockedBootstrap.mockClear();
        rerender(<SocketBinder slots={{ relay: relaySlot }} delegate={delegate} />);

        // relay's reboot key is unchanged → no re-bootstrap; only cloud is destroyed. Cloud DID boot
        // above, so its slot key ('my-cloud') is the one torn down — relay's (RELAY_SLOT) never is.
        expect(mockedBootstrap).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledWith(slotKeyOf('my-cloud'));
        expect(destroy).not.toHaveBeenCalledWith(RELAY_SLOT);
    });

    describe('같은-wss 클라우드 전환 가드', () => {
        // Invariant: clouds never share a wss host, so a switch always changes the URL. A violation
        // is silent — the socket stays alive and keeps using the outgoing cloud's identity — which is
        // why this case gets a name.
        const sameWssOtherCloud = {
            config: { url: 'wss://cloud', deviceId: 'd', wssType: 'cloud' as const, cid: 'other-cloud' },
        };

        it('reboot 키가 그대로인데 커밋된 cid가 바뀌면 에러로 보고한다', () => {
            const { rerender } = render(
                <SocketBinder slots={{ relay: relaySlot, cloud: cloudSlot }} delegate={delegate} />
            );

            rerender(<SocketBinder slots={{ relay: relaySlot, cloud: sameWssOtherCloud }} delegate={delegate} />);

            expect(logger.error).toHaveBeenCalledWith(
                'SOCKET',
                expect.stringContaining('same-wss cloud switch'),
                expect.objectContaining({ data: expect.objectContaining({ from: 'my-cloud', to: 'other-cloud' }) })
            );
        });

        it('URL이 바뀌는 정상 전환은 보고하지 않는다 — 그건 리부트 경로가 처리한다', () => {
            const otherWss = {
                config: { url: 'wss://cloud-2', deviceId: 'd', wssType: 'cloud' as const, cid: 'other-cloud' },
            };
            const { rerender } = render(
                <SocketBinder slots={{ relay: relaySlot, cloud: cloudSlot }} delegate={delegate} />
            );

            rerender(<SocketBinder slots={{ relay: relaySlot, cloud: otherWss }} delegate={delegate} />);

            expect(logger.error).not.toHaveBeenCalled();
        });

        it('슬롯이 켜지거나 꺼지는 것은 전환이 아니다', () => {
            const { rerender } = render(<SocketBinder slots={{ relay: relaySlot }} delegate={delegate} />);

            rerender(<SocketBinder slots={{ relay: relaySlot, cloud: cloudSlot }} delegate={delegate} />);
            rerender(<SocketBinder slots={{ relay: relaySlot }} delegate={delegate} />);

            expect(logger.error).not.toHaveBeenCalled();
        });
    });
});
