import type { SessionCommands } from '../session/commands';
import { SESSION_COMMAND_METHODS } from '../bridge/contract';

/**
 * Session commands for a test of something that drives the session through the engine — hand them to
 * the React surface in an engine (`initAppRuntime({ ...coreEngine, commands })`). Each command the test
 * does not pass rejects, naming itself, so a call nobody expected fails loudly instead of answering
 * `undefined`.
 */
export const fakeSessionCommands = (commands: Partial<SessionCommands> = {}): SessionCommands => {
    const unexpected = Object.fromEntries(
        SESSION_COMMAND_METHODS.map(method => [
            method,
            () => Promise.reject(new Error(`[fakeSessionCommands] unexpected command: ${method}`)),
        ])
    ) as unknown as SessionCommands;
    return { ...unexpected, ...commands };
};
