import type { HandlerContext } from '@lemoncloud/hybrid-shell';

import {
    CHECKOUT_STORE_KEY,
    checkoutPlan,
    launch,
    SANDBOX_STORE_KEY,
    SHELL_CHECKOUT_CHOICES,
    sandboxChoice,
    subscriptionWebChoice,
    type CheckoutNotice,
    type CheckoutPlan,
    type ShellCheckoutChoice,
} from './checkout';

export const USE_WEB_ACTION = 'Switch to web';

export const useWebNotice = (env: string | undefined): string =>
    `In-app product details cannot be loaded in this environment (${env ?? 'unknown'}). Switch the checkout to web to continue.`;

export const LOCAL_NO_PAYMENT_NOTICE = 'Payments cannot be checked against the local backend.';

export const IN_APP_SANDBOX_NOTICE =
    "The real in-app sandbox is set on the device and the store (a store test account in the device's settings, a test build), not here. " +
    'The sandbox switched on here imitates the virtual store, and is checked up to the purchase only.';

export interface NoticeCard {
    id: 'checkout' | 'sandbox';
    text: string;
    action?: { label: string; run: () => unknown };
}

interface NoticeState {
    checkout: CheckoutNotice | undefined;
    sandboxInApp: boolean;
}

export const notices: NoticeState = { checkout: undefined, sandboxInApp: false };

export const resetNotices = (): void => {
    notices.checkout = undefined;
    notices.sandboxInApp = false;
};

const CARD_ID = (id: NoticeCard['id']) => `dou-shell-notice-${id}`;

export const drawNotice = (card: NoticeCard, doc: Document | undefined = globalThis.document): void => {
    if (!doc?.body) return;
    doc.getElementById(CARD_ID(card.id))?.remove();
    const box = doc.createElement('div');
    box.id = CARD_ID(card.id);
    box.setAttribute('role', 'status');
    box.style.cssText =
        'position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:360px;padding:12px 14px;' +
        'border-radius:10px;background:#1f2937;color:#f9fafb;font:13px/1.45 system-ui,sans-serif;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:8px';
    if (card.id === 'sandbox') box.style.bottom = '120px';
    const text = doc.createElement('div');
    text.textContent = card.text;
    box.append(text);
    const row = doc.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const button = (label: string, onClick: () => void) => {
        const el = doc.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.style.cssText =
            'border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;background:#374151;color:inherit';
        el.addEventListener('click', onClick);
        row.append(el);
        return el;
    };
    if (card.action) {
        const { label, run } = card.action;
        button(label, () => {
            box.remove();
            void run();
        }).style.background = '#2563eb';
    }
    button('Close', () => box.remove());
    box.append(row);
    doc.body.append(box);
};

export interface ShellApiLike {
    status: () => object;
    app: { restart: (options?: { cold?: boolean }) => Promise<unknown> };
}

const shellApi = (): ShellApiLike | undefined => (globalThis as { virtualShell?: ShellApiLike }).virtualShell;

const relaunch = async (): Promise<unknown> => shellApi()?.app.restart();

export const switchToWeb = async (): Promise<unknown> => {
    launch.store?.set(CHECKOUT_STORE_KEY, 'web');
    return relaunch();
};

const isStoreChoice = (choice: ShellCheckoutChoice | undefined): boolean =>
    choice === 'store' || choice === 'apple' || choice === 'google';

export const raiseStoreNotice = (shell: Pick<HandlerContext, 'log'>, draw = drawNotice): void => {
    if (notices.checkout) return;
    const kind: CheckoutNotice = launch.env === 'localhost' ? 'local-no-payment' : 'use-web';
    notices.checkout = kind;
    const text = kind === 'use-web' ? useWebNotice(launch.env) : LOCAL_NO_PAYMENT_NOTICE;
    shell.log.append({ source: 'unsupported', type: 'checkout.notice', data: { notice: kind, message: text } });
    draw({
        id: 'checkout',
        text,
        ...(kind === 'use-web' ? { action: { label: USE_WEB_ACTION, run: switchToWeb } } : {}),
    });
};

