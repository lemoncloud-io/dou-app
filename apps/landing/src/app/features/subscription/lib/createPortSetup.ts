import { createCatalogPort } from './catalogPort';
import { createMockPort, type MockController } from './mock';
import { systemClock, type Clock, type SubscriptionPort } from './port';

export interface PortSetup {
    port: SubscriptionPort;
    clock: Clock;
    /** Present only when the port is the mock: turns on the dev panel and the stand-in pages. */
    mock?: MockController;
}

/**
 * The port the subscription pages run on. Where the account surface is open there is no server yet,
 * so it is the mock; where it is shut it is the catalog port, which knows the plans and nothing else.
 * The HTTP implementation, when it exists, is chosen here and nothing else changes.
 *
 * The mock is only created where it is used: it reads the URL and session storage as it starts, and
 * on the production host neither should happen.
 */
export const createPortSetup = ({ account }: { account: boolean }): PortSetup => {
    if (!account) return { port: createCatalogPort(), clock: systemClock };
    const { port, clock, controller } = createMockPort();
    return { port, clock, mock: controller };
};
