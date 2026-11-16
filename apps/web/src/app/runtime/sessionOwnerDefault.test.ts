import { sendSessionOwnerDefault, sendSessionOwnerDefaultUnasked, sessionOwnerDefault } from './sessionOwnerDefault';

const mockWarn = jest.fn();
jest.mock('@chatic/logger', () => ({ logger: { warn: (...args: unknown[]) => mockWarn(...args) } }));

describe('sessionOwnerDefault', () => {
    beforeEach(() => mockWarn.mockReset());

    it('logs a value that is set but not an owner', () => {
        expect(sessionOwnerDefault({ VITE_APP_SESSION_OWNER: 'Native' })).toBe(null);
        expect(mockWarn).toHaveBeenCalledWith('session.owner_default_unknown', expect.any(String), { named: 'Native' });
    });

    it.each([
        [{ VITE_APP_SESSION_OWNER: 'native' }, 'native'],
        [{ VITE_APP_SESSION_OWNER: 'web' }, 'web'],
        [{}, null],
        [{ VITE_APP_SESSION_OWNER: '' }, null],
        [{ VITE_APP_SESSION_OWNER: 'Native' }, null],
    ])('names %p as %p', (env, owner) => {
        expect(sessionOwnerDefault(env)).toBe(owner);
    });

    it('names the page when the build stops asking the shell, whatever else it says', () => {
        expect(sessionOwnerDefault({ VITE_APP_SESSION_OWNER: 'native', VITE_SESSION_MIRROR_DISABLED: 'true' })).toBe(
            'web'
        );
    });
});

describe('sendSessionOwnerDefault', () => {
    const bridge = () => ({ setDefaultSessionOwner: jest.fn().mockResolvedValue({ success: true }) });
    const supporting = { supportedWebMessages: ['WebAppReady', 'SetDefaultSessionOwner'] };

    beforeEach(() => mockWarn.mockReset());

    it('sends the named owner to an app that lists the request', async () => {
        const b = bridge();
        await sendSessionOwnerDefault(supporting, b, { VITE_APP_SESSION_OWNER: 'native' });
        expect(b.setDefaultSessionOwner).toHaveBeenCalledWith('native');
    });

    it('sends null when nothing is named, so an earlier default is cleared', async () => {
        const b = bridge();
        await sendSessionOwnerDefault(supporting, b, {});
        expect(b.setDefaultSessionOwner).toHaveBeenCalledWith(null);
    });

    it.each([[null], [{ supportedWebMessages: ['WebAppReady'] }]])(
        'sends nothing to %p — a browser, or an app from before the request',
        async report => {
            const b = bridge();
            await sendSessionOwnerDefault(report, b, { VITE_APP_SESSION_OWNER: 'native' });
            expect(b.setDefaultSessionOwner).not.toHaveBeenCalled();
        }
    );

    it('logs a refusal instead of throwing', async () => {
        const b = {
            setDefaultSessionOwner: jest.fn().mockResolvedValue({ success: false, error: { code: 'INTERNAL' } }),
        };
        await expect(sendSessionOwnerDefault(supporting, b, { VITE_APP_SESSION_OWNER: 'native' })).resolves.toBe(
            undefined
        );
        expect(mockWarn).toHaveBeenCalledWith('session.owner_default_refused', expect.any(String), {
            owner: 'native',
            code: 'INTERNAL',
        });
    });

    it('logs a failed request instead of throwing', async () => {
        const b = { setDefaultSessionOwner: jest.fn().mockRejectedValue(new Error('timeout')) };
        await expect(sendSessionOwnerDefault(supporting, b, {})).resolves.toBe(undefined);
        expect(mockWarn).toHaveBeenCalledWith('session.owner_default_failed', expect.any(String), {
            owner: null,
            error: 'Error: timeout',
        });
    });
});

describe('sendSessionOwnerDefaultUnasked', () => {
    it('sends the named owner without a handshake reply', async () => {
        const b = { setDefaultSessionOwner: jest.fn().mockResolvedValue({ success: true }) };
        await sendSessionOwnerDefaultUnasked(b, { VITE_APP_SESSION_OWNER: 'web' });
        expect(b.setDefaultSessionOwner).toHaveBeenCalledWith('web');
    });
});
