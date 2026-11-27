import { readSessionDeviceId } from '@chatic/runtime/api';
import type { RuntimeEngine } from '@chatic/runtime/engine';

export const startConnection = (engine: RuntimeEngine, deviceId: () => string = readSessionDeviceId): (() => void) => {
    const stops: (() => void)[] = [];
    const session = engine.sessionController({ deviceId });
    const connection = engine.connectionController({ deviceId });
    void session.initialize();
    stops.push(connection.startBackground());
    let socketsStarted = false;
    const startSockets = (): void => {
        if (socketsStarted || !session.isReady()) return;
        socketsStarted = true;
        stops.push(connection.startSockets());
    };
    stops.push(session.subscribeReady(startSockets));
    startSockets();
    return () => {
        stops.reverse().forEach(stop => stop());
        stops.length = 0;
    };
};
