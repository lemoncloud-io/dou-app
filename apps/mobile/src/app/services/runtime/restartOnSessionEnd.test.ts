import { restartOnSessionEnd } from './restartOnSessionEnd';

const fakeHost = () => {
    const listeners = new Set<(params: URLSearchParams) => void>();
    return {
        onSessionEnded: (listener: (params: URLSearchParams) => void) => {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        end: (params: URLSearchParams) => listeners.forEach(listener => listener(params)),
        size: () => listeners.size,
    };
};

describe('restartOnSessionEnd', () => {
    it('restarts the JS context with the address the session ended with', () => {
        const host = fakeHost();
        const restart = { restart: jest.fn().mockResolvedValue(true) };
        restartOnSessionEnd(host, restart);

        host.end(new URLSearchParams({ logout: '1', reason: 'logout' }));

        expect(restart.restart).toHaveBeenCalledWith({ reason: 'session-ended', homeSearch: 'logout=1&reason=logout' });
    });

    it('does nothing before a session ends, and stops listening when asked', () => {
        const host = fakeHost();
        const restart = { restart: jest.fn() };
        const stop = restartOnSessionEnd(host, restart);

        expect(restart.restart).not.toHaveBeenCalled();
        stop();
        host.end(new URLSearchParams({ logout: '1' }));

        expect(host.size()).toBe(0);
        expect(restart.restart).not.toHaveBeenCalled();
    });
});