const showInAppSandboxNotice = (draw: typeof drawNotice): void => {
    notices.sandboxInApp = true;
    draw({ id: 'sandbox', text: IN_APP_SANDBOX_NOTICE });
};

const currentPlan = (): CheckoutPlan | undefined => launch.plan;

export const checkoutStatus = (plan: CheckoutPlan | undefined = currentPlan()) => {
    return {
        chosen: plan?.chosen,
        declared: plan?.declared,
        storeImitated: plan?.storeImitated ?? false,
        ...(notices.checkout ? { notice: notices.checkout } : {}),
        subscriptionWeb: plan?.harness?.subscriptionWeb ?? 'deployed',
        display: plan?.display,
    };
};

export const sandboxStatus = (plan: CheckoutPlan | undefined = currentPlan()) => ({
    on: plan?.sandbox ?? false,
    chosen: sandboxChoice(launch.store),
    available: launch.env === 'dev',
    inAppNotice: notices.sandboxInApp,
});

type Refusal = { ok: false; error: 'refused'; message: string };
const refuse = (message: string): Refusal => ({ ok: false, error: 'refused', message });

const pendingPlan = (store: Map<string, unknown>): CheckoutPlan =>
    checkoutPlan({
        env: launch.env,
        choice: (store.get(CHECKOUT_STORE_KEY) as ShellCheckoutChoice | undefined) ?? launch.choice ?? 'store',
        platform: launch.platform,
        sandbox: sandboxChoice(store),
        subscriptionWeb: subscriptionWebChoice(store),
    });

export const shellControls = (draw = drawNotice, restart: () => Promise<unknown> = relaunch) => ({
    checkout: {
        set: async (choice: ShellCheckoutChoice) => {
            if (!(SHELL_CHECKOUT_CHOICES as readonly unknown[]).includes(choice)) {
                return refuse(`'${String(choice)}' is not one of ${SHELL_CHECKOUT_CHOICES.join(', ')}`);
            }
            const store = launch.store;
            if (!store) return refuse('the app has not launched yet');
            store.set(CHECKOUT_STORE_KEY, choice);
            const next = pendingPlan(store);
            const inAppNotice = isStoreChoice(choice) && next.sandbox;
            if (inAppNotice) showInAppSandboxNotice(draw);
            else notices.sandboxInApp = false;
            await restart();
            return { ok: true as const, checkout: checkoutStatus(next), inAppNotice };
        },
        status: () => checkoutStatus(),
    },
    sandbox: {
        set: async (on: boolean) => {
            const store = launch.store;
            if (!store) return refuse('the app has not launched yet');
            if (on && launch.env === 'prod') return refuse('the sandbox cannot be switched on against prod');
            if (on && launch.env === 'localhost') return refuse(LOCAL_NO_PAYMENT_NOTICE);
            store.set(SANDBOX_STORE_KEY, on === true);
            const choice = (store.get(CHECKOUT_STORE_KEY) as ShellCheckoutChoice | undefined) ?? launch.choice;
            const inAppNotice = on === true && isStoreChoice(choice);
            if (inAppNotice) showInAppSandboxNotice(draw);
            else notices.sandboxInApp = false;
            const next = pendingPlan(store);
            await restart();
            return { ok: true as const, sandbox: sandboxStatus(next), inAppNotice };
        },
        status: () => sandboxStatus(),
    },
});

export const extendShellApi = <T extends ShellApiLike>(api: T, draw = drawNotice) => {
    const coreStatus = api.status.bind(api);
    return Object.assign(
        api,
        shellControls(draw, () => api.app.restart()),
        {
            status: () => ({ ...coreStatus(), checkout: checkoutStatus(), sandbox: sandboxStatus() }),
        }
    );
};

export const installShellControls = (target: object = globalThis): void => {
    const holder = target as { virtualShell?: ShellApiLike };
    if (holder.virtualShell) {
        extendShellApi(holder.virtualShell);
        return;
    }
    Object.defineProperty(target, 'virtualShell', {
        configurable: true,
        enumerable: true,
        get: () => undefined,
        set: (api: ShellApiLike) => {
            Object.defineProperty(target, 'virtualShell', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: api && typeof api.status === 'function' ? extendShellApi(api) : api,
            });
        },
    });
};
