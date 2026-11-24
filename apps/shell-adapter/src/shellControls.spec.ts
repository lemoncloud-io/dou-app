import { CHECKOUT_STORE_KEY, checkoutPlan, launch, SANDBOX_STORE_KEY, type ShellCheckoutChoice } from './checkout';
import {
    extendShellApi,
    IN_APP_SANDBOX_NOTICE,
    installShellControls,
    notices,
    resetNotices,
    switchToWeb,
} from './shellControls';

const api = () => ({
    status: vi.fn(() => ({ handshake: 'ready' })),
    app: { restart: vi.fn(async () => ({ ok: true })) },
});

const launchOn = (
    env: 'dev' | 'prod' | 'localhost',
    choice: ShellCheckoutChoice,
    kept = new Map<string, unknown>()
) => {
    launch.env = env;
    launch.choice = choice;
    launch.platform = 'ios';
    launch.store = kept;
    launch.plan = checkoutPlan({ env, choice, platform: 'ios', sandbox: kept.get(SANDBOX_STORE_KEY) === true });
};

afterEach(() => {
    launch.env = undefined;
    launch.choice = undefined;
    launch.plan = undefined;
    launch.store = undefined;
    resetNotices();
    vi.unstubAllGlobals();
});

describe('virtualShell.status', () => {
    it("adds what the shell declared for checkout and the sandbox to the core's status", () => {
        launchOn('dev', 'store');
        const shell = extendShellApi(api());
        expect(shell.status()).toMatchObject({
            handshake: 'ready',
            checkout: { chosen: 'store', declared: ['apple'], storeImitated: true, subscriptionWeb: 'deployed' },
            sandbox: { on: false, available: true, inAppNotice: false },
        });
    });

    it('carries the store notice once it was raised', () => {
        launchOn('prod', 'store');
        notices.checkout = 'use-web';
        expect(extendShellApi(api()).status()).toMatchObject({
            checkout: { declared: ['apple'], storeImitated: false, notice: 'use-web' },
            sandbox: { available: false },
        });
    });
});

describe('virtualShell.checkout.set', () => {
    it('keeps the choice and relaunches the app to apply it', async () => {
        const kept = new Map<string, unknown>();
        launchOn('dev', 'store', kept);
        const shell = extendShellApi(api());
        await expect(shell.checkout.set('web')).resolves.toMatchObject({
            ok: true,
            inAppNotice: false,
            checkout: { chosen: 'web', declared: ['web'] },
        });
        expect(kept.get(CHECKOUT_STORE_KEY)).toBe('web');
        expect(shell.app.restart).toHaveBeenCalledOnce();
    });

    it('refuses a value it does not know', async () => {
        launchOn('dev', 'store');
        const shell = extendShellApi(api());
        await expect(shell.checkout.set('paypal' as ShellCheckoutChoice)).resolves.toMatchObject({ ok: false });
        expect(shell.app.restart).not.toHaveBeenCalled();
    });

    it('says where the real in-app sandbox lives when the store is picked with the sandbox on', async () => {
        const draw = vi.fn();
        launchOn('dev', 'web', new Map<string, unknown>([[SANDBOX_STORE_KEY, true]]));
        const shell = extendShellApi(api(), draw);
        await expect(shell.checkout.set('store')).resolves.toMatchObject({ ok: true, inAppNotice: true });
        expect(draw).toHaveBeenCalledWith({ id: 'sandbox', text: IN_APP_SANDBOX_NOTICE });

        await expect(shell.checkout.set('web')).resolves.toMatchObject({ inAppNotice: false });
        expect(notices.sandboxInApp).toBe(false);
    });
});

describe('virtualShell.sandbox.set', () => {
    it('shows the in-app sandbox notice for a store checkout, not for the web', async () => {
        const draw = vi.fn();
        launchOn('dev', 'store');
        const shell = extendShellApi(api(), draw);
        await expect(shell.sandbox.set(true)).resolves.toMatchObject({
            ok: true,
            inAppNotice: true,
            sandbox: { on: true, chosen: true },
        });
        expect(draw).toHaveBeenCalledOnce();

        draw.mockReset();
        resetNotices();
        launchOn('dev', 'web');
        await expect(shell.sandbox.set(true)).resolves.toMatchObject({ ok: true, inAppNotice: false });
        expect(draw).not.toHaveBeenCalled();
        expect(launch.store?.get(SANDBOX_STORE_KEY)).toBe(true);
    });

    it('refuses to switch it on against prod or localhost, and relaunches nothing', async () => {
        for (const env of ['prod', 'localhost'] as const) {
            const kept = new Map<string, unknown>();
            launchOn(env, 'web', kept);
            const shell = extendShellApi(api());
            await expect(shell.sandbox.set(true)).resolves.toMatchObject({ ok: false, error: 'refused' });
            expect(kept.has(SANDBOX_STORE_KEY)).toBe(false);
            expect(shell.app.restart).not.toHaveBeenCalled();
        }
    });
});

describe('switchToWeb', () => {
    it('keeps web as the checkout and relaunches through the shell page', async () => {
        const kept = new Map<string, unknown>();
        launchOn('prod', 'store', kept);
        const shell = api();
        vi.stubGlobal('virtualShell', shell);
        await switchToWeb();
        expect(kept.get(CHECKOUT_STORE_KEY)).toBe('web');
        expect(shell.app.restart).toHaveBeenCalledOnce();
    });
});

describe('installShellControls', () => {
    it('extends virtualShell when the shell page sets it later', () => {
        const page: { virtualShell?: ReturnType<typeof api> & { checkout?: unknown } } = {};
        installShellControls(page);
        page.virtualShell = api();
        expect(page.virtualShell.checkout).toBeDefined();
    });

    it('extends one that is there already', () => {
        const page = { virtualShell: api() as ReturnType<typeof api> & { sandbox?: unknown } };
        installShellControls(page);
        expect(page.virtualShell.sandbox).toBeDefined();
    });
});
