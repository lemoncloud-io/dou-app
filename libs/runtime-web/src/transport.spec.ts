import { webTransportPorts } from './transport';

const setOnline = (value: boolean) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
const globals = window as unknown as { CHATIC_APP_PLATFORM?: string; WebSocket: unknown };

afterEach(() => {
    setOnline(true);
    delete globals.CHATIC_APP_PLATFORM;
});

describe('webTransportPorts — online', () => {
    it("reads the page's navigator.onLine", () => {
        const { online } = webTransportPorts();

        setOnline(false);
        expect(online.read()).toBe(false);
        setOnline(true);
        expect(online.read()).toBe(true);
    });

    it("calls the listener on the window's online and offline events, until unsubscribed", () => {
        const listener = jest.fn();
        const unsubscribe = webTransportPorts().online.subscribe(listener);

        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        window.dispatchEvent(new Event('offline'));
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe('webTransportPorts — device', () => {
    it('reads the shell-injected platform and the user agent', () => {
        globals.CHATIC_APP_PLATFORM = 'android';

        expect(webTransportPorts().device()).toEqual({ appPlatform: 'android', userAgent: navigator.userAgent });
    });

    it('reads no platform in a plain browser', () => {
        expect(webTransportPorts().device().appPlatform).toBeUndefined();
    });
});

describe('webTransportPorts — createSocket', () => {
    const original = globals.WebSocket;
    afterEach(() => {
        globals.WebSocket = original;
    });

    it("opens the page's own WebSocket with the url and protocols the SDK asks for", () => {
        const opened: unknown[][] = [];
        globals.WebSocket = class {
            constructor(...args: unknown[]) {
                opened.push(args);
            }
        };

        const socket = webTransportPorts().createSocket({ url: 'wss://example.test/', protocols: ['p'] });

        expect(socket).toBeInstanceOf(globals.WebSocket as new () => unknown);
        expect(opened).toEqual([['wss://example.test/', ['p']]]);
    });
});
