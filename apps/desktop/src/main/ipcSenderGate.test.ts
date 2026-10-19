import { fromTrustedFrame } from './ipcSenderGate';
import { initWebUrl } from './webUrl';

const REMOTE = 'https://desktop.chatic.io';

const frame = (url: string) => ({ senderFrame: { url } });

describe('fromTrustedFrame', () => {
    type Result = 'refused' | { senderUrl: string; raw: unknown };
    const handler = jest.fn((senderUrl: string, raw: unknown): Result => ({ senderUrl, raw }));
    const gated = fromTrustedFrame((): Result => 'refused', handler);

    beforeEach(() => {
        handler.mockClear();
        initWebUrl(REMOTE);
    });

    it('runs the handler with the sender URL and arguments for a frame on the trusted origin', () => {
        expect(gated(frame(`${REMOTE}/chat/1`), { action: 'read' })).toEqual({
            senderUrl: `${REMOTE}/chat/1`,
            raw: { action: 'read' },
        });
    });

    // Any page the window navigates to — or an iframe inside a trusted one — can reach
    // ipcRenderer through the preload; the handler must never see its message.
    it.each([
        ['another origin', frame('https://evil.example.com/')],
        ['a lookalike host', frame('https://desktop.chatic.io.evil.com/')],
        ['a scheme downgrade', frame('http://desktop.chatic.io/')],
        ['the data: URL of the splash page', frame('data:text/html,<p>loading</p>')],
        ['a frame that is already gone', { senderFrame: null }],
        ['an event without a frame', {}],
    ])('answers %s with the untrusted result and does not run the handler', (_name, event) => {
        expect(gated(event, { action: 'set' })).toBe('refused');
        expect(handler).not.toHaveBeenCalled();
    });

    it('follows the trusted origin when the shell is re-pointed', () => {
        initWebUrl('https://other.example.com');

        expect(gated(frame(`${REMOTE}/`), {})).toBe('refused');
        expect(gated(frame('https://other.example.com/'), {})).toEqual({
            senderUrl: 'https://other.example.com/',
            raw: {},
        });
    });
});
