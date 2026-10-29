import { type JSX, type ReactNode, createContext, useContext } from 'react';

import type { SubscriptionPort } from './SubscriptionPort';

/**
 * What "today" is for the screens. The D-Day and scene rules need the same date the data was built
 * against: with a real server that is simply now, while the mock can pin it (`?now=`) so a screenshot
 * reads the same every day. It travels beside the port rather than inside it because it is not a
 * server call.
 */
export interface Clock {
    now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Whether the port really answers a method. Against the server only the methods it has a server for
 * do (`HTTP_METHODS`); the rest reject, and the screens leave out what would call them rather than
 * show a failure for something that cannot work yet.
 */
export type PortSupports = (method: keyof SubscriptionPort) => boolean;

const everything: PortSupports = () => true;

interface PortContextValue {
    port: SubscriptionPort;
    clock: Clock;
    supports: PortSupports;
}

const PortContext = createContext<PortContextValue | null>(null);

export const PortProvider = ({
    port,
    clock = systemClock,
    supports = everything,
    children,
}: {
    port: SubscriptionPort;
    clock?: Clock;
    supports?: PortSupports;
    children: ReactNode;
}): JSX.Element => <PortContext.Provider value={{ port, clock, supports }}>{children}</PortContext.Provider>;

const usePortContext = (): PortContextValue => {
    const value = useContext(PortContext);
    if (!value) throw new Error('usePort: no PortProvider above this component');
    return value;
};

export const usePort = (): SubscriptionPort => usePortContext().port;

/** Today as the data sees it — see `Clock`. Read once per render. */
export const useToday = (): Date => usePortContext().clock.now();

/** See `PortSupports`. */
export const useSupports = (): PortSupports => usePortContext().supports;
