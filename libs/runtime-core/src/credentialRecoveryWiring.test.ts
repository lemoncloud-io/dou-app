/**
 * @jest-environment jsdom
 *
 * A page, because this case drives one: the fixtures read `window.location`, `localStorage` or the
 * document's visibility (through `@chatic/perf`). The package's own tests run in `node` otherwise.
 */
import { MemoryStore } from '@chatic/storage';
import { credentialRecovery } from '@chatic/transport/http/credentialRecovery';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { fakeAuthPorts } from '@chatic/auth/testing/platform';
import { createRuntime } from './createRuntime';

const mockRequestSessionRefresh = jest.fn();

jest.mock('@chatic/auth/socket/requestRelaySessionRefresh', () => ({
    requestRelaySessionRefresh: (...a: unknown[]) => mockRequestSessionRefresh(...a),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockRequestSessionRefresh.mockResolvedValue(true);
});

describe('부팅 전', () => {
    it('복구는 false다 — 미등록이 깨진 상태가 아니라 안전한 상태다', async () => {
        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);

        expect(mockRequestSessionRefresh).not.toHaveBeenCalled();
    });
});

describe('after createRuntime — the credential recovery wiring', () => {
    beforeAll(() => {
        createRuntime({
            storage: { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() },
            transport: fakeTransportPorts(),
            auth: fakeAuthPorts(),
            foreground: { read: () => true, subscribe: () => () => undefined },
            cache: {} as never,
        });
    });

    it.each(['relay', 'oauth', 'iap'] as const)('%s는 소켓 refresh로 간다', async route => {
        await expect(credentialRecovery.recover(route)).resolves.toBe(true);

        expect(mockRequestSessionRefresh).toHaveBeenCalledWith();
    });

    it('복구가 실패하면 false를 그대로 전달한다', async () => {
        mockRequestSessionRefresh.mockResolvedValue(false);

        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });
});
