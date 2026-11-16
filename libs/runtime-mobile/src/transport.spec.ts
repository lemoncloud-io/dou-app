import { nativeOnlineSignal, nativeSocketFactory, nativeTransportPorts } from './transport';

import type { NetInfoSource } from './transport';

// Kept outside a jest mock, so `clearAllMocks` between tests does not forget the process's listener.
const mockNetInfoListeners: unknown[] = [];
jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: (listener: unknown) => mockNetInfoListeners.push(listener) },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

type Report = (state: { isConnected: boolean | null }) => void;

/** A NetInfo stand-in whose reports the test sends. */
const fakeNetInfo = () => {
    let report: Report = () => undefined;
    const source = {
        addEventListener: jest.fn((listener: Report) => {
            report = listener;
            return () => undefined;
        }),
    } as unknown as NetInfoSource;
    return { source, report: (isConnected: boolean | null) => report({ isConnected }) };
};

beforeEach(() => jest.clearAllMocks());

describe('nativeOnlineSignal', () => {
    it('answers online before NetInfo has reported anything', () => {
        const { source } = fakeNetInfo();

        expect(nativeOnlineSignal(source).read()).toBe(true);
    });

    it('follows the connection NetInfo reports, and tells subscribers when it changes', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);
        const listener = jest.fn();
        signal.subscribe(listener);

        netInfo.report(false);
        expect(signal.read()).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);

        netInfo.report(true);
        expect(signal.read()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('tells subscribers when the first report is already offline', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);
        const listener = jest.fn();
        signal.subscribe(listener);

        netInfo.report(false);

        expect(signal.read()).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stays online when NetInfo cannot tell', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);

        netInfo.report(null);

        expect(signal.read()).toBe(true);
    });

    it('does not call subscribers for a report that changes nothing', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);
        const listener = jest.fn();
        signal.subscribe(listener);

        netInfo.report(true);
        netInfo.report(null);

        expect(listener).not.toHaveBeenCalled();
    });

    it('stops calling a subscriber once it unsubscribes, and keeps calling the others', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);
        const gone = jest.fn();
        const kept = jest.fn();
        const unsubscribe = signal.subscribe(gone);
        signal.subscribe(kept);

        unsubscribe();
        netInfo.report(false);

        expect(gone).not.toHaveBeenCalled();
        expect(kept).toHaveBeenCalledTimes(1);
    });

    it('listens to NetInfo once, however many subscribers come and go', () => {
        const netInfo = fakeNetInfo();
        const signal = nativeOnlineSignal(netInfo.source);

        signal.subscribe(jest.fn())();
        signal.subscribe(jest.fn());

        expect(netInfo.source.addEventListener).toHaveBeenCalledTimes(1);
    });
});

describe('nativeSocketFactory', () => {
    it("opens the socket with the device's user agent as the handshake's User-Agent", () => {
        const Socket = jest.fn();
        const createSocket = nativeSocketFactory('DoU/1.0 (DOU_IOS)', Socket as never);

        const socket = createSocket({ url: 'wss://relay.example/ws?v2=', protocols: ['chat'] });

        expect(Socket).toHaveBeenCalledWith('wss://relay.example/ws?v2=', ['chat'], {
            headers: { 'User-Agent': 'DoU/1.0 (DOU_IOS)' },
        });
        expect(socket).toBe(Socket.mock.instances[0]);
    });

    it('opens the global WebSocket in place when the socket is opened, not when the factory was made', () => {
        const globalRef = globalThis as { WebSocket?: unknown };
        const previous = globalRef.WebSocket;
        const createSocket = nativeSocketFactory('ua');
        const Socket = jest.fn();
        globalRef.WebSocket = Socket;
        try {
            createSocket({ url: 'wss://relay.example/ws' });
        } finally {
            globalRef.WebSocket = previous;
        }

        expect(Socket).toHaveBeenCalledWith('wss://relay.example/ws', undefined, { headers: { 'User-Agent': 'ua' } });
    });
});

describe('nativeTransportPorts', () => {
    it("describes the device by the OS and the app's user agent — the string the socket sends", () => {
        const ports = nativeTransportPorts({ userAgent: 'DoU/1.0 (DOU_IOS)' });

        expect(ports.device()).toEqual({ appPlatform: 'ios', userAgent: 'DoU/1.0 (DOU_IOS)' });
    });

    it('reads the network from one NetInfo listener for the process, however often it is built', () => {
        const first = nativeTransportPorts({ userAgent: 'ua' });
        const second = nativeTransportPorts({ userAgent: 'ua' });

        expect(mockNetInfoListeners).toHaveLength(1);
        expect(second.online).toBe(first.online);

        (mockNetInfoListeners[0] as Report)({ isConnected: false });
        expect(first.online.read()).toBe(false);
    });
});
