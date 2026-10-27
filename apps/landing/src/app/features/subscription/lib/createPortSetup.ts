import { createMockPort, type MockController } from './mock';

import type { Clock, SubscriptionPort } from './port';

export interface PortSetup {
    port: SubscriptionPort;
    clock: Clock;
    /** Present only when the port is the mock: turns on the dev panel and the stand-in pages. */
    mock?: MockController;
}

/**
 * The port the subscription pages run on. There is no server yet, so it is always the mock; the
 * HTTP implementation, when it exists, is chosen here and nothing else changes.
 */
export const createPortSetup = (): PortSetup => {
    const { port, clock, controller } = createMockPort();
    return { port, clock, mock: controller };
};
