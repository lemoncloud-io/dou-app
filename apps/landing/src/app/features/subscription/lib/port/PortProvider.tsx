import { type JSX, type ReactNode, createContext, useContext } from 'react';

import type { SubscriptionPort } from './SubscriptionPort';

export interface Clock {
    now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

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

export const useToday = (): Date => usePortContext().clock.now();

export const useSupports = (): PortSupports => usePortContext().supports;
