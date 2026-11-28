import type { RuntimeEngine } from '@chatic/runtime/engine';

import { startConnection } from './connection';

const fake = (ready: boolean) => {
    const stopBackground = jest.fn();
    const stopSockets = jest.fn();
    const stopReady = jest.fn();
    let onReady: () => void = () => undefined;
    const state = { ready };
    const connection = { startBackground: jest.fn(() => stopBackground), startSockets: jest.fn(() => stopSockets) };
    const session = {
        initialize: jest.fn(async () => undefined),
        isReady: () => state.ready,
        subscribeReady: jest.fn((listener: () => void) => {
            onReady = listener;
            return stopReady;
        }),
    };
    const engine = {
        sessionController: () => session,
        connectionController: () => connection,
    } as unknown as RuntimeEngine;
    return { engine, connection, session, state, stopBackground, stopSockets, stopReady, fire: () => onReady() };
};

describe('startConnection', () => {
    it('starts the sockets at once when the session is ready, and stops everything once', () => {
        const f = fake(true);
        const stop = startConnection(f.engine, () => 'd1');
        expect(f.session.initialize).toHaveBeenCalledTimes(1);
        expect(f.connection.startBackground).toHaveBeenCalledTimes(1);
        expect(f.connection.startSockets).toHaveBeenCalledTimes(1);
        stop();
        stop();
        expect(f.stopSockets).toHaveBeenCalledTimes(1);
        expect(f.stopBackground).toHaveBeenCalledTimes(1);
        expect(f.stopReady).toHaveBeenCalledTimes(1);
    });

    it('waits for the session and starts the sockets only once', () => {
        const f = fake(false);
        startConnection(f.engine, () => 'd1');
        expect(f.connection.startSockets).not.toHaveBeenCalled();
        f.state.ready = true;
        f.fire();
        f.fire();
        expect(f.connection.startSockets).toHaveBeenCalledTimes(1);
    });
});
