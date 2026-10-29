import { type ComponentType, type ReactNode } from 'react';

import { subscriptionServer, type SubscriptionServer } from '../../../config/subscriptionServer';
import { createCatalogPort } from './catalogPort';
import { createMockPort, type MockController } from './mock';
import { SubscriptionPortError, systemClock, type Clock, type PortSupports, type SubscriptionPort } from './port';
import { HTTP_METHODS, type HttpMethod, type HttpPort, type HttpSetup, createHttpSetup } from './port/http';

export interface PortSetup {
    port: SubscriptionPort;
    clock: Clock;
    /** What the port really answers; everything when omitted (see `PortSupports`). */
    supports?: PortSupports;
    /** Present only when the port is the mock: turns on the dev panel and the stand-in pages. */
    mock?: MockController;
    /** Wraps the routes when the port needs a session host above them. */
    Host?: ComponentType<{ children: ReactNode }>;
}

export type PortMode = 'mock' | 'server';

const MODE_KEY = 'subscription.portMode';

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

const isHttpMethod = (method: keyof SubscriptionPort): method is HttpMethod =>
    (HTTP_METHODS as ReadonlyArray<keyof SubscriptionPort>).includes(method);

/**
 * The whole port over the server: its methods from the HTTP port, and every other one refusing. Nothing
 * stands in for a method with no server — the screens leave out what would call it (`supports`). The
 * catalog port is the list of every method, since it implements each one.
 */
export const serverPortOf = (http: HttpPort): SubscriptionPort => {
    const refusing = Object.fromEntries(
        Object.keys(createCatalogPort()).map(method => [
            method,
            () => Promise.reject(new SubscriptionPortError('conflict', `no server for ${method} yet`)),
        ])
    ) as unknown as SubscriptionPort;
    return { ...refusing, ...http };
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
 * - Otherwise a tab runs on the server alone (`portModeOf` for switching a tab to the mock alone). The
 *   methods with no server yet refuse, and `supports` tells the screens which they are.
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
    createHttp?: (server: SubscriptionServer) => HttpSetup;
}): PortSetup => {
    if (!account) return { port: createCatalogPort(), clock: systemClock };
    const mode = server ? portModeOf(search, readMode()) : 'mock';
    if (server) saveMode(mode);
    if (mode === 'mock' || !server) {
        const mock = createMockPort();
        return { port: mock.port, clock: mock.clock, mock: mock.controller };
    }

    const http = createHttp(server);
    return {
        port: serverPortOf(http.port),
        clock: systemClock,
        supports: isHttpMethod,
        Host: http.Host,
    };
};
