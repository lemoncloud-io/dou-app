import {
    clearResumeKick,
    noteResumeKick,
    observeSocketVerify,
    resetSocketVerifyTrace,
    SOCKET_VERIFY_SAMPLES_PER_MINUTE,
} from './socketVerifyTrace';
import { slotKeyOf } from '../utils/slotKey';

type Listener<T> = (value: T) => void;

/** A client whose state, messages and auth state the test drives by hand. */
const fakeSocket = (initialState?: string) => {
    const state = new Set<Listener<{ next: string }>>();
    const message = new Set<Listener<{ message?: { type?: string } }>>();
    const authState = new Set<Listener<string>>();
    const on =
        <T>(set: Set<Listener<T>>) =>
        (listener: Listener<T>) => {
            set.add(listener);
            return () => set.delete(listener);
        };
    return {
        client: { onState: on(state), onMessage: on(message), state: initialState } as never,
        auth: { onAuthState: on(authState) },
        moveTo: (next: string) => state.forEach(listener => listener({ next })),
        receive: (type: string) => message.forEach(listener => listener({ message: { type } })),
        authenticate: (value = 'authenticated') => authState.forEach(listener => listener(value)),
    };
};

const CLOUD = slotKeyOf('cloud-a');

describe('observeSocketVerify', () => {
    let now = 0;
    let hidden = false;
    let hides = 0;
    const record = jest.fn();
    const observe = (socket: ReturnType<typeof fakeSocket>, isHidden = () => hidden) =>
        observeSocketVerify({
            key: CLOUD,
            client: socket.client,
            auth: socket.auth,
            now: () => now,
            record,
            isHidden,
            hideCount: () => hides,
        });

    beforeEach(() => {
        now = 0;
        hidden = false;
        hides = 0;
        record.mockClear();
        resetSocketVerifyTrace();
    });

    it('records the phases of an attempt from connecting to verified', () => {
        const socket = fakeSocket();
        observe(socket);

        now = 100;
        socket.moveTo('connecting');
        now = 180;
        socket.moveTo('connected');
        now = 260;
        socket.receive('device.save:ok');
        now = 410;
        socket.authenticate();

        expect(record).toHaveBeenCalledWith('socket_verify', {
            attributes: { kind: 'cloud', cause: 'bind', outcome: 'verified' },
            metrics: { value_ms: 310, connected_ms: 80, device_ms: 160 },
        });
    });

    it('records an attempt that closed before it was verified, with only the phases it reached', () => {
        const socket = fakeSocket();
        observe(socket);

        socket.moveTo('connecting');
        now = 50;
        socket.moveTo('connected');
        now = 3000;
        socket.moveTo('closed');

        expect(record).toHaveBeenCalledWith('socket_verify', {
            attributes: { kind: 'cloud', cause: 'bind', outcome: 'closed' },
            metrics: { value_ms: 3000, connected_ms: 50 },
        });
    });

    it('names later attempts reconnects, and the one a wake recovery forced a resume', () => {
        const socket = fakeSocket();
        observe(socket);
        const causes = () => record.mock.calls.map(([, sample]) => sample.attributes.cause);

        socket.moveTo('connecting');
        socket.authenticate();
        socket.moveTo('closed');
        socket.moveTo('connecting');
        socket.authenticate();
        noteResumeKick(CLOUD);
        socket.moveTo('closed');
        socket.moveTo('connecting');
        socket.authenticate();

        expect(causes()).toEqual(['bind', 'reconnect', 'resume']);
    });

    it('records nothing for a re-authentication on a live connection', () => {
        const socket = fakeSocket();
        observe(socket);
        socket.moveTo('connecting');
        socket.authenticate();
        record.mockClear();

        // A token refresh or a re-register on the open socket: no new connection attempt.
        socket.authenticate();

        expect(record).not.toHaveBeenCalled();
    });

    it('records nothing while the page is hidden', () => {
        const socket = fakeSocket();
        observe(socket, () => true);

        socket.moveTo('connecting');
        socket.authenticate();

        expect(record).not.toHaveBeenCalled();
    });

    it('records nothing for an attempt the page was hidden during', () => {
        const socket = fakeSocket();
        observe(socket);

        socket.moveTo('connecting');
        // The app goes to the background and comes back before the attempt ends.
        hides += 1;
        now = 60_000;
        socket.authenticate();

        expect(record).not.toHaveBeenCalled();
    });

    it('records nothing for an attempt that started while the page was hidden', () => {
        const socket = fakeSocket();
        observe(socket);

        hidden = true;
        socket.moveTo('connecting');
        hidden = false;
        socket.authenticate();

        expect(record).not.toHaveBeenCalled();
    });

    it('ends an attempt whose auth expired while the socket stayed open', () => {
        const socket = fakeSocket();
        observe(socket);

        socket.moveTo('connecting');
        socket.moveTo('connected');
        now = 900;
        socket.authenticate('expired');

        expect(record).toHaveBeenCalledWith('socket_verify', {
            attributes: { kind: 'cloud', cause: 'bind', outcome: 'expired' },
            metrics: { value_ms: 900, connected_ms: 0 },
        });
    });

    it('replaces the observer of a client booted again, so its attempts are recorded once', () => {
        const socket = fakeSocket();
        observe(socket);
        observe(socket);

        socket.moveTo('connecting');
        socket.authenticate();

        expect(record).toHaveBeenCalledTimes(1);
    });

    it("names a reused, already-live client's next attempt a reconnect", () => {
        const socket = fakeSocket('connected');
        observe(socket);

        socket.moveTo('closed');
        socket.moveTo('connecting');
        socket.authenticate();

        expect(record.mock.calls[0][1].attributes).toMatchObject({ cause: 'reconnect' });
    });

    it('forgets a resume mark that was cleared before any attempt used it', () => {
        const socket = fakeSocket();
        observe(socket);
        socket.moveTo('connecting');
        socket.authenticate();

        noteResumeKick(CLOUD);
        clearResumeKick(CLOUD);
        socket.moveTo('closed');
        socket.moveTo('connecting');
        socket.authenticate();

        expect(record.mock.calls.map(([, sample]) => sample.attributes.cause)).toEqual(['bind', 'reconnect']);
    });

    it('caps the samples a minute across slots, and starts again in the next minute', () => {
        const sockets = [fakeSocket(), fakeSocket()];
        sockets.forEach(socket => observe(socket));
        const connectAll = () =>
            sockets.forEach(socket => {
                socket.moveTo('connecting');
                socket.authenticate();
                socket.moveTo('closed');
            });

        for (let i = 0; i < SOCKET_VERIFY_SAMPLES_PER_MINUTE; i++) connectAll();
        expect(record).toHaveBeenCalledTimes(SOCKET_VERIFY_SAMPLES_PER_MINUTE);

        now = 60_000;
        connectAll();
        expect(record).toHaveBeenCalledTimes(SOCKET_VERIFY_SAMPLES_PER_MINUTE + 2);
    });

    it('stops listening when its cleanup runs', () => {
        const socket = fakeSocket();
        const stop = observe(socket);

        stop();
        socket.moveTo('connecting');
        socket.authenticate();

        expect(record).not.toHaveBeenCalled();
    });
});
