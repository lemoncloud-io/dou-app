import type { HandlerContext } from '@lemoncloud/hybrid-shell';

import { launch } from './checkout';
import handlers, { APP_SCHEME_OPEN_UNSUPPORTED, APPLE_SIGN_IN_UNSUPPORTED, STORE_NOT_IMITATED } from './handlers';
import { mobileRoutes } from './routes';

const context = (platform: 'ios' | 'android' = 'ios') => {
    const lines: Array<{ source: string; type: string }> = [];
    const signIn = vi.fn(async () => ({ provider: 'google' as const, platform, idToken: 'id-token' }));
    const shell = {
        device: { platform },
        store: new Map<string, unknown>(),
        log: { append: (line: { source: string; type: string }) => void lines.push(line) },
        auth: { signIn },
        notify: vi.fn(() => true),
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

    describe('OpenURL', () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('opens a web link in a new tab, cut off from the shell page', async () => {
            const tab = { opener: 'shell' as unknown, location: { href: 'about:blank' } };
            const open = vi.fn(() => tab);
            vi.stubGlobal('open', open);
            const { shell } = context();

            await expect(call('OpenURL', { url: 'https://example.com/report.json' }, shell)).resolves.toEqual({});
            expect(open).toHaveBeenCalledWith('about:blank', '_blank');
            expect(tab.opener).toBeNull();
            expect(tab.location.href).toBe('https://example.com/report.json');
        });

        it('refuses a scheme the app refuses, with its code, and opens nothing', async () => {
            const open = vi.fn();
            vi.stubGlobal('open', open);
            const { shell } = context();

            await expect(call('OpenURL', { url: 'javascript:alert(1)' }, shell)).rejects.toMatchObject({
                code: 'LINK_NOT_ALLOWED',
            });
            expect(open).not.toHaveBeenCalled();
        });

        it("points the app's own scheme at the shell's link tool rather than a tab", async () => {
            const open = vi.fn();
            vi.stubGlobal('open', open);
            const { shell, lines } = context();

            await expect(call('OpenURL', { url: 'chatic-dev://channels/1' }, shell)).rejects.toMatchObject({
                code: 'LINK_ERROR',
                message: APP_SCHEME_OPEN_UNSUPPORTED,
            });
            expect(open).not.toHaveBeenCalled();
            expect(lines).toEqual([expect.objectContaining({ source: 'unsupported', type: 'OpenURL' })]);
        });

        it('fails when the browser blocks the tab, instead of reporting it opened', async () => {
            vi.stubGlobal(
                'open',
                vi.fn(() => null)
            );
            const { shell } = context();

            await expect(call('OpenURL', { url: 'https://example.com' }, shell)).rejects.toMatchObject({
                code: 'LINK_ERROR',
            });
        });
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

    it('leaves the badge to the shell, which draws it', () => {
        expect(handlers).not.toHaveProperty('SetBadgeCount');
    });

    it('answers the boot messages for the phone the shell shows', async () => {
        await expect(call('CheckAppUpdate', {}, context('android').shell)).resolves.toMatchObject({
            platform: 'android',
            updateAvailable: false,
        });
    });

    describe('the virtual store', () => {
        afterEach(() => {
            launch.env = undefined;
            launch.choice = undefined;
            vi.useRealTimers();
        });

        it('refuses every store call at once, and logs it, when no store was picked', async () => {
            const { shell, lines } = context();
            launch.env = 'dev';

            await expect(call('FetchProducts', {}, shell)).rejects.toMatchObject({
                code: 'NOT_FOUND',
                message: STORE_NOT_IMITATED,
            });
            await expect(call('Purchase', { id: 'p' }, shell)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(shell.notify).toHaveBeenCalledWith('OnPurchaseError', {
                error: { code: 'iap-not-available', message: STORE_NOT_IMITATED },
            });
            expect(lines.map(line => line.type)).toEqual(['FetchProducts', 'Purchase']);
        });

        it('never answers on prod, even with a store picked', async () => {
            const { shell } = context();
            launch.env = 'prod';
            launch.choice = 'apple';

            await expect(call('FetchProducts', {}, shell)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(call('Purchase', { id: 'p' }, shell)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            const sent = (shell.notify as ReturnType<typeof vi.fn>).mock.calls.map(([name]) => name);
            expect(sent).toEqual(['OnPurchaseError']);
        });

        it('sells on dev: a catalog, then a purchase that succeeds with a fake receipt, kept until finished', async () => {
            vi.useFakeTimers();
            const { shell } = context('android');
            launch.env = 'dev';
            launch.choice = 'google';

            await expect(call('FetchProducts', {}, shell)).resolves.toEqual({ products: expect.any(Array) });
            await expect(call('Purchase', { id: 'dou_pro_subscription' }, shell)).resolves.toEqual({});
            vi.runAllTimers();

            const purchase = (shell.notify as ReturnType<typeof vi.fn>).mock.calls.find(
                ([name]) => name === 'OnPurchaseSuccess'
            )?.[1].purchase;
            expect(purchase).toMatchObject({
                productId: 'dou_pro_subscription',
                purchaseToken: expect.stringMatching(/^virtual-receipt-/),
            });
            await expect(call('FetchCurrentPurchases', {}, shell)).resolves.toEqual({ purchases: [purchase] });

            await expect(call('FinishPurchaseTransaction', { purchase }, shell)).resolves.toEqual({ purchase });
            await expect(call('FetchCurrentPurchases', {}, shell)).resolves.toEqual({ purchases: [] });
        });
    });
});
