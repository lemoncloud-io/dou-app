import { render } from '@testing-library/react';

import { SocketBinder } from './SocketBinder';
import { bootstrapSocketConnection } from '../socket';
import { getSocketManager } from '../socket/runtime';
import type { RuntimeBinding } from '../runtime';
import type { SocketSessionDelegate } from '../socket';

import { logger } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const destroy = jest.fn();
jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn(),
}));

jest.mock('../socket', () => ({
    bootstrapSocketConnection: jest.fn(),
}));

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;

const relaySlot = { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay' as const, cid: 'default' } };
const cloudSlot = { config: { url: 'wss://cloud', deviceId: 'd', wssType: 'cloud' as const, cid: 'my-cloud' } };

const bindingOf = (socket: RuntimeBinding['socket']): RuntimeBinding =>
    ({ context: { cid: 'default', sid: undefined, uid: 'u' }, socket, auth: undefined }) as unknown as RuntimeBinding;

describe('SocketBinder (dual slots)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
        mockedGetManager.mockReturnValue({ destroy } as never);
    });

    const configsBooted = () => mockedBootstrap.mock.calls.map(call => call[0].config);

    it('relay-only: boots relay and tears down the absent cloud slot', async () => {
        render(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

        expect(configsBooted()).toEqual([relaySlot.config]);
        expect(destroy).toHaveBeenCalledWith('cloud');
        expect(destroy).not.toHaveBeenCalledWith('relay');
    });

    it('cloud active: boots BOTH relay and cloud independently', async () => {
        render(<SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />);

        expect(configsBooted()).toEqual(expect.arrayContaining([relaySlot.config, cloudSlot.config]));
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('leaving a cloud tears down ONLY cloud; the relay slot is never rebooted', async () => {
        const { rerender } = render(
            <SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />
        );
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);

        mockedBootstrap.mockClear();
        rerender(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

        // relay's reboot key is unchanged → no re-bootstrap; only cloud is destroyed.
        expect(mockedBootstrap).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledWith('cloud');
        expect(destroy).not.toHaveBeenCalledWith('relay');
    });

    describe('같은-wss 클라우드 전환 가드', () => {
        // 불변조건: 클라우드끼리 wss 호스트를 공유하지 않으므로 전환은 항상 URL을 바꾼다. 위반은
        // 조용하다 — 소켓이 살아 있는 채 나가는 클라우드의 신원을 계속 쓴다 — 그래서 이름을 붙인다.
        const sameWssOtherCloud = {
            config: { url: 'wss://cloud', deviceId: 'd', wssType: 'cloud' as const, cid: 'other-cloud' },
        };

        it('reboot 키가 그대로인데 커밋된 cid가 바뀌면 에러로 보고한다', () => {
            const { rerender } = render(
                <SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />
            );

            rerender(
                <SocketBinder binding={bindingOf({ relay: relaySlot, cloud: sameWssOtherCloud })} delegate={delegate} />
            );

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
                <SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />
            );

            rerender(<SocketBinder binding={bindingOf({ relay: relaySlot, cloud: otherWss })} delegate={delegate} />);

            expect(logger.error).not.toHaveBeenCalled();
        });

        it('슬롯이 켜지거나 꺼지는 것은 전환이 아니다', () => {
            const { rerender } = render(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

            rerender(<SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />);
            rerender(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

            expect(logger.error).not.toHaveBeenCalled();
        });
    });
});
