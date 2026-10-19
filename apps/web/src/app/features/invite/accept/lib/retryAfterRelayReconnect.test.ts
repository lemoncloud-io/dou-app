import { isSocketGone, retryAfterRelayReconnect } from './retryAfterRelayReconnect';

const socketClosed = () => new Error('499 CLIENT CLOSED REQUEST - socket closed - relay.request(invite.get)');
const notConnected = () => new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()');

describe('isSocketGone', () => {
    it('recognises a request that lost its socket', () => {
        expect(isSocketGone(socketClosed())).toBe(true);
        expect(isSocketGone(notConnected())).toBe(true);
    });

    it('does not treat a server answer, a timeout or a non-error as one', () => {
        expect(isSocketGone(new Error('404 NOT FOUND - invite.get:error'))).toBe(false);
        expect(isSocketGone(Object.assign(new Error('@code is invalid'), { errorCode: 400 }))).toBe(false);
        expect(isSocketGone(new Error('408 REQUEST TIMEOUT - invite.get'))).toBe(false);
        expect(isSocketGone(null)).toBe(false);
    });
});

describe('retryAfterRelayReconnect', () => {
    const waitForRelay = jest.fn(() => Promise.resolve(true));

    beforeEach(() => waitForRelay.mockClear());

    it('returns the first success without waiting', async () => {
        const task = jest.fn().mockResolvedValue('ok');

        await expect(retryAfterRelayReconnect(task, { waitForRelay })).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(1);
        expect(waitForRelay).not.toHaveBeenCalled();
    });

    it('waits for the relay and runs the task again after the socket closed under it', async () => {
        const onRetry = jest.fn();
        const lost = socketClosed();
        const task = jest.fn().mockRejectedValueOnce(lost).mockResolvedValue('ok');

        await expect(retryAfterRelayReconnect(task, { waitForRelay, onRetry })).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(2);
        expect(waitForRelay).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(lost);
        // The retry waits for the relay: it never goes out before the wait has resolved.
        expect(waitForRelay.mock.invocationCallOrder[0]).toBeLessThan(task.mock.invocationCallOrder[1]);
    });

    it('retries only once, throwing the second failure', async () => {
        const second = notConnected();
        const task = jest.fn().mockRejectedValueOnce(socketClosed()).mockRejectedValueOnce(second);

        await expect(retryAfterRelayReconnect(task, { waitForRelay })).rejects.toBe(second);
        expect(task).toHaveBeenCalledTimes(2);
    });

    it('throws any other failure at once', async () => {
        const refused = new Error('404 NOT FOUND - invite.get:error');
        const task = jest.fn().mockRejectedValue(refused);

        await expect(retryAfterRelayReconnect(task, { waitForRelay })).rejects.toBe(refused);
        expect(task).toHaveBeenCalledTimes(1);
        expect(waitForRelay).not.toHaveBeenCalled();
    });

    it('throws the original failure when the relay did not come back within the wait', async () => {
        const lost = socketClosed();
        const task = jest.fn().mockRejectedValue(lost);
        waitForRelay.mockResolvedValueOnce(false);

        await expect(retryAfterRelayReconnect(task, { waitForRelay })).rejects.toBe(lost);
        expect(task).toHaveBeenCalledTimes(1);
    });

    it('throws the original failure when the caller no longer wants the retry', async () => {
        const lost = socketClosed();
        const task = jest.fn().mockRejectedValue(lost);

        await expect(retryAfterRelayReconnect(task, { waitForRelay, shouldRetry: () => false })).rejects.toBe(lost);
        expect(task).toHaveBeenCalledTimes(1);
    });
});
