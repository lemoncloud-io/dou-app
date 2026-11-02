import { type ComponentType, type ReactNode } from 'react';

import { subscriptionServer, type SubscriptionServer } from '../../../config/subscriptionServer';
import { createCatalogPort } from './catalogPort';
import { type CardEntryChannel } from './port/cardEntry';
import { type PaymentWindowHost } from './port/standInWindow';
import { SubscriptionPortError, systemClock, type Clock, type PortSupports, type SubscriptionPort } from './port';
import {
    HTTP_METHODS,
    type HttpMethod,
    type HttpPort,
    type HttpSandbox,
    type HttpSetup,
    createHttpSetup,
} from './port/http';

export interface PortSetup {
    port: SubscriptionPort;
    clock: Clock;
    /** What the port really answers; everything when omitted (see `PortSupports`). */
    supports?: PortSupports;
    /** Present where something opens the stand-in card window (`MockPaymentWindow`): sandbox payments. */
    standInWindow?: PaymentWindowHost;
    /** Wraps the routes when the port needs a session host above them. */
    Host?: ComponentType<{ children: ReactNode }>;
    /** Present when the port may ask for a card typed into our own dialog (`CardEntryWindow`). */
    cardEntry?: CardEntryChannel;
    /** Present whenever the port is the server's: the sandbox payments switch and its settings. */
    sandbox?: SandboxSetup;
}

/** The renewal periods a sandboxed start can ask for; `''` is the product's own month. */
export const SANDBOX_INTERVALS = ['', '10m', '1h', '1d'] as const;
export type SandboxInterval = (typeof SANDBOX_INTERVALS)[number];

/**
 * Sandbox payments on a server tab: whether they are on, the renewal period of the next start, and the
 * two switches the dev panel turns. Turning them on or off reloads the page, since the port is made
 * once per page with or without them; the period applies from the next start.
 */
export interface SandboxSetup {
    enabled: boolean;
    interval(): SandboxInterval;
    setInterval(interval: SandboxInterval): void;
    turn(on: boolean): void;
}

const SANDBOX_KEY = 'subscription.sandbox';
const INTERVAL_KEY = 'subscription.sandboxInterval';

/**
 * Whether a server tab runs on sandbox payments: `?sandbox=1` turns them on and `?sandbox=0` off, and
 * the choice holds for the tab. Off unless asked for.
 */
export const sandboxOf = (search: string, stored: string | null): boolean => {
    const asked = new URLSearchParams(search).get('sandbox');
    if (asked === '1') return true;
    if (asked === '0') return false;
    return stored === '1';
};

const isInterval = (value: string | null): value is SandboxInterval =>
    value !== null && (SANDBOX_INTERVALS as readonly string[]).includes(value);

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

const read = (key: string): string | null => {
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const save = (key: string, value: string): void => {
    try {
        window.sessionStorage.setItem(key, value);
    } catch {
        // Without storage the choice lasts for this page load only.
    }
};

/**
 * Takes `?sandbox` out of the address once it is read, so the tab's stored choice is the only one: an
 * address left with it would turn the choice back whenever the reader returned to that entry.
 */
const forgetSandboxQuery = (): void => {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('sandbox')) return;
        url.searchParams.delete('sandbox');
        window.history.replaceState(window.history.state, '', url.toString());
    } catch {
        // The address keeps it; the stored choice says the same thing.
    }
};

/** The panel's switch: stored for the tab, then the page again, since the port is made once per page. */
const turnSandbox = (on: boolean): void => {
    save(SANDBOX_KEY, on ? '1' : '0');
    window.location.reload();
};

/**
 * The port the subscription pages run on, chosen here and nowhere else.
 *
 * - Where the account surface is shut — the production host, or a build without the server's addresses
 *   (`isSubscriptionAccountOpen`) — it is the catalog port, which knows the plans and nothing else.
 * - Otherwise it is the server. The methods with no server yet refuse, and `supports` tells the screens
 *   which they are. There is no in-page mock: the screens run on a real server or not at all, and the
 *   tests bring their own fake.
 * - A server tab may run on sandbox payments (`sandboxOf`): the server's real subscription flow on the
 *   payment server's mock provider, with no card and no charge. Only here, so only where the account
 *   surface is open — never on the production host, whatever its address says — and never with a build
 *   whose addresses are production's (`VITE_ENV=PROD`), even on a development host. The server does not
 *   refuse the query on production, so not sending it there is the first defence.
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
    createHttp?: (server: SubscriptionServer, options: { sandbox?: HttpSandbox }) => HttpSetup;
}): PortSetup => {
    if (!account || !server) return { port: createCatalogPort(), clock: systemClock };

    // A build pointed at production's servers has no sandbox, whatever host it runs on.
    const sandboxAllowed = server.env('VITE_ENV') !== 'PROD';
    const enabled = sandboxAllowed && sandboxOf(search, read(SANDBOX_KEY));
    if (sandboxAllowed) {
        save(SANDBOX_KEY, enabled ? '1' : '0');
        forgetSandboxQuery();
    }
    const stored = read(INTERVAL_KEY);
    let current: SandboxInterval = isInterval(stored) ? stored : '';
    const http = createHttp(server, enabled ? { sandbox: { interval: () => current || undefined } } : {});
    return {
        port: serverPortOf(http.port),
        clock: systemClock,
        supports: isHttpMethod,
        Host: http.Host,
        cardEntry: http.cardEntry,
        standInWindow: http.sandboxWindow,
        sandbox: sandboxAllowed
            ? {
                  enabled,
                  interval: () => current,
                  setInterval: next => {
                      current = next;
                      save(INTERVAL_KEY, next);
                  },
                  turn: turnSandbox,
              }
            : undefined,
    };
};
