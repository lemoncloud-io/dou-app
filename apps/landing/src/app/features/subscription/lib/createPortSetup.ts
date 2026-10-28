import { type ComponentType, type ReactNode } from 'react';

import { subscriptionServer, type SubscriptionServer } from '../../../config/subscriptionServer';
import { createCatalogPort } from './catalogPort';
import { createMockPort, type MockController, type MockSetup } from './mock';
import { sessionStateStore } from './mock/storage';
import { systemClock, type Clock, type SubscriptionPort } from './port';
import { HTTP_METHODS, type HttpPort, type HttpSetup, type PaymentWindow, createHttpSetup } from './port/http';

import type { CardToken } from '../types';

export interface PortSetup {
    port: SubscriptionPort;
    clock: Clock;
    /** Present only when the port is the mock: turns on the dev panel and the stand-in pages. */
    mock?: MockController;
    /**
     * The mock behind a composed port: the stand-in payment window is drawn from it, nothing else —
     * no dev panel, no stand-in sign-in.
     */
    standIn?: MockController;
    /** Wraps the routes when the port needs a session host above them. */
    Host?: ComponentType<{ children: ReactNode }>;
}

export type PortMode = 'mock' | 'server';

const MODE_KEY = 'subscription.portMode';
/** The composed mock's state, apart from the mock-only tab's, so neither inherits the other's account. */
const COMPOSED_MOCK_KEY = '@landing.subscription.mock.composed';

/**
 * Which port a development tab runs on. The server is the default; `?mock=<scenario>` switches the tab
 * to the mock for screenshots and states the server cannot reach, and `?mock=off` switches it back.
 * The choice holds for the tab, so the reload and the sign-in round trip after it keep it.
 */
export const portModeOf = (search: string, stored: string | null): PortMode => {
    const mock = new URLSearchParams(search).get('mock');
    if (mock === 'off') return 'server';
    if (mock) return 'mock';
    return stored === 'mock' ? 'mock' : 'server';
};

/**
 * One port out of two: the server's methods from the HTTP port, every other one from the mock. The
 * screens see a single port; which of its methods have a server is `HTTP_METHODS`.
 */
export const composePort = (http: HttpPort, rest: SubscriptionPort): SubscriptionPort => ({
    ...rest,
    ...Object.fromEntries(HTTP_METHODS.map(method => [method, http[method]])),
});

/**
 * The payment window while the server's payments are samples: the mock's own stand-in dialog answers,
 * and a card it registers is given a key the sample server accepts.
 */
const standInWindowOf =
    (mock: MockSetup): PaymentWindow =>
    async ({ purpose, planId, payer }) => {
        const result = await mock.port.startPaymentMethodRegistration({ purpose, planId, payer });
        if (result.outcome !== 'registered') return { outcome: result.outcome };
        return { outcome: 'registered', billingKey: `mock-billing-key-${result.card as CardToken}` };
    };

const readMode = (): string | null => {
    try {
        return window.sessionStorage.getItem(MODE_KEY);
    } catch {
        return null;
    }
};

const saveMode = (mode: PortMode): void => {
    try {
        window.sessionStorage.setItem(MODE_KEY, mode);
    } catch {
        // Without storage the choice lasts for this page load only.
    }
};

/**
 * The port the subscription pages run on, chosen here and nowhere else.
 *
 * - Where the account surface is shut it is the catalog port, which knows the plans and nothing else.
 * - Where it is open but the build carries no server addresses, it is the mock, as before there was a
 *   server.
 * - Otherwise a tab runs on the server, composed with the mock for the methods that have no server
 *   yet (`portModeOf` for switching a tab to the mock alone). The mock it composes with is signed in
 *   on the `new` scenario, so the methods it answers have an account to answer for.
 *
 * The mock is only created where it is used: it reads the URL and session storage as it starts, and
 * on the production host neither should happen.
 */
export const createPortSetup = ({
    account,
    server = subscriptionServer ?? null,
    search = window.location.search,
    createHttp = createHttpSetup,
}: {
    account: boolean;
    /** `null`: the build has no server. */
    server?: SubscriptionServer | null;
    search?: string;
    createHttp?: (server: SubscriptionServer, standInWindow: PaymentWindow) => HttpSetup;
}): PortSetup => {
    if (!account) return { port: createCatalogPort(), clock: systemClock };
    const mode = server ? portModeOf(search, readMode()) : 'mock';
    if (server) saveMode(mode);
    if (mode === 'mock' || !server) {
        const mock = createMockPort();
        return { port: mock.port, clock: mock.clock, mock: mock.controller };
    }

    // The composed mock answers for the account signed in to the server, so it starts as a fresh one
    // and is wiped with the server's sign-out; it ignores the URL, which belongs to the mock-only tab.
    const mock = createMockPort({ store: sessionStateStore(undefined, COMPOSED_MOCK_KEY), readSearch: () => '' });
    const fresh = () => mock.controller.setScenario('new');
    const held = mock.controller.peek();
    if (!held.signedIn || held.scenario !== 'new') fresh();
    const http = createHttp(server, standInWindowOf(mock));
    const port = composePort(http.port, mock.port);
    return {
        port: {
            ...port,
            signOut: () => {
                fresh();
                return http.port.signOut();
            },
        },
        // The server's dates are real ones; the mock's pinned today stays with the mock.
        clock: systemClock,
        standIn: server.paymentsMock ? mock.controller : undefined,
        Host: http.Host,
    };
};
