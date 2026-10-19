import type { HandlerContext } from '@lemoncloud/hybrid-shell';

import handlers, { APPLE_SIGN_IN_UNSUPPORTED } from './handlers';
import { mobileRoutes } from './routes';

/** The shell's side of a call, with only what these handlers read. */
const context = (platform: 'ios' | 'android' = 'ios') => {
    const lines: Array<{ source: string; type: string }> = [];
    const signIn = vi.fn(async () => ({ provider: 'google' as const, platform, idToken: 'id-token' }));
    const shell = {
        device: { platform },
        app: { state: () => 'background' },
        store: new Map<string, unknown>(),
        log: { append: (line: { source: string; type: string }) => void lines.push(line) },
        auth: { signIn },
    } as unknown as HandlerContext;
    return { shell, lines, signIn };
};

type Call = (params: unknown, shell: HandlerContext) => unknown;
const call = async (name: string, params: unknown, shell: HandlerContext) =>
    (handlers[name as keyof typeof handlers] as Call)(params, shell);

describe('the shell handlers', () => {
    it('hands the config the mobile route functions when the page loads them', () => {
        expect(mobileRoutes.pushTapPath).toBeTypeOf('function');
        expect(mobileRoutes.deepLink).toBeTypeOf('function');
    });

    it('signs in with Google through the sheet, as the app answers OAuthLogin', async () => {
        const { shell, signIn } = context();
        await expect(call('OAuthLogin', { provider: 'google' }, shell)).resolves.toEqual({
            result: { provider: 'google', platform: 'ios', idToken: 'id-token' },
        });
        expect(signIn).toHaveBeenCalledOnce();
    });

    it('refuses Apple sign-in with the code the web shows its failure for, and says so in the log', async () => {
        const { shell, lines, signIn } = context();
        await expect(call('OAuthLogin', { provider: 'apple' }, shell)).rejects.toMatchObject({
            code: 'OAUTH_LOGIN_ERROR',
            message: APPLE_SIGN_IN_UNSUPPORTED,
        });
        expect(signIn).not.toHaveBeenCalled();
        expect(lines).toEqual([expect.objectContaining({ source: 'unsupported', type: 'OAuthLogin' })]);
    });

    it('keeps a writable preference, and refuses a bad value or a key the app does not let the web write', async () => {
        const { shell } = context();
        await call('SavePreference', { key: 'theme', value: 'dark' }, shell);
        await expect(call('FetchPreference', { key: 'theme' }, shell)).resolves.toEqual({
            key: 'theme',
            value: 'dark',
        });
        await expect(call('SavePreference', { key: 'theme', value: 'pink' }, shell)).rejects.toMatchObject({
            code: 'PREF_INVALID_VALUE',
        });
        await expect(call('SavePreference', { key: 'debugSettings', value: {} }, shell)).rejects.toMatchObject({
            code: 'PREF_KEY_NOT_WRITABLE',
        });
    });

    it("answers the app's state as the shell has it", async () => {
        await expect(call('FetchBackgroundStatus', {}, context().shell)).resolves.toEqual({
            status: 'background',
            isForeground: false,
            isBackground: true,
        });
    });

    it('leaves the badge to the shell, which draws it', () => {
        expect(handlers).not.toHaveProperty('SetBadgeCount');
    });

    it('answers the boot messages for the phone the shell shows', async () => {
        await expect(call('CheckAppUpdate', {}, context('android').shell)).resolves.toMatchObject({
            platform: 'android',
            updateAvailable: false,
        });
    });
});
