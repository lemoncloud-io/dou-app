import { ROUTES } from '../../../../../routes/paths';
import { createPaymentPort, failureOf, SubscriptionPortError } from '@chatic/web-checkout';

import type {
    AttemptPurpose,
    HttpPort,
    HttpSandbox,
    PaymentWindow,
    PlanId,
    SignInProvider,
    SubscriptionApi,
} from '@chatic/web-checkout';

export type {
    HttpSandbox,
    PaymentWindow,
    PaymentWindowResult,
    SandboxQuery,
    SubscriptionApi,
} from '@chatic/web-checkout';

export interface SessionAccess {
    user(): Record<string, unknown> | null;
    exchange(provider: SignInProvider, code: string): Promise<void>;
    signOut(): Promise<void>;
}

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface HttpPortOptions {
    socialOauth: string;
    origin: string;
    api: SubscriptionApi;
    session: SessionAccess;
    paymentWindow: PaymentWindow;
    storage: KeyValueStore;
    sandbox?: HttpSandbox;
    now?: () => number;
    nonce?: () => string;
}

const SIGN_IN_KEY = 'subscription.signIn';
const PROVIDER_KEY = 'subscription.signInProvider';
const SIGN_IN_MINUTES = 10;

interface PendingSignIn {
    nonce: string;
    provider: SignInProvider;
    next?: string;
    startedAt: number;
}

const MIN_CODE_LENGTH = 6;

const returnPathOf = (purpose: AttemptPurpose, planId: PlanId | undefined): string =>
    purpose === 'start' && planId
        ? `${ROUTES.subscription.checkoutPayment}?plan=${planId}`
        : ROUTES.subscription.paymentMethods;

const fail = (code: SubscriptionPortError['code'], message?: string, detail?: SubscriptionPortError['detail']) => {
    throw new SubscriptionPortError(code, message, detail);
};

export const createHttpPort = (options: HttpPortOptions): HttpPort => {
    const { session, storage } = options;
    const now = options.now ?? (() => Date.now());
    const nonce = options.nonce ?? (() => Math.random().toString(36).slice(2, 12));
    const { requireSession, setSessionLost, ...payment } = createPaymentPort({
        api: options.api,
        session,
        paymentWindow: options.paymentWindow,
        returnUrl: (purpose, planId) => `${options.origin}${returnPathOf(purpose, planId)}`,
        signInProvider: () => (storage.getItem(PROVIDER_KEY) === 'apple' ? 'apple' : 'google'),
        sandbox: options.sandbox,
        now,
    });

    return {
        ...payment,
        startSignIn: async ({ provider, next }) => {
            const pending: PendingSignIn = { nonce: nonce(), provider, next, startedAt: now() };
            storage.setItem(SIGN_IN_KEY, JSON.stringify(pending));
            const back = `${options.origin}${ROUTES.subscription.loginCallback}?state=${pending.nonce}`;
            return { redirectUrl: `${options.socialOauth}/oauth/${provider}/authorize?redirect=${back}` };
        },

        completeSignIn: async callback => {
            const raw = storage.getItem(SIGN_IN_KEY);
            storage.removeItem(SIGN_IN_KEY);
            let pending: PendingSignIn | undefined;
            try {
                pending = raw ? (JSON.parse(raw) as PendingSignIn) : undefined;
            } catch {
                pending = undefined;
            }
            const detail = pending?.next ? { next: pending.next } : undefined;
            const tooLate = !!pending && now() - pending.startedAt > SIGN_IN_MINUTES * 60_000;
            if (!pending || callback.get('state') !== pending.nonce || tooLate) {
                return fail('signInExpired', 'sign-in record missing, mismatched or too old', detail);
            }
            const code = callback.get('code') ?? '';
            if (code.length < MIN_CODE_LENGTH) return fail('signInCanceled', 'no code came back', detail);
            const provider = callback.get('provider') === 'apple' ? 'apple' : pending.provider;
            try {
                await session.exchange(provider, code);
            } catch (error) {
                const { status } = failureOf(error);
                return fail(status ? 'signInExpired' : 'network', 'code exchange failed', detail);
            }
            setSessionLost(false);
            storage.setItem(PROVIDER_KEY, provider);
            return { account: await requireSession(), next: pending.next };
        },

        signOut: async () => {
            setSessionLost(true);
            storage.removeItem(PROVIDER_KEY);
            await session.signOut();
        },
    };
};
