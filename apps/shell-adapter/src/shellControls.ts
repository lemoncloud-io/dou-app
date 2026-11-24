import type { HandlerContext } from '@lemoncloud/hybrid-shell';

import { CHECKOUT_STORE_KEY, launch, sandboxChoice, type CheckoutNotice, type CheckoutPlan } from './checkout';

export const USE_WEB_ACTION = 'Switch to web';

export const CHECKOUT_NOTICE_ID = 'dou.checkout-notice';
export const SANDBOX_NOTICE_ID = 'dou.sandbox-notice';

const useWebNotice = (env: string | undefined): string =>
    `In-app product details cannot be loaded in this environment (${env ?? 'unknown'}). Switch the checkout to web to continue.`;

export const LOCAL_NO_PAYMENT_NOTICE = 'Payments cannot be checked against the local backend.';

export const IN_APP_SANDBOX_NOTICE =
    "The real in-app sandbox is set on the device and the store (a store test account in the device's settings, a test build), not here. " +
    'The sandbox switched on here imitates the virtual store, and is checked up to the purchase only. ' +
    "Outside the shell, the app's debug settings switch it (Config › Checkout sandbox); here the shell's choice wins.";

interface NoticeState {
    checkout: CheckoutNotice | undefined;
    sandboxInApp: boolean;
}

export const notices: NoticeState = { checkout: undefined, sandboxInApp: false };

type NoticeShell = Pick<HandlerContext, 'log' | 'notice'>;
type NoticeHandle = HandlerContext['notice'];

let raisedWith: NoticeHandle | undefined;

export const resetNotices = (): void => {
    notices.checkout = undefined;
    notices.sandboxInApp = false;
    raisedWith = undefined;
};

interface ShellApiLike {
    status: () => object;
    options?: { set: (id: string, value: unknown) => Promise<unknown> };
}

const shellApi = (): ShellApiLike | undefined => (globalThis as { virtualShell?: ShellApiLike }).virtualShell;

export const switchToWeb = async (): Promise<unknown> => shellApi()?.options?.set(CHECKOUT_STORE_KEY, 'web');

const storeStillRefused = (plan: CheckoutPlan): boolean =>
    !plan.storeImitated && plan.chosen !== 'web' && plan.chosen !== 'none';

const reconcileNotices = (plan: CheckoutPlan): void => {
    if (notices.checkout && !storeStillRefused(plan)) {
        notices.checkout = undefined;
        raisedWith?.clear(CHECKOUT_NOTICE_ID);
    }
    if (notices.sandboxInApp && !(plan.storeImitated && plan.sandbox)) {
        notices.sandboxInApp = false;
        raisedWith?.clear(SANDBOX_NOTICE_ID);
    }
};

launch.onPlan = reconcileNotices;

export const raiseStoreNotice = (shell: NoticeShell): void => {
    if (notices.checkout) return;
    const kind: CheckoutNotice = launch.env === 'localhost' ? 'local-no-payment' : 'use-web';
    notices.checkout = kind;
    raisedWith = shell.notice;
    const text = kind === 'use-web' ? useWebNotice(launch.env) : LOCAL_NO_PAYMENT_NOTICE;
    shell.log.append({ source: 'unsupported', type: 'checkout.notice', data: { notice: kind, message: text } });
    shell.notice.show({
        id: CHECKOUT_NOTICE_ID,
        text,
        tone: 'warn',
        ...(kind === 'use-web' ? { action: { label: USE_WEB_ACTION, run: switchToWeb } } : {}),
    });
};

export const sayWhereTheSandboxLives = (shell: Pick<HandlerContext, 'notice'>): void => {
    const imitated = launch.plan?.storeImitated === true && launch.plan.sandbox;
    if (imitated === notices.sandboxInApp) return;
    notices.sandboxInApp = imitated;
    raisedWith = shell.notice;
    if (imitated) shell.notice.show({ id: SANDBOX_NOTICE_ID, text: IN_APP_SANDBOX_NOTICE });
    else shell.notice.clear(SANDBOX_NOTICE_ID);
};

const checkoutStatus = (plan: CheckoutPlan | undefined = launch.plan) => ({
    chosen: plan?.chosen,
    declared: plan?.declared,
    storeImitated: plan?.storeImitated ?? false,
    ...(notices.checkout ? { notice: notices.checkout } : {}),
    subscriptionWeb: plan?.harness?.subscriptionWeb ?? 'deployed',
    display: plan?.display,
});

const sandboxStatus = (plan: CheckoutPlan | undefined = launch.plan) => ({
    on: plan?.sandbox ?? false,
    chosen: sandboxChoice(launch.store),
    available: launch.env === 'dev',
    inAppNotice: notices.sandboxInApp,
});

export const extendShellApi = <T extends ShellApiLike>(api: T): T => {
    const coreStatus = api.status.bind(api);
    return Object.assign(api, {
        status: () => ({ ...coreStatus(), checkout: checkoutStatus(), sandbox: sandboxStatus() }),
    });
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
