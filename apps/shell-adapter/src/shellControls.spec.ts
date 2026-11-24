import type { HandlerContext, ProtocolPreset } from '@lemoncloud/hybrid-shell';

import {
    CHECKOUT_STORE_KEY,
    checkoutPlan,
    launch,
    SANDBOX_STORE_KEY,
    withCheckoutDeclaration,
    type ShellCheckoutChoice,
} from './checkout';
import {
    CHECKOUT_NOTICE_ID,
    extendShellApi,
    IN_APP_SANDBOX_NOTICE,
    installShellControls,
    LOCAL_NO_PAYMENT_NOTICE,
    notices,
    raiseStoreNotice,
    resetNotices,
    SANDBOX_NOTICE_ID,
    sayWhereTheSandboxLives,
    switchToWeb,
    USE_WEB_ACTION,
} from './shellControls';

const preset = { name: 'test', globals: () => '' } as unknown as ProtocolPreset;

const api = () => ({
    status: vi.fn(() => ({ handshake: 'ready' })),
    options: { set: vi.fn(async () => ({ ok: true })) },
});

const noticeShell = () => {
    const lines: Array<{ type: string }> = [];
    const shell = {
        log: { append: (line: { type: string }) => void lines.push(line) },
        notice: { show: vi.fn(), clear: vi.fn() },
    } as unknown as Pick<HandlerContext, 'log' | 'notice'>;
    return { shell, lines, show: shell.notice.show as ReturnType<typeof vi.fn>, clear: shell.notice.clear };
};

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

    it('leaves picking to the core, which draws the options on its panel', () => {
        const shell = extendShellApi(api()) as object;
        expect(shell).not.toHaveProperty('checkout');
        expect(shell).not.toHaveProperty('sandbox');
    });
});

describe('raiseStoreNotice', () => {
    it('raises it on the shell page, once, with a switch to web off localhost only', () => {
        const { shell, show, lines } = noticeShell();
        launchOn('prod', 'store');
        raiseStoreNotice(shell);
        raiseStoreNotice(shell);
        expect(show).toHaveBeenCalledOnce();
        expect(show.mock.calls[0][0]).toMatchObject({
            id: CHECKOUT_NOTICE_ID,
            tone: 'warn',
            action: { label: USE_WEB_ACTION },
        });
        expect(show.mock.calls[0][0].text).toContain('(prod)');
        expect(lines.map(line => line.type)).toEqual(['checkout.notice']);

        resetNotices();
        show.mockReset();
        launchOn('localhost', 'store');
        raiseStoreNotice(shell);
        expect(show.mock.calls[0][0]).toEqual({ id: CHECKOUT_NOTICE_ID, text: LOCAL_NO_PAYMENT_NOTICE, tone: 'warn' });
        expect(notices.checkout).toBe('local-no-payment');
    });

    it('switches to web through the core option, which relaunches', async () => {
        const core = api();
        vi.stubGlobal('virtualShell', core);
        const { shell, show } = noticeShell();
        launchOn('prod', 'store');
        raiseStoreNotice(shell);
        await show.mock.calls[0][0].action.run();
        expect(core.options.set).toHaveBeenCalledWith(CHECKOUT_STORE_KEY, 'web');
    });
});

describe('switchToWeb', () => {
    it('does nothing when the core has no options', async () => {
        vi.stubGlobal('virtualShell', { status: () => ({}) });
        await expect(switchToWeb()).resolves.toBeUndefined();
    });
});

describe('reconcileNotices at each launch', () => {
    const relaunchWith = (env: 'dev' | 'prod' | 'localhost', choice: ShellCheckoutChoice, sandbox = false) =>
        withCheckoutDeclaration(preset).globals(
            ...([
                {},
                { platform: 'ios' },
                env,
                new Map<string, unknown>([
                    [CHECKOUT_STORE_KEY, choice],
                    [SANDBOX_STORE_KEY, sandbox],
                ]),
            ] as unknown as Parameters<ProtocolPreset['globals']>)
        );

    it('takes the store notice down, and lets it be raised again, once the checkout is web', () => {
        const { shell, show, clear } = noticeShell();
        launchOn('prod', 'store');
        raiseStoreNotice(shell);

        relaunchWith('prod', 'web');
        expect(clear).toHaveBeenCalledWith(CHECKOUT_NOTICE_ID);
        expect(notices.checkout).toBeUndefined();

        relaunchWith('prod', 'store');
        raiseStoreNotice(shell);
        expect(show).toHaveBeenCalledTimes(2);
    });

    it('keeps the store notice while the store is still refused', () => {
        const { shell, clear } = noticeShell();
        launchOn('prod', 'store');
        raiseStoreNotice(shell);
        relaunchWith('prod', 'legacy');
        expect(clear).not.toHaveBeenCalled();
        expect(notices.checkout).toBe('use-web');
    });

    it('takes the in-app sandbox notice down when the checkout leaves the virtual store', () => {
        const { shell, clear } = noticeShell();
        launchOn('dev', 'store', new Map<string, unknown>([[SANDBOX_STORE_KEY, true]]));
        sayWhereTheSandboxLives(shell);

        relaunchWith('dev', 'web', true);
        expect(clear).toHaveBeenCalledWith(SANDBOX_NOTICE_ID);
        expect(extendShellApi(api()).status()).toMatchObject({ sandbox: { inAppNotice: false } });
    });
});

describe('sayWhereTheSandboxLives', () => {
    it('shows the in-app sandbox notice once while the virtual store runs with the sandbox, and takes it down after', () => {
        const { shell, show, clear } = noticeShell();
        launchOn('dev', 'store', new Map<string, unknown>([[SANDBOX_STORE_KEY, true]]));
        sayWhereTheSandboxLives(shell);
        sayWhereTheSandboxLives(shell);
        expect(show).toHaveBeenCalledOnce();
        expect(show).toHaveBeenCalledWith({ id: SANDBOX_NOTICE_ID, text: IN_APP_SANDBOX_NOTICE });
        expect(notices.sandboxInApp).toBe(true);

        launchOn('dev', 'store');
        sayWhereTheSandboxLives(shell);
        expect(clear).toHaveBeenCalledWith(SANDBOX_NOTICE_ID);
        expect(notices.sandboxInApp).toBe(false);
    });

    it('says nothing for a web checkout or without the sandbox', () => {
        const { shell, show, clear } = noticeShell();
        launchOn('dev', 'web', new Map<string, unknown>([[SANDBOX_STORE_KEY, true]]));
        sayWhereTheSandboxLives(shell);
        launchOn('dev', 'store');
        sayWhereTheSandboxLives(shell);
        expect(show).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
    });
});

describe('installShellControls', () => {
    it('extends virtualShell when the shell page sets it later', () => {
        const page: { virtualShell?: ReturnType<typeof api> } = {};
        installShellControls(page);
        page.virtualShell = api();
        expect(page.virtualShell.status()).toHaveProperty('checkout');
    });

    it('extends one that is there already', () => {
        const page = { virtualShell: api() };
        installShellControls(page);
        expect(page.virtualShell.status()).toHaveProperty('sandbox');
    });
});
